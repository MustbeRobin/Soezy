"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");
const { createEmergencyProtection } = require("../utils/emergencyProtection");

function harness(options = {}) {
  let time = 100000;
  const timers = [];
  const actions = [];
  const config = { enabled: true, maxBans: 3, ...options.config };
  const channel = { id: "10", guildId: "1", bulkDelete: async ids => actions.push(["delete", ids]) };
  const member = { bannable: true, kickable: true, ban: async params => actions.push(["ban", params]), kick: async () => actions.push(["kick"]), ...options.member };
  const guild = { id: "1", ownerId: "owner", members: { cache: new Map([["attacker", member]]), fetch: async id => guild.members.cache.get(id) || member }, channels: { cache: new Map([["10", channel]]), fetch: async id => {
    const found = guild.channels.cache.get(id);
    if (found) return found;
    const error = new Error("Unknown channel"); error.code = 10003; throw error;
  } }, roles: { cache: new Map() } };
  const client = { user: { id: "self" }, channels: { cache: new Map([["10", channel]]) } };
  const manager = createEmergencyProtection({
    client, config: () => config, enabled: () => options.enabled !== false,
    antibotWhitelisted: async id => id === "trusted-bot",
    now: () => time, setTimeout: (fn, ms) => { const timer = { fn, at: time + ms, unref() {} }; timers.push(timer); return timer; },
    whitelisted: async id => id === "immune",
    restore: async (_guild, excluded) => actions.push(["restore", [...excluded]]),
    fetchWebhook: async id => ({ guildId: "1", owner: { id: "attacker" }, delete: async () => actions.push(["webhook", id]) }),
    error: (_guild, error) => actions.push(["error", error.message]),
  });
  async function advance(ms) {
    time += ms;
    for (const timer of timers.splice(0)) {
      if (timer.at <= time) await timer.fn(); else timers.push(timer);
    }
    await new Promise(resolve => setImmediate(resolve));
  }
  return { manager, guild, channel, member, actions, advance, config };
}

test("audit actions deduplicate, ban once, suppress affected guild only and restore after quiet", async () => {
  const h = harness();
  for (let i = 0; i < 2; i++) await h.manager.recordAction(h.guild, "attacker", "channelDelete", { id: `a${i}`, targetId: `${i}` });
  assert.equal(h.manager.active("1"), false);
  await h.manager.recordAction(h.guild, "attacker", "channelDelete", { id: "a1" });
  assert.equal(h.actions.length, 0);
  await h.manager.recordAction(h.guild, "attacker", "channelDelete", { id: "a2", targetId: "2" });
  assert.equal(h.actions.filter(a => a[0] === "ban").length, 1);
  assert.equal(h.actions[0][1].deleteMessageSeconds, 120);
  assert.equal(h.manager.active("1"), true);
  assert.equal(h.manager.active("2"), false);
  assert.equal(h.manager.requestPolicy("post", "/channels/10/messages").paused, true);
  assert.equal(h.manager.requestPolicy("get", "/guilds/1/audit-logs").paused, true);
  assert.equal(h.manager.requestPolicy("put", "/guilds/1/bans/55").priority, "critical");
  await h.manager.recordAction(h.guild, "attacker", "roleDelete", { id: "a3", targetId: "3" });
  assert.equal(h.actions.filter(a => a[0] === "ban").length, 1);
  await h.advance(5000);
  assert.equal(h.actions.filter(a => a[0] === "restore").length, 1);
  assert.deepEqual(h.actions.find(a => a[0] === "restore")[1], ["attacker"]);
  await h.advance(61000);
  h.manager.prune();
  assert.equal(h.manager.active("1"), false);
});

