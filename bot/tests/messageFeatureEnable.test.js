"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "utils", "featureStateManager.js"), "utf8");
const guildId = "123456789012345678";

function loadFeatureStateManager(db) {
  const context = vm.createContext({
    db,
    module: { exports: {} },
    ALL_SYSTEMS: [],
    guildData: id => db.guilds[id],
    saveDB: () => {},
    console: { log() {}, warn() {} },
  });
  vm.runInContext(source, context);
  return context.soezyFeatureStateManager;
}

test("Welcome, Boost, Join DM, and Goodbye activation persists without optional message settings", () => {
  const db = {
    guilds: {
      [guildId]: {
        welcome: {},
        boost: {},
        joinDm: {},
        goodbye: {},
      },
    },
    guildSystems: {},
  };
  const manager = loadFeatureStateManager(db);
  for (const feature of ["welcome", "boost", "joindm", "goodbye"]) {
    assert.equal(manager.setFeatureState(guildId, feature, true), true);
    assert.equal(manager.getFeatureState(guildId, feature), true);
  }

  const persistedDb = JSON.parse(JSON.stringify(db));
  const reloadedManager = loadFeatureStateManager(persistedDb);
  for (const feature of ["welcome", "boost", "joindm", "goodbye"]) {
    assert.equal(reloadedManager.getFeatureState(guildId, feature), true);
    assert.equal(persistedDb.guildSystems[guildId][feature], true);
  }
  for (const key of ["welcome", "boost", "goodbye"]) {
    assert.equal(persistedDb.guilds[guildId][key].enabled, true);
    assert.equal("channel" in persistedDb.guilds[guildId][key], false);
  }
  assert.equal(persistedDb.guilds[guildId].joinDm.enabled, true);
  assert.equal("message" in persistedDb.guilds[guildId].joinDm, false);
  assert.equal("joindm" in persistedDb.guilds[guildId], false);
});
