"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");
function harness() {
  const data = {}, created = [], calls = [];
  let next = 100000000000000000n;
  const guild = { id: "123456789012345678", client: { user: { id: "223456789012345678" } }, members: { me: { id: "223456789012345678", permissions: { has: () => true } } } };
  function manager(kind) {
    const cache = new Map();
    return { cache, fetch: async id => id ? cache.get(id) || null : cache, async create(options) {
      const item = { ...options, id: String(next++), parentId: options.parent, guild, permissionOverwrites: { edit: async () => {} }, async setParent(id, opts) { this.parentId = id; this.moveOptions = opts; } };
      created.push({ kind, item, options }); cache.set(item.id, item); return item;
    } };
  }
  guild.channels = manager("channel"); guild.roles = manager("role"); guild.roles.everyone = { id: guild.id };
  const ctx = vm.createContext({ ...discord, console, guildData: () => data, saveDB() {},
    require: require("node:module").createRequire(path.join(__dirname, "../index.js")),
    setupVerifySystem: async () => calls.push("verify"), soezyLogging: { enable: async () => calls.push("logging") },
    soezyAntiNukePanel: { ensureLogsChannel: async () => calls.push("antinuke") }, ensureAutomodLogChannel: async () => calls.push("automod"),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../utils/featureProvisioning.js"), "utf8"), ctx);
  return { data, guild, created, calls, ctx, enable: key => ctx.ensureFeatureInfrastructure(guild, key) };
}
test("every resource-backed config creates and persists its required resources idempotently", async () => {
  for (const key of ["welcome", "goodbye", "boost", "birthday", "confession", "reports", "ticket", "media", "sticky", "tempvoice", "autorole", "joindm"]) {
    const h = harness();
    await h.enable(key); const count = h.created.length;
    await h.enable(key); assert.equal(h.created.length, count, key);
    assert.ok(count || h.data.joinDm.message, key);
    assert.ok(h.created.filter(c => c.kind === "role").every(c => c.options.permissions.length === 0));
  }
});
test("existing configured resources and custom message are preserved", async () => {
  const h = harness(); const existing = await h.guild.channels.create({ type: discord.ChannelType.GuildText });
  h.data.welcome = { channel: existing.id, message: "Custom welcome" };
  await h.enable("welcome"); assert.equal(h.created.length, 1); assert.equal(h.data.welcome.message, "Custom welcome");
});
test("concurrent requests create one set and failed permissions are retryable", async () => {
  const h = harness(); await Promise.all([h.enable("birthday"), h.enable("birthday")]);
  assert.equal(h.created.length, 2);
  const denied = harness(); denied.guild.members.me.permissions.has = () => false;
  await assert.rejects(denied.enable("welcome"), /Manage Channels/);
  assert.equal(denied.data.welcome.enabled, undefined);
  denied.guild.members.me.permissions.has = () => true;
  await denied.enable("welcome"); assert.equal(denied.created.length, 1);
});
test("specialized setup provisions feature-mapped roles without granting global immunity", async () => {
  const h = harness();
  for (const key of ["verification", "logging", "antinuke", "automod", "security", "antibot", "antilink"]) await h.enable(key);
  assert.deepEqual(h.calls, ["verify", "logging", "antinuke", "automod"]);
  assert.deepEqual(h.created.filter(c => c.kind === "role").map(c => c.options.name), ["X NUKE", "X MOD", "X BOT"]);
  assert.equal(h.data.whitelistUsers, undefined);
  assert.equal(h.data.whitelistRoles, undefined);
});
test("Wall creates a separate category, private logs, jail and roles; repeat enable reuses resources", async () => {
  const h = harness();
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../utils/wallManager.js"), "utf8"), h.ctx);
  h.ctx.wallEnforceQuarantineChannelAccess = async () => {};
  h.ctx.wallSaveAndSync = () => {};
  await h.enable("wall");
  assert.equal(h.data.wallSystem.enabled, true);
  const category = h.created.find(c => c.options.type === discord.ChannelType.GuildCategory);
  assert.equal(category.options.name, "Soezy Wall");
  assert.equal(h.created.filter(c => c.kind === "role").length, 2);
  assert.ok(h.created.filter(c => c.options.type === discord.ChannelType.GuildText).every(c => c.options.parent === category.item.id));
  const count = h.created.length; await h.enable("wall"); assert.equal(h.created.length, count);
});

test("Wall disable preserves every resource and jail record, and re-enable reuses them", async () => {
  const h = harness();
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../utils/wallManager.js"), "utf8"), h.ctx);
  h.ctx.wallEnforceQuarantineChannelAccess = async () => {};
  h.ctx.wallSaveAndSync = () => {};
  await h.ctx.configureWallSystem(h.guild, true);
  const ws = h.data.wallSystem;
  ws.quarantined[h.guild.id]["323456789012345678"] = { savedRoles: ["member-role"] };
  const resources = [ws.categoryId, ws.jailChannelId, ws.logChannel, ws.quarantineRoleId, ws.whitelistRoleId];
  const count = h.created.length;
  for (const item of h.created) item.item.delete = () => assert.fail("enable/disable must not delete resources");
  await h.ctx.configureWallSystem(h.guild, false);
  assert.equal(ws.enabled, false);
  assert.equal(h.data.wall.enabled, false);
  assert.deepEqual([ws.categoryId, ws.jailChannelId, ws.logChannel, ws.quarantineRoleId, ws.whitelistRoleId], resources);
  assert.ok(ws.quarantined[h.guild.id]["323456789012345678"]);
  await h.ctx.configureWallSystem(h.guild, true);
  assert.equal(ws.enabled, true);
  assert.equal(h.created.length, count);
});

test("Wall partial setup retains created resources for a successful retry", async () => {
  const h = harness();
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../utils/wallManager.js"), "utf8"), h.ctx);
  h.ctx.wallEnforceQuarantineChannelAccess = async () => {};
  h.ctx.wallSaveAndSync = () => {};
  const create = h.guild.roles.create;
  h.guild.roles.create = async () => { throw new Error("Missing Manage Roles"); };
  await assert.rejects(h.ctx.configureWallSystem(h.guild, true), /Manage Roles|set up Wall/);
  const categoryId = h.data.wallSystem.categoryId;
  assert.ok(categoryId);
  assert.equal(h.data.wallSystem.enabled, false);
  h.guild.roles.create = create;
  await h.ctx.configureWallSystem(h.guild, true);
  assert.equal(h.data.wallSystem.categoryId, categoryId);
});

test("Wall panel has quoted information, tick/cross buttons and a settings-only dropdown", async () => {
  const h = harness();
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../utils/wallManager.js"), "utf8"), h.ctx);
  h.ctx.EMOJIS = { thinking: "<:thinking:123456789012345678>", moderation_dm_tick: "<:tick:123456789012345679>", scross: "<:scross:123456789012345680>" };
  const panel = h.ctx.buildWallConfigContainer(h.guild.id, "owner_123", { username: "admin" }).toJSON();
  const rows = panel.components.filter(c => c.type === discord.ComponentType.ActionRow);
  assert.deepEqual(rows[0].components.map(c => c.label), ["Enable", "Disable", "Extra Owners"]);
  assert.equal(rows[0].components[0].emoji.name, "tick");
  assert.equal(rows[0].components[1].emoji.name, "scross");
  assert.equal(rows[0].components[1].disabled, true);
  assert.ok(rows[1].components[0].options.every(o => !/toggle|enable|disable/.test(o.value)));
  assert.match(panel.components.map(c => c.content || "").join("\n"), /> \*\*Status\*\*/);
});

test("protection whitelist roles are idempotent, permissionless, and feature-scoped", async () => {
  const { ensureProtectionRole } = require("../utils/protectionRole");
  const h = harness();
  const deps = { guildData: () => h.data, saveDB() {} };
  const expected = { antinuke: "X NUKE", wall: "X WALL", automod: "X MOD", antibot: "X BOT", antiraid: "X RAID", access: "X ACCESS" };
  const roles = {};
  for (const feature of Object.keys(expected)) roles[feature] = await ensureProtectionRole(h.guild, feature, deps);
  await Promise.all(Object.keys(expected).map(feature => ensureProtectionRole(h.guild, feature, deps)));
  assert.equal(h.created.length, Object.keys(expected).length);
  assert.ok(h.created.every(c => c.options.permissions.length === 0));
  for (const [feature, name] of Object.entries(expected)) {
    const created = h.created.find(entry => entry.item.id === roles[feature].id);
    assert.equal(created.options.name, name);
    assert.equal(h.data.featureRoleIds[feature], roles[feature].id);
  }
  assert.equal(h.data.antinuke.whitelistRoleId, roles.antinuke.id);
  assert.equal(h.data.automod.whitelistRoleId, roles.automod.id);
  assert.equal(h.data.antibot.whitelistRoleId, roles.antibot.id);
  assert.equal(h.data.antiRaid.whitelistRoleId, roles.antiraid.id);
  assert.equal(h.data.whitelistRoles, undefined);
  assert.equal(h.data.whitelistUsers, undefined);
});

test("deleted mapped roles are replaced, saved IDs persist, and hierarchy failures are clear", async () => {
  const { ensureProtectionRole } = require("../utils/protectionRole");
  const h = harness();
  const deps = { guildData: () => h.data, saveDB() {} };
  const original = await ensureProtectionRole(h.guild, "automod", deps);
  h.guild.roles.cache.delete(original.id);
  const replacement = await ensureProtectionRole(h.guild, "automod", deps);
  assert.notEqual(replacement.id, original.id);
  assert.equal(h.data.featureRoleIds.automod, replacement.id);
  await ensureProtectionRole(h.guild, "automod", deps);
  assert.equal(h.created.length, 2);

  const blocked = harness();
  blocked.guild.roles.create = async () => { const error = new Error("hierarchy"); error.code = 50013; throw error; };
  await assert.rejects(
    ensureProtectionRole(blocked.guild, "wall", { guildData: () => blocked.data, saveDB() {} }),
    /Manage Roles and place my highest role above/
  );
});
