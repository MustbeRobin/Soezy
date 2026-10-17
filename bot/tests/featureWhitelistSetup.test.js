"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");

const source = fs.readFileSync(path.join(__dirname, "../events/interactionCreate.js"), "utf8");
const start = source.indexOf("function interactionUniqueIds(");
const end = source.indexOf("const SECURITY_MULTI_SELECT_PREMIUM_NOTICE", start);
const panelFunctions = source.slice(start, end);

function harness() {
  const data = {
    whitelistUsers: ["global-user"],
    whitelistRoles: ["global-role"],
    featureRoleIds: { wall: "wall-role" },
    wallSystem: { whitelistUsers: ["wall-user"], whitelistRoles: ["wall-role-entry"] },
    antiRaid: { whitelistUsers: ["raid-user"], whitelistRoles: ["raid-role"] },
    automod: { whitelistUsers: ["mod-user"], whitelistRoles: ["mod-role"], whitelistChannels: ["mod-channel"] },
    antilink: { whitelistUsers: ["link-user"], whitelistRoles: ["link-role"], whitelistChannels: ["link-channel"] },
    antibot: { whitelistUsers: ["bot-user"], whitelistRoles: ["bot-role"] },
    antinuke: { whitelistUsers: ["nuke-user"], whitelistRoles: ["nuke-role"] },
  };
  const guild = { id: "guild", roles: { cache: new Map([["wall-role", { id: "wall-role" }]]) } };
  const saves = [];
  const featureRoleMap = {
    normalizeFeatureKey: feature => ["antinuke", "wall", "automod", "antibot", "antiraid", "access"].includes(feature) ? feature : null,
    resolveFeatureRole: (_guildId, feature) => data.featureRoleIds?.[feature] || null,
  };
  const nativeRequire = require("node:module").createRequire(path.join(__dirname, "../index.js"));
  const context = vm.createContext({
    ...discord,
    guildData: () => data,
    client: { guilds: { cache: new Map([[guild.id, guild]]) } },
    saveDB: () => saves.push(true),
    syncGuildWhitelist() {},
    normalizeSecurityToggleFeature: feature => feature === "antiword" ? "automod" : feature,
    normalizeInteractionRemainingSetupFeature: feature => feature,
    interactionSetupEmoji: (_name, _key, fallback) => fallback || "x",
    require: id => id === "./utils/featureRoleMap" ? featureRoleMap : nativeRequire(id),
  });
  vm.runInContext(`const INTERACTION_CHANNEL_WHITELIST_FEATURES = new Set(["automod", "antilink", "security"]);\n${panelFunctions}`, context);
  return { context, data, saves };
}

test("feature whitelist pickers store entries in the correct guild-scoped record", () => {
  const h = harness();
  for (const [feature, type, id, target] of [
    ["wall", "user", "wall-added", h.data.wallSystem],
    ["wall", "role", "wall-role-added", h.data.wallSystem],
    ["antiraid", "user", "raid-added", h.data.antiRaid],
    ["antiraid", "role", "raid-role-added", h.data.antiRaid],
    ["antibot", "role", "bot-role-added", h.data.antibot],
    ["antinuke", "role", "nuke-role-added", h.data.antinuke],
  ]) {
    assert.equal(h.context.addInteractionWhitelistEntry("guild", feature, type, id), true);
    const list = type === "role" ? target.whitelistRoles : target.whitelistUsers;
    assert.ok(list.includes(id), `${feature} ${type}`);
  }
  assert.deepEqual(h.data.whitelistUsers, ["global-user"]);
  assert.deepEqual(h.data.whitelistRoles, ["global-role"]);
  assert.equal(h.saves.length, 6);
});

test("channel exemptions are available only for protections that enforce channel scope", () => {
  const h = harness();
  for (const feature of ["antinuke", "wall", "antibot", "antiraid"]) {
    assert.equal(h.context.addInteractionWhitelistEntry("guild", feature, "channel", `${feature}-channel`), false);
  }
  for (const feature of ["automod", "antilink", "security"]) {
    assert.equal(h.context.addInteractionWhitelistEntry("guild", feature, "channel", `${feature}-channel`), true);
  }
  assert.equal(h.data.antinuke.whitelistChannels, undefined);
  assert.equal(h.data.wallSystem.whitelistChannels, undefined);
  assert.equal(h.data.antibot.whitelistChannels, undefined);
  assert.equal(h.data.antiRaid.whitelistChannels, undefined);
  assert.equal(h.data.automod.whitelistChannels.includes("automod-channel"), true);
  assert.equal(h.data.antilink.whitelistChannels.includes("antilink-channel"), true);
  assert.equal(h.data.security.whitelistChannels.includes("security-channel"), true);
});

test("whitelist setup displays scoped entries and the actual mapped protection role", () => {
  const h = harness();
  const state = h.context.getInteractionWhitelistSetupState("guild", "wall");
  assert.deepEqual(Array.from(state.users), ["wall-user"]);
  assert.deepEqual(Array.from(state.roles), ["wall-role-entry"]);
  assert.deepEqual(Array.from(state.channels), []);

  const panel = h.context.buildInteractionWhitelistSetupContainer("guild", "wall", "owner").toJSON();
  const text = panel.components.map(component => component.content || "").join("\n");
  assert.match(text, /Mapped protection role: <@&wall-role>/);
  assert.doesNotMatch(text, /global-user|global-role|Channels:/);
  assert.deepEqual(panel.components.find(component => component.type === discord.ComponentType.ActionRow).components.map(button => button.label), ["Add User", "Add Role", "Back"]);
});
