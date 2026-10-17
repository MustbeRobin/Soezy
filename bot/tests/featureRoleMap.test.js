"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_MAPPING, normalizeFeatureKey, resolveFeatureRole, gatherFeatureRoleIds, isFeatureRoleMappedToAnother, validateMapping } = require("../utils/featureRoleMap");

test("default mapping contains the authoritative feature role names", () => {
  assert.deepEqual(DEFAULT_MAPPING, {
    access: "X ACCESS",
    antinuke: "X NUKE",
    wall: "X WALL",
    antibot: "X BOT",
    automod: "X MOD",
    antiraid: "X RAID",
  });
  assert.equal(normalizeFeatureKey("anti-nuke"), "antinuke");
  assert.equal(normalizeFeatureKey("auto-mod"), "automod");
  assert.equal(normalizeFeatureKey("immune"), null);
});

test("saved feature role IDs are resolved centrally and merged with legacy IDs", () => {
  const guildData = {
    featureRoleIds: { antinuke: "1001", wall: "2002", automod: "3003" },
    antibot: { whitelistRoleId: "4004" },
  };

  assert.equal(resolveFeatureRole(guildData, "antinuke"), "1001");
  assert.equal(resolveFeatureRole(guildData, "wall"), "2002");
  assert.equal(resolveFeatureRole(guildData, "antibot"), "4004");
  assert.deepEqual(gatherFeatureRoleIds(guildData, ["automod", "antibot", "wall", "antinuke"]), ["3003", "4004", "2002", "1001"]);
});

test("validation reports successful mapping coverage without error", () => {
  const warnings = [];
  assert.equal(validateMapping({ warn: msg => warnings.push(msg) }), true);
  assert.equal(warnings.length, 0);
});

test("duplicate legacy or canonical role IDs are claimed by one feature only", () => {
  const canonical = { featureRoleIds: { antinuke: "5005", wall: "5005" } };
  assert.equal(resolveFeatureRole(canonical, "antinuke"), "5005");
  assert.equal(resolveFeatureRole(canonical, "wall"), null);
  assert.equal(isFeatureRoleMappedToAnother(canonical, "wall", "5005"), true);
  assert.equal(isFeatureRoleMappedToAnother(canonical, "antinuke", "5005"), false);
  assert.deepEqual(gatherFeatureRoleIds(canonical, ["wall", "antinuke"]), ["5005"]);

  const legacy = { antinuke: { whitelistRoleId: "6006" }, wallSystem: { whitelistRoleId: "6006" } };
  assert.equal(resolveFeatureRole(legacy, "wall"), null);
  assert.equal(resolveFeatureRole(legacy, "antinuke"), "6006");
});
