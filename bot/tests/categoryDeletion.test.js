"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { ChannelType, Collection } = require("discord.js");
const {
  resolveCategory,
  deleteCategoryChannels,
} = require("../utils/categoryDeletion");

function channel(id, name, type, parentId = null, calls = []) {
  return {
    id, name, type, parentId, deletable: true,
    async delete() { calls.push(id); },
  };
}

test("category resolver accepts exact names and IDs, not partial names or text channels", () => {
  const channels = new Collection();
  const category = channel("123456789012345678", "Staff", ChannelType.GuildCategory);
  const text = channel("123456789012345679", "staff-chat", ChannelType.GuildText);
  channels.set(category.id, category);
  channels.set(text.id, text);
  const guild = { channels: { cache: channels } };

  assert.equal(resolveCategory(guild, "Staff").category, category);
  assert.equal(resolveCategory(guild, category.id).category, category);
  assert.equal(resolveCategory(guild, `<#${category.id}>`).category, category);
  assert.equal(resolveCategory(guild, "sta").category, null);
  assert.equal(resolveCategory(guild, text.id).category, null);
});

test("category delete removes every child before removing the category", async () => {
  const calls = [];
  const channels = new Collection();
  const category = channel("123456789012345678", "Staff", ChannelType.GuildCategory, null, calls);
  const first = channel("123456789012345679", "staff-chat", ChannelType.GuildText, category.id, calls);
  const second = channel("123456789012345680", "staff-voice", ChannelType.GuildVoice, category.id, calls);
  const outside = channel("123456789012345681", "general", ChannelType.GuildText, null, calls);
  for (const item of [category, first, second, outside]) channels.set(item.id, item);
  const guild = { channels: { cache: channels, fetch: async () => channels } };

  const result = await deleteCategoryChannels(guild, category.id, "test");
  assert.deepEqual(calls, [first.id, second.id, category.id]);
  assert.deepEqual(result, { categoryName: "Staff", deletedChannels: 2 });
});

test("category delete preflights all permissions before deleting anything", async () => {
  const calls = [];
  const channels = new Collection();
  const category = channel("123456789012345678", "Staff", ChannelType.GuildCategory, null, calls);
  const locked = channel("123456789012345679", "locked", ChannelType.GuildText, category.id, calls);
  locked.deletable = false;
  channels.set(category.id, category);
  channels.set(locked.id, locked);
  const guild = { channels: { cache: channels, fetch: async () => channels } };

  await assert.rejects(deleteCategoryChannels(guild, category.id, "test"), /Manage Channels/);
  assert.deepEqual(calls, []);
});

test("changed category contents invalidate the confirmation without deleting anything", async () => {
  const calls = [];
  const category = channel("123456789012345678", "Staff", ChannelType.GuildCategory, null, calls);
  const added = channel("123456789012345679", "new-channel", ChannelType.GuildText, category.id, calls);
  const channels = new Collection([[category.id, category], [added.id, added]]);
  const guild = { channels: { cache: channels, fetch: async () => channels } };
  await assert.rejects(deleteCategoryChannels(guild, category.id, "test", []), /contents changed/);
  assert.deepEqual(calls, []);
});

test("category delete stops on a child failure and leaves the category in place", async () => {
  const calls = [];
  const channels = new Collection();
  const category = channel("123456789012345678", "Staff", ChannelType.GuildCategory, null, calls);
  const first = channel("123456789012345679", "first", ChannelType.GuildText, category.id, calls);
  const second = channel("123456789012345680", "second", ChannelType.GuildText, category.id, calls);
  second.delete = async () => { throw new Error("Discord rejected deletion"); };
  for (const item of [category, first, second]) channels.set(item.id, item);
  const guild = { channels: { cache: channels, fetch: async () => channels } };

  await assert.rejects(deleteCategoryChannels(guild, category.id, "test"), error => {
    assert.equal(error.deletedCategoryChannels, 1);
    assert.equal(error.categoryChannelCount, 2);
    return /Discord rejected deletion/.test(error.message);
  });
  assert.deepEqual(calls, [first.id]);
});

test("delete-category command is registered and Anti-Nuke punishment setter is retired", () => {
  const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const prefix = read("events/messageCreate.js");
  const runtime = read("utils/runtimeManager.js");
  const help = read("utils/embedBuilders/helpEmbeds.js");
  const database = read("utils/database.js");
  assert.match(prefix, /cmd === "delete" && args\[0\]\?\.toLowerCase\(\) === "category"/);
  assert.match(runtime, /"delete":\s*\["category"\]/);
  assert.match(help, /name: "delete category"/);
  const antinukeStart = prefix.indexOf("/* ================= ANTINUKE COMMANDS ================= */");
  const punishmentConfig = prefix.indexOf('if (subCmd === "events")', antinukeStart);
  assert.ok(antinukeStart >= 0 && punishmentConfig > antinukeStart);
  assert.doesNotMatch(prefix.slice(antinukeStart, punishmentConfig), /if \(subCmd === "punishment"\)/);
  assert.doesNotMatch(runtime, /"antinuke":\s*\[[^\]]*"punishment"/);
  assert.doesNotMatch(help, /name: "antinuke punishment"/);
  assert.match(database, /g\.antinuke\.punishment\s*=\s*"ban"/);
});