test("bot flood detected before handlers; a single ban also deletes recent spam", async () => {
  const h = harness();
  for (let i = 0; i < 19; i++) assert.equal(h.manager.handleMessage({ guild: h.guild, author: { id: "attacker", bot: true }, id: `${i}`, channel: h.channel }), false);
  assert.equal(h.manager.handleMessage({ guild: h.guild, author: { id: "attacker", bot: true }, id: "19", channel: h.channel }), true);
  for (let i = 20; i < 70; i++) h.manager.handleMessage({ guild: h.guild, author: { id: "attacker", bot: true }, id: `${i}`, channel: h.channel });
  await h.advance(0);
  assert.equal(h.actions.filter(a => a[0] === "ban").length, 1);
  assert.equal(h.actions.filter(a => a[0] === "delete").length, 0);
  assert.equal(h.actions.find(a => a[0] === "ban")[1].deleteMessageSeconds, 120);
  await h.advance(5000);
  assert.equal(h.actions.filter(a => a[0] === "restore").length, 0);
});

test("ban failure is reported without silently substituting kick", async () => {
  const h = harness({ member: { bannable: false } });
  for (let i = 0; i < 20; i++) h.manager.handleMessage({ guild: h.guild, author: { id: "attacker", bot: true }, id: `${i}`, channel: h.channel });
  await h.advance(0);
  assert.equal(h.actions.filter(a => a[0] === "kick").length, 0);
  assert.equal(h.actions.filter(a => a[0] === "error").length, 1);
  assert.equal(h.actions.filter(a => a[0] === "delete").length, 0);
});

test("owner and bot self are protected; disabled Anti-Nuke does not enforce", async () => {
  for (const actor of ["owner", "self"]) {
    const h = harness({ config: { maxBans: 1 } });
    await h.manager.recordAction(h.guild, actor, "ban", { id: actor });
    assert.equal(h.actions.length, 0);
    assert.equal(h.manager.active("1"), false);
  }
  const disabled = harness({ config: { enabled: false, maxBans: 1 } });
  await disabled.manager.recordAction(disabled.guild, "attacker", "ban", { id: "disabled" });
  assert.equal(disabled.actions.length, 0);
});

test("Anti-Nuke whitelisted actors get normal headroom but are punished after crossing thresholds", async () => {
  const h = harness({ config: { maxBans: 2 } });
  assert.equal(await h.manager.recordAction(h.guild, "immune", "ban", { id: "trusted-1", force: true }), false);
  assert.equal(h.actions.filter(action => action[0] === "ban").length, 0);
  assert.equal(await h.manager.recordAction(h.guild, "immune", "ban", { id: "trusted-2" }), true);
  assert.equal(h.actions.filter(action => action[0] === "ban").length, 1);
});

test("failed hierarchy checks back off and do not start recovery", async () => {
  const h = harness({ config: { maxBans: 1 }, member: { bannable: false, kickable: false } });
  for (let i = 0; i < 20; i++) await h.manager.recordAction(h.guild, "attacker", "ban", { id: `e${i}` });
  assert.equal(h.actions.filter(a => a[0] === "error").length, 1);
  await h.advance(5000);
  assert.equal(h.actions.filter(a => a[0] === "restore").length, 0);
});

test("webhook flood deletes the webhook rather than banning its synthetic author", async () => {
  const h = harness();
  for (let i = 0; i < 20; i++) h.manager.handleMessage({ guild: h.guild, webhookId: "hook", author: { id: "hook", bot: true }, id: `${i}`, channel: h.channel });
  await h.advance(0);
  assert.equal(h.actions.filter(a => a[0] === "webhook").length, 1);
  assert.equal(h.actions.filter(a => a[0] === "ban").length, 0);
});

test("recovery deletes only attacker-attributed creations", async () => {
  const h = harness();
  h.guild.channels.cache.set("bad", { deletable: true, delete: async () => h.actions.push(["bad-removed"]) });
  h.guild.channels.cache.set("good", { deletable: true, delete: async () => assert.fail("unrelated channel deleted") });
  for (let i = 0; i < 3; i++) await h.manager.recordAction(h.guild, "attacker", "channelCreate", { id: `a${i}`, targetId: i === 2 ? "bad" : `missing${i}` });
  await h.advance(5000);
  assert.equal(h.actions.filter(a => a[0] === "bad-removed").length, 1);
});

