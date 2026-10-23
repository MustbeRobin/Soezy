"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { buildFilterRules } = require("../utils/nativeFilterRules");

function harness() {
  const gd = {
    automod: { systemEnabled: false, enabled: false, features: { antiSpam: { enabled: true }, duplicate: { enabled: false }, antiBot: { enabled: true } }, antiSpam: { enabled: true }, antiLink: { enabled: true }, advanced: { duplicate: { enabled: false } } },
    security: { enabled: false, accountAgeDays: 14, antiPhishing: true, antiCaps: false, antiZalgo: true, antiDuplicate: false, antiEveryoneBP: true, webhookGuard: false },
    accountAge: { enabled: true, minDays: 14 },
    antibot: { enabled: true }, antilink: { enabled: true }, badWordEnabled: true, nsfwProtection: false,
    nativeAutomod: {},
  };
  const calls = [], saved = [];
  const guild = { id: "123456789012345678", client: {} };
  const features = ["antiPhishing", "antiCaps", "antiZalgo", "antiDuplicate", "antiEveryoneBP", "webhookGuard"];
  const ctx = vm.createContext({
    console, require: id => require(path.resolve(__dirname, "..", id)), db: {}, guildData: () => gd,
    saveDB: () => saved.push(JSON.parse(JSON.stringify(gd))),
    ensureAutomodLogChannel: async () => { calls.push("logs"); return { id: "logs", delete: () => assert.fail("must keep logs") }; },
    setFeatureState: (_id, key, enabled) => {
      gd[key] ||= {}; gd[key].enabled = enabled;
      if (key === "automod") { gd.automod.systemEnabled = enabled; gd.security.enabled = enabled; }
      if (key === "antilink") gd.automod.antiLink = { ...gd.automod.antiLink, enabled };
    },
    getSecurityConfigState: () => gd.security,
    securityConfigFeatureList: () => features.map(key => ({ id: key.toLowerCase(), key })),
    soezyAdvancedAutomod: {
      setFeature: async (_id, key, enabled) => {
        gd.automod.advanced ||= {};
        gd.automod.advanced[key] = { enabled };
      },
    },
    soezyNativeAutomod: {
      syncFilters: async () => { calls.push({ sync: JSON.parse(JSON.stringify(gd)) }); return 5; },
      setManagedRulesEnabled: async (_guild, _deps, enabled) => { calls.push({ nativeEnabled: enabled }); },
    },
  });
  const source = fs.readFileSync(path.join(__dirname, "../events/interactionCreate.js"), "utf8");
  const start = source.indexOf("const automodConfigurationJobs = new Map();");
  const end = source.indexOf("function hasInteractionSecurityWhitelist", start);
  assert.ok(start >= 0 && end > start);
  vm.runInContext(source.slice(start, end), ctx);
  return { gd, calls, saved, guild, ctx, features, configure: enabled => ctx.configureAutomodSystem(guild, enabled) };
}

test("AutoMod disable clears protections and enable does not turn them back on", async () => {
  const h = harness();
  const savedPreferences = JSON.parse(JSON.stringify({
    automod: h.gd.automod.features,
    antiSpam: h.gd.automod.antiSpam.enabled,
    antiLink: h.gd.automod.antiLink.enabled,
    antibot: h.gd.antibot.enabled,
    badWord: h.gd.badWordEnabled,
    nsfw: h.gd.nsfwProtection,
    accountAge: h.gd.accountAge.enabled,
    securityFeatures: Object.fromEntries(h.features.map(feature => [feature, h.gd.security[feature]])),
  }));
  await h.configure(true);
  const synced = h.calls.find(c => c.sync).sync;
  for (const feature of h.features) assert.equal(synced.security[feature], savedPreferences.securityFeatures[feature], feature);
  assert.equal(synced.automod.enabled, true);
  assert.equal(synced.automod.antiSpam.enabled, true);
  assert.equal(synced.automod.antiLink.enabled, true);
  assert.equal(synced.antibot.enabled, true);
  assert.equal(synced.badWordEnabled, true);
  assert.equal(synced.nsfwProtection, false);
  assert.equal(synced.accountAge.enabled, true);
  await h.configure(false);
  assert.equal(h.gd.automod.enabled, false);
  assert.equal(h.gd.antibot.enabled, false);
  assert.equal(h.gd.automod.antiLink.enabled, false);
  assert.equal(h.gd.badWordEnabled, false);
  assert.equal(h.gd.nsfwProtection, false);
  assert.equal(h.gd.accountAge.enabled, false);
  for (const feature of h.features) assert.equal(h.gd.security[feature], false, feature);
  for (const feature of Object.values(h.gd.automod.features)) assert.equal(feature.enabled, false);
  assert.equal(h.calls.at(-1).nativeEnabled, false);
  assert.equal(h.saved.at(-1).automod.enabled, false);
  await h.configure(true);
  assert.equal(h.gd.accountAge.minDays, 14);
  assert.equal(h.gd.security.savedAccountAgeDays, 14);
  assert.equal(h.gd.security.accountAgeDays, 0);
  assert.equal(h.gd.automod.antiSpam.enabled, false);
  assert.equal(h.gd.antibot.enabled, false);
});

test("failed enable leaves saved protections disabled without deleting infrastructure", async () => {
  const h = harness();
  h.ctx.soezyNativeAutomod.syncFilters = async () => { throw new Error("Discord permission denied"); };
  await assert.rejects(h.configure(true), /permission denied/);
  assert.equal(h.gd.automod.enabled, false);
  assert.equal(h.gd.antibot.enabled, true);
  assert.equal(h.gd.antilink.enabled, true);
  assert.equal(h.gd.accountAge.enabled, true);
  assert.equal(h.saved.at(-1).automod.enabled, false);
  assert.equal(h.calls.at(-1).nativeEnabled, false);
});

test("disable saves local state even if Discord rules cannot be synchronized", async () => {
  const h = harness();
  await h.configure(true);
  h.ctx.soezyNativeAutomod.setManagedRulesEnabled = async (_guild, _deps, enabled) => {
    h.calls.push({ nativeEnabled: enabled });
    throw new Error("Discord unavailable");
  };
  await assert.rejects(h.configure(false), /unavailable/);
  assert.equal(h.saved.at(-1).automod.enabled, false);
  assert.equal(h.saved.at(-1).antibot.enabled, false);
  assert.equal(h.saved.at(-1).accountAge.enabled, false);
  assert.equal(h.calls.at(-1).nativeEnabled, false);
});

test("rapid AutoMod enable and disable execute in order with disabled final state", async () => {
  const h = harness();
  await Promise.all([h.configure(true), h.configure(false)]);
  assert.equal(h.gd.automod.enabled, false);
  assert.deepEqual(h.calls.filter(c => c.nativeEnabled !== undefined).map(c => c.nativeEnabled), [false]);
});

test("disabled AutoMod generates no rules even when saved message limits and words remain", () => {
  assert.deepEqual(buildFilterRules({
    automod: { enabled: false }, security: { messageLimit: 10, channelMaxLength: { channel: 5 } },
    badWordEnabled: true, badWordConfig: { action: "block" }, nsfwProtection: true, nsfwConfig: { action: "block" },
    nativeAutomod: { protections: { presets: true, profiles: true } },
  }, ["channel"], { badWords: ["test"], nsfwWords: ["test"] }), []);
});
