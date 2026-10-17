"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const guildId = "123456789012345678";

function harness() {
  const gd = {
    antinuke: { systemEnabled: false, enabled: false, events: { antichanneldelete: true, antiban: false }, features: { antichanneldelete: { enabled: true }, antiban: { enabled: false } } },
    automod: { systemEnabled: false, enabled: false, antiSpam: { enabled: true }, features: { antiSpam: { enabled: true }, antiCaps: { enabled: false } } },
    wallSystem: { systemEnabled: false, enabled: false, features: { joinGuard: { enabled: true } } },
    accountAge: { enabled: true, minDays: 12 },
    antibot: { enabled: true },
  };
  const db = { guilds: { [guildId]: gd }, guildSystems: {} };
  const context = vm.createContext({ db, module: { exports: {} }, ALL_SYSTEMS: [], guildData: id => db.guilds[id] });
  const source = fs.readFileSync(path.join(__dirname, "../utils/featureStateManager.js"), "utf8");
  vm.runInContext(source, context);
  return { gd, db, context };
}

test("effective protection state requires both the saved parent and child preference", () => {
  const { context } = harness();
  assert.deepEqual({ ...context.getProtectionRuntimeState(guildId, "antinuke", "antichanneldelete") }, {
    systemEnabled: false, featureEnabled: true, effectiveEnabled: false,
  });
  assert.deepEqual({ ...context.getProtectionRuntimeState(guildId, "automod", "antiSpam") }, {
    systemEnabled: false, featureEnabled: true, effectiveEnabled: false,
  });
  assert.deepEqual({ ...context.getProtectionRuntimeState(guildId, "wall", "joinGuard") }, {
    systemEnabled: false, featureEnabled: true, effectiveEnabled: false,
  });
  assert.equal(context.getProtectionRuntimeState(guildId, "antinuke", "antiban").featureEnabled, false);
});

test("parent toggles update only system state and keep child preferences through restart-shaped reload", () => {
  const { context, gd, db } = harness();
  assert.equal(context.setFeatureState(guildId, "automod", true, { sync: false }), true);
  assert.equal(context.getProtectionRuntimeState(guildId, "automod", "antiSpam").effectiveEnabled, true);
  assert.equal(context.getProtectionRuntimeState(guildId, "automod", "antiCaps").effectiveEnabled, false);
  assert.equal(context.setFeatureState(guildId, "automod", false, { sync: false }), true);
  assert.equal(gd.automod.features.antiSpam.enabled, true);
  assert.equal(gd.automod.features.antiCaps.enabled, false);
  assert.equal(gd.automod.antiSpam.enabled, true);
  assert.equal(gd.automod.systemEnabled, false);

  const reloaded = vm.createContext({ db, module: { exports: {} }, ALL_SYSTEMS: [], guildData: id => db.guilds[id] });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../utils/featureStateManager.js"), "utf8"), reloaded);
  assert.equal(reloaded.getProtectionRuntimeState(guildId, "automod", "antiSpam").effectiveEnabled, false);
  assert.equal(reloaded.getProtectionRuntimeState(guildId, "automod", "antiSpam").featureEnabled, true);
});

test("missing saved feature preferences default to inactive", () => {
  const { context } = harness();
  assert.equal(context.getProtectionRuntimeState(guildId, "automod", "notConfigured").featureEnabled, false);
  assert.equal(context.getProtectionRuntimeState(guildId, "automod", "notConfigured").effectiveEnabled, false);
});