test("mixed channel creates and deletes share the configured burst threshold", async () => {
  const h = harness();
  await h.manager.recordAction(h.guild, "attacker", "channelCreate", { id: "create-1", targetId: "new-channel" });
  await h.manager.recordAction(h.guild, "attacker", "channelDelete", { id: "delete-1", targetId: "old-channel" });
  await h.manager.recordAction(h.guild, "attacker", "channelCreate", { id: "create-2", targetId: "new-channel-2" });
  assert.equal(h.actions.filter(a => a[0] === "ban").length, 1);
  assert.equal(h.manager.active("1"), true);
});

test("weighted mass actions reach configured thresholds from a single audit entry", async () => {
  const h = harness();
  await h.manager.recordAction(h.guild, "attacker", "prune", { id: "prune-entry", weight: 3 });
  assert.equal(h.actions.filter(a => a[0] === "ban").length, 1);
});

test("attacker-created objects are cleaned even when snapshot auto-restore is disabled", async () => {
  const h = harness({ config: { maxChannelDelete: 1, autoRestore: false } });
  h.guild.channels.cache.set("new-channel", { id: "new-channel", deletable: true, delete: async reason => h.actions.push(["channel-delete", reason]) });
  await h.manager.recordAction(h.guild, "attacker", "channelCreate", { id: "create-entry", targetId: "new-channel" });
  await h.advance(5000);
  assert.equal(h.actions.filter(a => a[0] === "channel-delete").length, 1);
  assert.equal(h.actions.filter(a => a[0] === "restore").length, 0);
});

test("unauthorized bot-add action contains the inviter and kicks the added bot", async () => {
  const h = harness();
  const addedBot = { id: "added-bot", user: { bot: true }, kickable: true, kick: async reason => h.actions.push(["bot-kick", reason]) };
  h.guild.members.cache.set(addedBot.id, addedBot);
  await h.manager.recordAction(h.guild, "attacker", "botAdd", { id: "bot-add-entry", targetId: addedBot.id });
  assert.equal(h.actions.filter(a => a[0] === "ban").length, 1);
  assert.equal(h.actions.filter(a => a[0] === "bot-kick").length, 1);
});

test("AntiBot-whitelisted bots bypass AntiNuke bot-add containment", async () => {
  const h = harness();
  const addedBot = { id: "trusted-bot", user: { bot: true }, kickable: true, kick: async reason => h.actions.push(["bot-kick", reason]) };
  h.guild.members.cache.set(addedBot.id, addedBot);
  const contained = await h.manager.recordAction(h.guild, "attacker", "botAdd", { id: "trusted-entry", targetId: addedBot.id });
  assert.equal(contained, false);
  assert.equal(h.actions.filter(a => a[0] === "ban" || a[0] === "bot-kick").length, 0);
});

test("critical requests have reserved bounded capacity and run before routine work", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../utils/apiQueue.js"), "utf8");
  const ctx = vm.createContext({ module: { exports: {} }, console, Date, setInterval: () => ({ unref() {} }) });
  vm.runInContext(source, ctx);
  const queue = new ctx.PriorityRequestQueue({ maxPending: 1 });
  queue.pump = () => {};
  queue.enqueue("ordinary", () => {});
  await assert.rejects(queue.enqueue("overflow", () => {}), { code: "QUEUE_FULL" });
  queue.enqueue("containment", () => {}, { priority: "critical" });
  assert.equal(queue.nextJob().route, "containment");
  assert.equal(queue.nextJob().route, "ordinary");
});

