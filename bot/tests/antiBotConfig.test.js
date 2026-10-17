"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");

test("legacy AntiBot and AntiLink prefix config entry points stay silent", () => {
  const interactionSource = fs.readFileSync(path.join(root, "events/interactionCreate.js"), "utf8");
  const messageSource = fs.readFileSync(path.join(root, "events/messageCreate.js"), "utf8");
  const helpSource = fs.readFileSync(path.join(root, "utils/embedBuilders/helpEmbeds.js"), "utf8");

  assert.match(interactionSource, /commandName === "antibot"[\s\S]*?buildAutomodConfigContainer\(gId, sessionId, interaction\.user\)/);
  assert.match(interactionSource, /commandName === "antilink"[\s\S]*?buildAutomodConfigContainer\(gId, sessionId, interaction\.user\)/);
  for (const cmd of ["antibot", "badword", "nsfw"]) {
    const route = messageSource.slice(messageSource.indexOf(`cmd === "${cmd}"`));
    assert.match(route, /if \(!subCmd \|\| \["config", "settings", "setup"\]\.includes\(subCmd\)\) return;/);
  }
  const antiLinkRoute = messageSource.slice(messageSource.indexOf('cmd === "antilink"'));
  assert.match(antiLinkRoute, /if \(\["config", "settings", "setup"\]\.includes\(args\[0\]\?\.toLowerCase\(\)\)\) return;/);
  assert.doesNotMatch(messageSource, /`\$\{PREFIX\}(?:antibot|antilink) config`/);
  assert.doesNotMatch(helpSource, /"(?:antilink|antibot) config": "config"/);
  assert.match(helpSource, /value: `amcfg_antibot_\$\{sessionId\}`/);
  assert.match(helpSource, /value: `amcfg_antilink_\$\{sessionId\}`/);
});

test("AutoMod panel exposes bot/domain controls and saves their settings by guild", () => {
  const interactionSource = fs.readFileSync(path.join(root, "events/interactionCreate.js"), "utf8");
  const helpSource = fs.readFileSync(path.join(root, "utils/embedBuilders/helpEmbeds.js"), "utf8");
  for (const action of ["botmanage", "domainmanage"]) {
    assert.ok(helpSource.includes(`amcfg_${action}_`), `missing AutoMod dropdown action ${action}`);
    assert.ok(interactionSource.includes(`"${action}"`), `missing AutoMod handler ${action}`);
  }
  const antibotModalStart = interactionSource.indexOf('if (interaction.isModalSubmit() && interaction.customId.startsWith("abmod_"))');
  const antiLinkModalStart = interactionSource.indexOf('if (interaction.isModalSubmit() && interaction.customId.startsWith("almod_"))');
  const antibotModal = interactionSource.slice(antibotModalStart, antiLinkModalStart);
  const antiLinkModal = interactionSource.slice(antiLinkModalStart, interactionSource.indexOf("// ========== AUTOMOD MODAL HANDLERS ==========", antiLinkModalStart));
  assert.match(antibotModal, /saveDB\(gId\)/);
  assert.match(antibotModal, /isAuthorizedInteraction\(interaction\)/);
  assert.match(antibotModal, /isSessionOwner\(sessionId, interaction\.user\.id\)/);
  assert.match(antibotModal, /buildAutomodConfigContainer\(gId/);
  assert.match(antibotModal, /action === "config"/);
  assert.match(antiLinkModal, /saveDB\(gId\)/);
  assert.match(antiLinkModal, /normalizeDomain\(domainInput\)/);
  assert.match(antiLinkModal, /isSessionOwner\(sessionId, interaction\.user\.id\)/);
  assert.doesNotMatch(antiLinkModal, /saveDB\(\);/);
  assert.match(interactionSource, /action === "antilink"[\s\S]*?setTitle\("Anti-Link Settings"\)/);
  assert.match(interactionSource, /action === "masterenable" \|\| action === "masterdisable"/);
  assert.ok(!fs.existsSync(path.join(root, "commands/config/antibot.js")));
  assert.ok(!fs.existsSync(path.join(root, "commands/config/antilink.js")));
});

test("standalone AntiBot and AntiLink slash config registrations are removed", () => {
  const { loadCommandCollection } = require("../commands/registry");
  const commands = loadCommandCollection();
  assert.equal(commands.has("antibot"), false);
  assert.equal(commands.has("antilink"), false);
  assert.ok(commands.has("automod"));
});
