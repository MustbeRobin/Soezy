"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../events/interactionCreate.js"), "utf8");
const modalStart = source.indexOf("// ========== AUTOMOD MODAL HANDLERS ==========");
const modalEnd = source.indexOf("// ========== LOGGING MODAL HANDLERS ==========", modalStart);
const modalHandlers = source.slice(modalStart, modalEnd);
const selectStart = source.indexOf("// ========== AUTOMOD CONFIG SELECT ==========");
const selectEnd = source.indexOf("// ========== ANTILINK CONFIG SELECT ==========", selectStart);
const selectHandlers = source.slice(selectStart, selectEnd);

function branch(sourceText, start, end) {
  const startIndex = sourceText.indexOf(start);
  assert.notEqual(startIndex, -1, `missing branch: ${start}`);
  const endIndex = sourceText.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing branch end: ${end}`);
  return sourceText.slice(startIndex, endIndex);
}

function assertDeferredBefore(sourceText, awaitedWork, ack = "deferUpdate") {
  const ackIndex = sourceText.indexOf(`interaction.${ack}(`);
  const workIndex = sourceText.indexOf(awaitedWork);
  assert.notEqual(ackIndex, -1, `missing interaction.${ack}()`);
  assert.notEqual(workIndex, -1, `missing ${awaitedWork}`);
  assert.ok(ackIndex < workIndex, `interaction must be acknowledged before ${awaitedWork}`);
}

test("slow AutoMod modals acknowledge before Discord rule synchronization", () => {
  const spam = branch(modalHandlers, 'if (action === "spam" || action === "duplicate")', 'if (action === "badwords" || action === "nsfw")');
  assertDeferredBefore(spam, "await soezyNativeAutomod.syncFilters");
  assert.match(spam, /require\("\.\/utils\/automodPunishment"\)\.set\(am, "spam", "timeout"\)/);
  assert.match(spam, /require\("\.\/utils\/automodPunishment"\)\.set\(am, "duplicate", "timeout"\)/);
  assert.doesNotMatch(spam, /require\("\.\.\/utils\/automodPunishment"\)/);
  assert.match(spam, /interaction\.editReply\(/);
  assert.match(spam, /interaction\.followUp\(/);

  const words = branch(modalHandlers, 'if (action === "badwords" || action === "nsfw")', 'if (action === "accountage")');
  assertDeferredBefore(words, "await soezyNativeAutomod.setWordFilter");
  assert.match(words, /interaction\.editReply\(/);
});

test("AutoMod user whitelist modal acknowledges before fetching the user", () => {
  const whitelistStart = modalHandlers.indexOf('if (action === "wluser")');
  assert.notEqual(whitelistStart, -1);
  const whitelistUser = modalHandlers.slice(whitelistStart);
  assertDeferredBefore(whitelistUser, "await interaction.client.users.fetch", "deferReply");
  assert.match(whitelistUser, /interaction\.editReply\(/);
});

test("account-age modal stores the child preference and retained days without changing AutoMod parent state", async () => {
  const databaseSource = fs.readFileSync(path.join(__dirname, "../utils/database.js"), "utf8");
  const syncStart = databaseSource.indexOf("function syncProtectionPreferenceState(");
  const syncEnd = databaseSource.indexOf("globalThis.syncProtectionPreferenceState = syncProtectionPreferenceState;", syncStart);
  assert.ok(syncStart >= 0 && syncEnd > syncStart);
  const submit = branch(modalHandlers, 'if (action === "accountage")', 'if (action === "wlrole")');
  const gd = { automod: { systemEnabled: false, enabled: false, features: {} }, security: { accountAgeDays: 0 } };
  const ctx = require("node:vm").createContext({
    ANTINUKE_EVENTS: [],
    guildData: () => gd,
    getSecurityConfigState: () => gd.security,
    isAuthorizedInteraction: () => true,
    isSessionOwner: () => true,
    notYourPanelReply: () => assert.fail("Owned panel should pass"),
    createErrorContainer: () => ({}),
    saveDB() {},
    buildAutomodConfigContainer: () => ({}),
    MessageFlags: { IsComponentsV2: 32768 },
    action: "accountage", gId: "123456789012345678", parts: ["ammod", "accountage", "owner", "session"],
    interaction: {
      user: { id: "owner" }, fields: { getTextInputValue: key => key === "inp_am_account_enabled" ? "yes" : "21" },
      update: async () => {}, reply: async () => assert.fail("Valid settings should save"),
    },
  });
  require("node:vm").runInContext(databaseSource.slice(syncStart, syncEnd), ctx);
  await require("node:vm").runInContext(`(async () => { ${submit} })()`, ctx);
  assert.equal(gd.accountAge.enabled, true);
  assert.equal(gd.accountAge.minDays, 21);
  assert.equal(gd.automod.features.accountAge.enabled, true);
  assert.equal(gd.automod.systemEnabled, false);

  ctx.interaction.fields.getTextInputValue = key => key === "inp_am_account_enabled" ? "no" : "21";
  await require("node:vm").runInContext(`(async () => { ${submit} })()`, ctx);
  assert.equal(gd.accountAge.enabled, false);
  assert.equal(gd.accountAge.minDays, 21);
  assert.equal(gd.security.savedAccountAgeDays, 21);
  assert.equal(gd.automod.features.accountAge.enabled, false);
  assert.equal(gd.automod.systemEnabled, false);
});

test("AutoMod network-backed dropdown updates defer before their async work", () => {
  for (const [start, end, work] of [
    ['if (action === "antimention")', 'if (action === "anticaps")', "await soezyNativeAutomod.setMentions"],
    ['if (action === "anticaps")', 'if (action === "antiinvite")', "await soezyNativeAutomod.setCaps"],
    ['if (action === "antiinvite")', "const advancedActionMap", "await soezyAdvancedAutomod.setFeature"],
    ["if (advancedActionMap[action])", 'if (action === "antilink" || action === "antibot")', "await soezyAdvancedAutomod.setFeature"],
  ]) {
    assertDeferredBefore(branch(selectHandlers, start, end), work);
  }
  const sharedLinkBotToggle = branch(selectHandlers, 'if (action === "antilink" || action === "antibot")', 'if (["botaction", "botlogs", "botwhitelist", "botunwhitelist"].includes(action))');
  assertDeferredBefore(sharedLinkBotToggle, "await soezyNativeAutomod.syncFilters");
  assert.match(sharedLinkBotToggle, /featureKey = action === "antilink" \? "antiLink" : "antiBot"/);
  assert.match(sharedLinkBotToggle, /am\.features\[featureKey\] = .*enabled/);
});
