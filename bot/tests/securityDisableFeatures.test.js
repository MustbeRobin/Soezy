"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { disableAntiNukeFeatures, disableAutoModFeatures, disableWallFeatures } = require("../utils/securityDisableFeatures");

test("security disable clears flags and aliases without removing other configuration", () => {
  const guild = {
    antinuke: { events: { antiban: true }, features: { antiban: { enabled: true, limit: 5 } }, muteEvasion: { enabled: true, mutedUsers: { user: 1 } } },
    antiRaid: { enabled: true, threshold: 10 },
    automod: { features: { antiSpam: { enabled: true, action: "timeout" } }, antiSpam: { enabled: true, maxMessages: 3 }, advanced: { duplicate: { enabled: true, requiredCount: 2 } } },
    antibot: { enabled: true, action: "kick" }, antilink: { enabled: true, allowedDomains: ["example.com"] },
    accountAge: { enabled: true, minDays: 14 }, badWordEnabled: true, nsfwProtection: true,
    security: { antiraid: { enabled: true }, accountAgeDays: 14, antiZalgo: true },
    nativeAutomod: { protections: { presets: true, profiles: true }, ruleIds: { spam: "rule" } },
    wallSystem: { features: { guard: { enabled: true, limit: 3 } }, quarantined: { user: { reason: "test" } } },
    autoJail: { enabled: true, channelId: "channel" }, features: { antiraid: true, antibot: true, accountage: true },
  };
  const systems = { antiraid: true, antibot: true, accountage: true };
  disableAntiNukeFeatures(guild, ["antiban", "antiunban"], systems);
  disableAutoModFeatures(guild, systems);
  disableWallFeatures(guild);
  assert.deepEqual(guild.antinuke.events, { antiban: false, antiunban: false });
  assert.deepEqual(guild.antinuke.features.antiban, { enabled: false, limit: 5 });
  assert.deepEqual(guild.antinuke.muteEvasion.mutedUsers, { user: 1 });
  assert.equal(guild.antiRaid.enabled, false);
  assert.equal(guild.security.antiraid.enabled, false);
  assert.deepEqual(guild.automod.antiSpam, { enabled: false, maxMessages: 3 });
  assert.deepEqual(guild.automod.advanced.duplicate, { enabled: false, requiredCount: 2 });
  assert.deepEqual(guild.antilink.allowedDomains, ["example.com"]);
  assert.equal(guild.security.accountAgeDays, 0);
  assert.equal(guild.security.savedAccountAgeDays, 14);
  assert.equal(guild.security.antiZalgo, false);
  assert.deepEqual(guild.nativeAutomod.protections, { presets: false, profiles: false });
  assert.deepEqual(guild.nativeAutomod.ruleIds, { spam: "rule" });
  assert.equal(guild.nativeAutomod.keywordsEnabled, false);
  assert.equal(guild.security.messageLengthEnabled, false);
  assert.deepEqual(guild.wallSystem.quarantined, { user: { reason: "test" } });
  assert.deepEqual(guild.autoJail, { enabled: false, channelId: "channel" });
  assert.equal(guild.wallSystem.features.guard.enabled, false);
  assert.ok(Object.values(systems).every(value => value === false));
  const reloaded = JSON.parse(JSON.stringify(guild));
  assert.equal(reloaded.automod.features.antiSpam.enabled, false);
  assert.equal(reloaded.wallSystem.features.guard.enabled, false);
});

test("disabled aliases stay off through database preference synchronization and reload", () => {
  const source = fs.readFileSync(path.join(__dirname, "../utils/database.js"), "utf8");
  const start = source.indexOf("function syncProtectionPreferenceState(");
  const end = source.indexOf("globalThis.syncProtectionPreferenceState =", start);
  const ctx = vm.createContext({ ANTINUKE_EVENTS: [{ id: "antiban" }] });
  vm.runInContext(source.slice(start, end), ctx);
  const guild = {
    antinuke: { enabled: true, systemEnabled: true, events: { antiban: true }, features: { antiban: { enabled: true, limit: 5 } } },
    automod: { enabled: true, systemEnabled: true, antiSpam: { enabled: true }, features: { antiSpam: { enabled: true }, accountAge: { enabled: true } } },
    security: { accountAgeDays: 14, antiZalgo: true }, accountAge: { enabled: true, minDays: 14 },
  };
  disableAntiNukeFeatures(guild, ["antiban"]);
  disableAutoModFeatures(guild);
  ctx.syncProtectionPreferenceState(guild, "legacy");
  const reloaded = JSON.parse(JSON.stringify(guild));
  ctx.syncProtectionPreferenceState(reloaded, "canonical");
  assert.equal(reloaded.antinuke.events.antiban, false);
  assert.equal(reloaded.antinuke.features.antiban.limit, 5);
  assert.equal(reloaded.automod.features.antiSpam.enabled, false);
  assert.equal(reloaded.automod.features.accountAge.enabled, false);
  assert.equal(reloaded.security.savedAccountAgeDays, 14);
  assert.equal(reloaded.security.accountAgeDays, 0);
});
