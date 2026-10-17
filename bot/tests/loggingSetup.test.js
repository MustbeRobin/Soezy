"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
function harness() {
  const logging = { enabled: false, channels: {}, events: {} }, created = [], sent = [], handlers = {};
  let failAt = 0, pending = null;
  const guild = { id: "123456789012345678", name: "Test", members: { me: { id: "234567890123456789", permissions: { has: () => true } } } };
  const cache = new Map();
  guild.channels = {
    cache,
    fetch: async id => cache.get(id) || null,
    create: async options => {
      if (pending) await pending;
      if (failAt && created.length === failAt) throw new Error("API failure");
      const ch = { ...options, id: String(345678901234567890n + BigInt(created.length)), guild, permissionsFor: () => ({ has: () => true }), send: async p => sent.push(p) };
      created.push(ch); cache.set(ch.id, ch); return ch;
    },
  };
  const ctx = vm.createContext({ ...discord, console, module: { exports: {} }, guildData: () => ({ logging }), saveDB: () => {}, EMOJIS: { logging: "LOG", thinking: "<:Logging:1533879666212077728>", tick: "YES", cross: "NO" }, isAuthorizedInteraction: i => i.authorized !== false, client: { on: (name, fn) => { handlers[name] = fn; }, guilds: { cache: new Map([[guild.id, guild]]) } } });
  ctx.require = require("node:module").createRequire(path.join(__dirname, "..", "index.js"));
  vm.runInContext(read("utils/containerBuilder.js"), ctx);
  vm.runInContext(read("utils/loggingSetup.js"), ctx);
  vm.runInContext(read("events/loggingExtras.js"), ctx);
  return { api: ctx.soezyLogging, ctx, guild, logging, created, sent, handlers, fail: n => { failAt = n; }, pause: p => { pending = p; } };
}
test("enable all creates one private category and 16 channels, repeated enable reuses them", async () => {
  const h = harness();
  assert.equal(await h.api.enable(h.guild), 16);
  assert.equal(h.created.length, 17);
  assert.equal(h.created[0].name, "Soezy");
  for (const ch of h.created) assert.ok(ch.permissionOverwrites[0].deny.includes(discord.PermissionFlagsBits.ViewChannel));
  assert.equal(await h.api.enable(h.guild), 0);
  assert.equal(h.created.length, 17);
  assert.equal(h.sent.length, 16);
  assert.equal(h.logging.enabled, true);
});
test("partial setup failure retains IDs, releases lock and retries without duplicates", async () => {
  const h = harness(); h.fail(3);
  await assert.rejects(h.api.enable(h.guild), /API failure/);
  assert.equal(Object.keys(h.logging.channels).length, 2);
  h.fail(0); await h.api.enable(h.guild);
  assert.equal(h.created.length, 17);
});
test("concurrent setup and mutation are rejected; missing permissions create nothing", async () => {
  const h = harness(); let resume;
  h.pause(new Promise(r => { resume = r; }));
  const job = h.api.enable(h.guild, "join");
  await assert.rejects(h.api.enable(h.guild), /already running/);
  assert.throws(() => h.api.disable(h.guild), /Wait/);
  resume(); await job;
  const denied = harness(); denied.guild.members.me.permissions.has = () => false;
  await assert.rejects(denied.api.enable(denied.guild), /Manage Channels/);
  assert.equal(denied.created.length, 0);
});
test("category remapping routes new events without changing another category", async () => {
  const h = harness(); await h.api.enable(h.guild);
  const join = h.logging.channels.join, leave = h.logging.channels.leave;
  await h.api.setChannel(h.guild, "join", leave);
  assert.equal(h.logging.channels.join, leave);
  h.sent.length = 0;
  await h.ctx.sendConfiguredLogging(h.guild, "memberJoin");
  assert.equal(h.sent.length, 1);
  h.api.disable(h.guild, "join");
  await h.ctx.sendConfiguredLogging(h.guild, "memberJoin");
  assert.equal(h.sent.length, 1);
  assert.equal(h.logging.events.memberLeave, true);
  assert.ok(h.guild.channels.cache.has(join));
  h.api.disable(h.guild);
  assert.equal(h.logging.enabled, false);
  assert.equal(h.created.length, 17);
});
test("invalid channel or category cannot change config", async () => {
  const h = harness(); await h.api.enable(h.guild, "message");
  await assert.rejects(h.api.setChannel(h.guild, "message", "missing"), /Choose a text channel/);
  await assert.rejects(h.api.enable(h.guild, "invalid"), /Unknown/);
  const channel = h.created.at(-1); channel.guild = { id: "elsewhere" };
  await assert.rejects(h.api.setChannel(h.guild, "message", channel.id), /Choose/);
});
test("config matches the requested summary and exposes capped setting/channel menus", async () => {
  const h = harness(), user = { id: "456789012345678901", username: "Admin" };
  const panel = h.api.panel(h.guild, user, "channel:message").components[0].toJSON();
  const rows = panel.components.filter(c => c.type === discord.ComponentType.ActionRow);
  const text = panel.components.find(c => c.type === discord.ComponentType.TextDisplay).content;
  assert.match(text, /<:Logging:1533879666212077728> Logging Configuration/);
  assert.match(text, /Ignore Embeds/);
  assert.match(text, /System Logs/);
  assert.equal(rows[0].components[0].options.length, 20);
  assert.ok(rows[0].components[0].options.length <= 25);
  assert.equal(rows[1].components[0].options.length, 17);
  assert.equal(rows[2].components[0].type, discord.ComponentType.ChannelSelect);
});
test("logging config interaction changes ignore settings and routes legacy subcommands away", async () => {
  const h = harness(), user = { id: "456789012345678901", username: "Admin" };
  const updated = [];
  const interaction = {
    guild: h.guild, user, customId: `logpanel:setting:${user.id}:${Date.now()}`,
    values: ["ignoreVoice"], authorized: true,
    deferUpdate: async () => {}, editReply: async p => { updated.push(p); },
  };
  assert.equal(await h.api.interaction(interaction), true);
  assert.equal(h.logging.ignoreVoice, true);
  assert.equal(updated.length, 1);
  let reply;
  assert.equal(await h.api.interaction({
    guild: h.guild, user, customId: `logpanel:enable:all:other:${Date.now()}`,
    reply: async p => { reply = p; },
  }), true);
  assert.equal(reply.flags, 64);
  assert.equal(h.created.length, 0);
});
test("logging slash command exposes config, enable, and disable with category selection", () => {
  const cmd = require("../commands/config/logging").data.toJSON();
  assert.deepEqual(cmd.options.map(o => o.name), ["config", "enable", "disable"]);
  for (const subcommand of cmd.options.slice(1)) {
    assert.equal(subcommand.options[0].name, "category");
    assert.equal(subcommand.options[0].required, false);
    assert.ok(subcommand.options[0].choices.some(choice => choice.value === "all"));
    assert.equal(subcommand.options[0].choices.length, 17);
  }
  assert.match(cmd.options[1].description, /create missing log channels/i);
  assert.match(cmd.options[2].description, /without deleting channels/i);
});
test("requester permission and panel expiry are enforced", async () => {
  const h = harness(), user = { id: "456789012345678901", username: "Admin" };
  for (const [id, authorized] of [[`logpanel:enable:all:other:${Date.now()}`, true], [`logpanel:enable:all:${user.id}:0`, true], [`logpanel:enable:all:${user.id}:${Date.now()}`, false]]) {
    let reply;
    assert.equal(await h.api.interaction({ guild: h.guild, user, customId: id, authorized, reply: async p => { reply = p; } }), true);
    assert.equal(reply.flags, 64);
    assert.equal(h.created.length, 0);
  }
});
test("new event listeners deliver only enabled events and skip old thread discovery", async () => {
  const h = harness(); await h.api.enable(h.guild);
  h.sent.length = 0;
  await h.handlers.threadCreate({ guild: h.guild, id: "1", name: "Thread" }, false);
  assert.equal(h.sent.length, 0);
  for (const name of ["threadCreate", "stageInstanceCreate", "guildScheduledEventCreate", "applicationCommandPermissionsUpdate"]) {
    await h.handlers[name]({ guild: h.guild, id: "1", name: "Item" }, true);
  }
  assert.equal(h.sent.length, 4);
});
