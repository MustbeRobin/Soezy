"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { ChannelType } = require("discord.js");
const helper = require("../utils/soezyLogCategory");
function setup() {
  const data = { logging: { enabled: false }, antinuke: { logs: "an" }, automod: { advanced: { logs: "am" } }, confession: { logs: "cf", channel: "public" } };
  const cache = new Map(), created = [], moves = [];
  for (const id of ["an", "am", "cf", "public"]) cache.set(id, { id, type: ChannelType.GuildText, async setParent(parent, options) { this.parentId = parent; moves.push({ id, parent, options }); } });
  const guild = { id: "guild", members: { me: { id: "bot", permissions: { has: () => true } } }, channels: {
    cache, fetch: async id => id ? cache.get(id) : cache,
    create: async options => { const channel = { ...options, id: "category" }; created.push(channel); cache.set(channel.id, channel); return channel; },
  } };
  return { data, guild, cache, created, moves, deps: { guildData: () => data, saveDB() {} } };
}
test("disabled logging still groups all three logs without moving public confession or enabling logging", async () => {
  const h = setup(); await helper.migrate(h.guild, h.deps);
  assert.equal(h.created[0].name, "Soezy");
  assert.deepEqual(h.moves.map(m => m.id), ["an", "am", "cf"]);
  assert.ok(h.moves.every(m => m.options.lockPermissions === false));
  assert.equal(h.data.logging.enabled, false);
  await helper.migrate(h.guild, h.deps);
  assert.equal(h.created.length, 1); assert.equal(h.moves.length, 3);
});
test("reuse configured logging category and deduplicate simultaneous setup", async () => {
  const h = setup(); h.data.logging.categoryId = "existing";
  h.cache.set("existing", { id: "existing", type: ChannelType.GuildCategory });
  await helper.migrate(h.guild, h.deps);
  assert.equal(h.created.length, 0); assert.ok(h.moves.every(m => m.parent === "existing"));
  const other = setup();
  const results = await Promise.all([helper.ensure(other.guild, other.deps), helper.ensure(other.guild, other.deps)]);
  assert.equal(other.created.length, 1); assert.equal(results[0], results[1]);
});
test("reuse legacy named category and avoid creating categories for unconfigured guilds", async () => {
  const h = setup(); h.cache.set("legacy", { id: "legacy", name: "SOEZY LOGS", type: ChannelType.GuildCategory });
  await helper.migrate(h.guild, h.deps);
  assert.equal(h.created.length, 0); assert.equal(h.data.logging.categoryId, "legacy");
  const empty = setup(); empty.cache.clear(); await helper.migrate(empty.guild, empty.deps);
  assert.equal(empty.created.length, 0);
});
test("permission failure does not enable logging or move channels", async () => {
  const h = setup(); h.guild.members.me.permissions.has = () => false;
  await assert.rejects(helper.migrate(h.guild, h.deps), /Manage Channels/);
  assert.equal(h.created.length, 0); assert.equal(h.moves.length, 0);
});