test("REST suppression also drops routine work queued before emergency detection", async () => {
  let active = false;
  let sent = 0;
  const ctx = vm.createContext({ module: { exports: {} }, console, Date, setInterval: () => ({ unref() {} }),
    soezyEmergency: { requestPolicy: () => ({ paused: active }) },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../utils/apiQueue.js"), "utf8"), ctx);
  ctx.soezyApiQueue.pump = () => {};
  const rest = { post: async () => { sent++; } };
  ctx.installSoezyRestQueue(rest, "test");
  const queued = rest.post("/channels/1/messages");
  const job = ctx.soezyApiQueue.nextJob();
  active = true;
  assert.throws(() => job.task(), { code: "EMERGENCY_PAUSED" });
  job.resolve(null);
  await queued;
  await assert.rejects(rest.post("/channels/1/messages"), { code: "EMERGENCY_PAUSED" });
  assert.equal(sent, 0);
});

test("snapshot recovery reuses restored IDs, remaps overwrites and never regrants attacker roles", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../utils/embedBuilders/moderationEmbeds.js"), "utf8");
  const start = source.indexOf("async function restoreGuildFromSnapshot(");
  const end = source.indexOf("/* ================= WARNING SYSTEM", start);
  const snapshot = {
    roles: [
      { id: "old-role", name: "Members", permissions: "1" },
      { id: "existing-role", name: "Moderators", color: 0x336699, hoist: true, mentionable: true, permissions: "1", position: 2 },
    ],
    channels: [
      { id: "old-category", name: "Private", type: discord.ChannelType.GuildCategory, permissionOverwrites: [{ id: "old-role", type: 0, allow: "1", deny: "0" }] },
      { id: "old-channel", name: "chat", type: discord.ChannelType.GuildText, parentId: "old-category", permissionOverwrites: [{ id: "old-role", type: 0, allow: "1", deny: "0" }] },
      { id: "existing-channel", name: "chat-original", type: discord.ChannelType.GuildText, topic: "original topic", nsfw: false, rateLimitPerUser: 0, parentId: null, position: 4, permissionOverwrites: [] },
    ],
    memberRoles: { member: ["old-role"], attacker: ["old-role"] },
    settings: { name: "Original server", verificationLevel: 3, defaultMessageNotifications: 1, explicitContentFilter: 2, systemChannelId: null, afkChannelId: null, afkTimeout: 300, preferredLocale: "en-US" },
  };
  const created = [];
  const assigned = [];
  const roles = new discord.Collection();
  const channels = new discord.Collection();
  const existingRole = { id: "existing-role", editable: true, name: "Changed", color: 0, hoist: false, mentionable: false, permissions: { bitfield: 0n }, position: 9, edit: async patch => {
    Object.assign(existingRole, patch);
    if (patch.permissions !== undefined) existingRole.permissions = { bitfield: patch.permissions };
  } };
  roles.set(existingRole.id, existingRole);
  const existingChannel = { id: "existing-channel", editable: true, name: "changed", topic: "changed topic", nsfw: true, rateLimitPerUser: 30, parentId: "bad-parent", position: 99, permissionOverwrites: { set: async values => { if (values.length) assert.equal(values[0].id, "new-role"); } }, edit: async patch => {
    Object.assign(existingChannel, patch);
    if ("parent" in patch) existingChannel.parentId = patch.parent;
  } };
  channels.set(existingChannel.id, existingChannel);
  let nextChannelId = 0;
  const guildEdits = [];
  const guild = {
    id: "guild", name: "Changed server", verificationLevel: 0, defaultMessageNotifications: 0, explicitContentFilter: 0, systemChannelId: "some-channel", afkChannelId: "some-afk", afkTimeout: 60, preferredLocale: "en-GB",
    edit: async patch => { guildEdits.push(patch); Object.assign(guild, patch); },
    roles: { cache: roles, create: async options => { const role = { id: "new-role", permissions: { bitfield: 1n } }; roles.set(role.id, role); created.push(options); return role; } },
    channels: { cache: channels, fetch: async () => channels, create: async options => {
      const channel = { id: `new-${nextChannelId++}`, permissionOverwrites: { set: async values => { if (values.length) assert.equal(values[0].id, "new-role"); } } };
      channels.set(channel.id, channel); created.push(options); return channel;
    } },
    members: { fetch: async () => {}, cache: new Map([
      ["member", { roles: { cache: new Map(), add: async ids => assigned.push(ids) } }],
      ["attacker", { roles: { cache: new Map(), add: async () => assert.fail("regranted attacker roles") } }],
    ]) },
  };
  const ctx = vm.createContext({ ChannelType: discord.ChannelType, nukeSnapshots: new Map([["guild", snapshot]]) });
  vm.runInContext(source.slice(start, end), ctx);
  const options = { roles: true, channels: true, memberRoles: true, perms: true, settings: true, excludedMembers: new Set(["attacker"]) };
  const first = await ctx.restoreGuildFromSnapshot(guild, options);
  assert.equal(first.rolesRestored, 2);
  assert.equal(first.channelsRestored, 2);
  assert.equal(created[2].parent, "new-0");
  assert.equal(created[2].permissionOverwrites[0].id, "new-role");
  assert.equal(assigned[0][0], "new-role");
  assert.equal(existingRole.name, "Moderators");
  assert.equal(existingRole.permissions.bitfield, 1n);
  assert.equal(existingChannel.name, "chat-original");
  assert.equal(existingChannel.topic, "original topic");
  assert.equal(guild.name, "Original server");
  assert.equal(guild.verificationLevel, 3);
  assert.equal(guildEdits.length, 1);
  const second = await ctx.restoreGuildFromSnapshot(guild, options);
  assert.equal(second.rolesRestored, 0);
  assert.equal(second.channelsRestored, 0);
  assert.equal(created.length, 3);
});

test("legacy kick and strip settings cannot override ban-only enforcement", async () => {
  for (const punishment of ["kick", "strip"]) {
    const h = harness({ config: { punishment, maxBans: 1 } });
    await h.manager.recordAction(h.guild, "attacker", "ban", { id: punishment });
    assert.equal(h.actions.filter(action => action[0] === "ban").length, 1);
    assert.equal(h.actions.filter(action => action[0] === "kick").length, 0);
  }
});

test("real gateway handler enforces without the feature-events block-local helper", async () => {
  let listener;
  const h = harness({ config: { maxChannelDelete: 1 } });
  const ctx = vm.createContext({
    ...discord, require: () => ({ createEmergencyProtection: deps => createEmergencyProtection({ ...deps, setTimeout: () => ({ unref() {} }) }) }),
    client: { user: { id: "self" }, on: (_event, fn) => { listener = fn; } },
    guildData: () => ({ antinuke: h.config }),
    isAntiNukeWhitelisted: () => false, isAntibotWhitelisted: () => false,
    setInterval: () => ({ unref() {} }), console,
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../handlers/emergency.js"), "utf8"), ctx);
  const entry = { id: "real-entry", action: discord.AuditLogEvent.ChannelDelete, executorId: "attacker", targetId: "deleted", createdTimestamp: Date.now() };
  await listener(entry, h.guild);
  assert.equal(h.actions.filter(action => action[0] === "ban").length, 1);
  h.config.enabled = false;
  await listener({ ...entry, id: "disabled-entry" }, h.guild);
  assert.equal(h.actions.filter(action => action[0] === "ban").length, 1);
});

test("every registered audit protection reaches enforcement and honors its toggle", async () => {
  const source = fs.readFileSync(path.join(__dirname, "../handlers/emergency.js"), "utf8");
  const routes = [...source.matchAll(/\[AuditLogEvent\.(\w+), \["[^"]+", "([^"]+)"\]\]/g)];
  assert.ok(routes.length > 50);
  for (const [, event, setting] of routes) {
    assert.notEqual(discord.AuditLogEvent[event], undefined, event);
    let listener;
    const h = harness({ config: { maxBans: 1, maxKicks: 1, maxChannelDelete: 1, maxRoleDelete: 1, events: {} } });
    const ctx = vm.createContext({
      ...discord, require: () => ({ createEmergencyProtection: deps => createEmergencyProtection({ ...deps, setTimeout: () => ({ unref() {} }) }) }),
      client: { user: { id: "self" }, on: (_event, fn) => { listener = fn; } },
      guildData: () => ({ antinuke: h.config }),
      isAntiNukeWhitelisted: () => false, isAntibotWhitelisted: () => false,
      setInterval: () => ({ unref() {} }), console,
    });
    vm.runInContext(source, ctx);
    const entry = { id: event, action: discord.AuditLogEvent[event], executorId: "attacker", targetId: "target", createdTimestamp: Date.now(),
      changes: [{ key: "permissions", old: "0", new: "8" }, { key: "$remove", new: [{ id: "123456789012345678" }] }, { key: "mute", new: true }] };
    h.config.events[setting] = false;
    await listener(entry, h.guild);
    assert.equal(h.actions.length, 0, `${event}: disabled`);
    h.config.events[setting] = true;
    for (let i = 0; i < 3; i++) await listener({ ...entry, id: `${event}-${i}` }, h.guild);
    assert.equal(h.actions.filter(action => action[0] === "ban").length, 1, `${event}: enabled`);
  }
});

test("failed ban hierarchy never reports successful containment", async () => {
  const h = harness({ config: { punishment: "strip", maxBans: 1 }, member: { bannable: false } });
  await h.manager.recordAction(h.guild, "attacker", "ban", { id: "blocked-ban" });
  await h.advance(5000);
  assert.equal(h.actions.length, 1);
  assert.equal(h.actions[0][0], "error");
});

test("gateway audit listener routes destructive events and respects event toggles", async () => {
  let listener;
  const calls = [];
  const gd = { antinuke: { events: {} } };
  const ctx = vm.createContext({
    ...discord, require: () => ({ createEmergencyProtection: () => ({ recordAction: async (...args) => calls.push(args), prune() {} }) }),
    client: { on: (_event, fn) => { listener = fn; } }, guildData: () => gd,
    isAntiNukeWhitelisted: () => false, setInterval: () => ({ unref() {} }),
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../handlers/emergency.js"), "utf8"), ctx);
  const entry = { id: "audit", action: discord.AuditLogEvent.ChannelDelete, executorId: "attacker", targetId: "deleted", createdTimestamp: Date.now() };
  await listener(entry, { id: "guild" });
  assert.equal(calls[0][1], "attacker");
  assert.equal(calls[0][2], "channelDelete");
  assert.equal(calls[0][3].targetId, "deleted");
  await listener({ ...entry, id: "bot-add", action: discord.AuditLogEvent.BotAdd, targetId: "new-bot" }, { id: "guild" });
  assert.equal(calls[1][2], "botAdd");
  assert.equal(calls[1][3].targetId, "new-bot");
  await listener({ ...entry, id: "guild-update", action: discord.AuditLogEvent.GuildUpdate, changes: [{ key: "verification_level", new: 4 }] }, { id: "guild" });
  assert.equal(calls[2][2], "guildUpdate");
  assert.equal(calls[2][3].force, true);
  await listener({ ...entry, id: "prune", action: discord.AuditLogEvent.MemberPrune, extra: { removed: 25 } }, { id: "guild" });
  assert.equal(calls[3][2], "prune");
  assert.equal(calls[3][3].weight, 25);
  gd.antinuke.events.antichanneldelete = false;
  await listener(entry, { id: "guild" });
  await listener({ ...entry, action: discord.AuditLogEvent.RoleUpdate, changes: [{ key: "name", new: "test" }] }, { id: "guild" });
  gd.antinuke.events.antibot = false;
  await listener({ ...entry, id: "bot-add-disabled", action: discord.AuditLogEvent.BotAdd }, { id: "guild" });
  assert.equal(calls.length, 5);
  assert.equal(calls[4][2], "roleUpdate");
});
