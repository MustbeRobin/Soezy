"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const discord = require("discord.js");
const source = fs.readFileSync(require("node:path").join(__dirname, "../utils/wallAppeals.js"), "utf8");
const G = "111111111111111111", U = "222222222222222222", Q = "333333333333333333", B = "444444444444444444";
function fixture() {
  const ws = { enabled: true, quarantineRoleId: Q, appealChannelId: "lobby", quarantined: { [G]: { [U]: {} } } };
  const channels = new Map();
  const gd = { wallSystem: ws, autoJail: { jailedUsers: [U], violations: { [U]: { releaseAt: 123 } } } };
  const created = [], sent = [], edits = [];
  const make = (id, type = 0) => ({ id, type, send: async payload => { sent.push(payload); return { id: "panel" }; },
    permissionOverwrites: { edit: async (...args) => edits.push(args) },
    messages: { fetch: async () => ({ edit: async () => ({ id: "panel" }) }) },
    delete: async () => channels.delete(id) });
  const guild = { id: G, ownerId: "555555555555555555", client: { user: { id: B } },
    channels: { fetch: async id => channels.get(id) || null, create: async options => {
      created.push(options); const ch = make(`channel${created.length}`, options.type); channels.set(ch.id, ch); return ch;
    } } };
  const ctx = { ...discord, ensureWallState: () => ws, guildData: () => gd, wallSaveAndSync() {},
    isAuthorizedInteraction: i => !!i.admin, isSessionOwner: () => true, console: { error() {} } };
  vm.createContext(ctx); vm.runInContext(source, ctx);
  const interaction = () => ({ guild, guildId: G, user: { id: U }, channelId: "lobby", customId: "wallappeal_open",
    deferReply: async function() { this.deferred = true; }, editReply: async function(payload) { this.result = payload; },
    reply: async function(payload) { this.result = payload; }, member: { roles: { cache: new Map() } } });
  return { ws, gd, channels, created, sent, edits, make, guild, ctx, interaction };
}
test("wall panel is read-only and reuses its panel and shared voice", async () => {
  const f = fixture(), lobby = f.make("lobby");
  await f.ctx.wallEnsureAppealPanel(f.guild, lobby, { id: Q });
  await f.ctx.wallEnsureAppealPanel(f.guild, lobby, { id: Q });
  assert.equal(f.created.length, 1);
  assert.equal(f.sent.length, 0);
  assert.equal(f.edits[0][1].SendMessages, false);
  assert.equal(f.edits[0][1].CreatePublicThreads, false);
});
test("appeals are private and duplicate concurrent requests create one channel", async () => {
  const f = fixture();
  await Promise.all([f.ctx.handleWallAppealInteraction(f.interaction()), f.ctx.handleWallAppealInteraction(f.interaction())]);
  assert.equal(f.created.length, 1);
  const overwrites = f.created[0].permissionOverwrites;
  assert.ok(overwrites.find(o => o.id === G).deny.includes(discord.PermissionsBitField.Flags.ViewChannel));
  assert.ok(overwrites.find(o => o.id === U).allow.includes(discord.PermissionsBitField.Flags.SendMessages));
  await f.ctx.handleWallAppealInteraction(f.interaction());
  assert.equal(f.created.length, 1);
});
test("only quarantined members can open from the correct panel while enabled", async () => {
  for (const modify of [f => { f.ws.enabled = false; }, f => { f.ws.quarantined[G] = {}; }, f => { f.ws.appealChannelId = "elsewhere"; }]) {
    const f = fixture(); modify(f);
    await f.ctx.handleWallAppealInteraction(f.interaction());
    assert.equal(f.created.length, 0);
  }
});
test("staff role is the only allowed role ping", async () => {
  const f = fixture(); f.ws.appealAdminRoleId = "666666666666666666";
  await f.ctx.handleWallAppealInteraction(f.interaction());
  assert.equal(JSON.stringify(f.sent[0].allowedMentions), JSON.stringify({ parse: [], roles: [f.ws.appealAdminRoleId], users: [] }));
});
test("own appeal and shared voice are exempt, other appeals are not", () => {
  const f = fixture(); f.ws.appeals = { [U]: { channelId: "mine" } }; f.ws.appealVoiceChannelId = "voice";
  assert.equal(f.ctx.wallAppealAllowsMessage(f.ws, U, "mine"), true);
  assert.equal(f.ctx.wallAppealAllowsMessage(f.ws, U, "voice"), true);
  assert.equal(f.ctx.wallAppealAllowsMessage(f.ws, U, "other"), false);
});
test("only staff can cancel an appeal; it deletes the channel without releasing the member", async () => {
  const f = fixture(); await f.ctx.handleWallAppealInteraction(f.interaction());
  const i = f.interaction(); i.customId = `wallappeal_close_${U}`; i.channelId = f.ws.appeals[U].channelId;
  i.channel = f.channels.get(i.channelId); i.message = { edit: async () => {} };
  await f.ctx.handleWallAppealInteraction(i); assert.ok(f.ws.appeals[U]);
  i.admin = true;
  await f.ctx.handleWallAppealInteraction(i); assert.equal(f.ws.appeals[U], undefined);
  assert.equal(f.channels.has(i.channelId), false);
  assert.ok(f.ws.quarantined[G][U]);
});

test("appeal container includes the AutoJail role and both decision buttons", async () => {
  const f = fixture(); f.gd.autoJail.adminRoleId = Q;
  await f.ctx.handleWallAppealInteraction(f.interaction());
  const panel = f.sent[0].components[0].toJSON();
  assert.deepEqual(panel.components.map(c => c.type), [10, 14, 10, 14, 1]);
  assert.ok(JSON.stringify(panel).includes(`<@&${Q}>`));
  assert.deepEqual(panel.components[4].components.map(b => b.label), ["Approve", "Cancel"]);
});

test("approval logs before deleting, clears AutoJail timers and retries safely after log failure", async () => {
  const f = fixture(); await f.ctx.handleWallAppealInteraction(f.interaction());
  const i = f.interaction(); i.admin = true; i.customId = `wallappeal_approve_${U}`;
  i.channelId = f.ws.appeals[U].channelId; i.channel = f.channels.get(i.channelId);
  let releases = 0, logs = 0;
  f.guild.members = { fetch: async () => ({ id: U }) };
  f.ctx.wallReleaseMember = async () => { releases++; delete f.ws.quarantined[G][U]; };
  await f.ctx.handleWallAppealInteraction(i);
  assert.equal(releases, 0); // No wall log configured.
  f.ws.logChannel = "logs";
  f.channels.set("logs", { id: "logs", send: async () => { logs++; if (logs === 1) throw new Error("offline"); return { id: "log1" }; } });
  await f.ctx.handleWallAppealInteraction(i);
  assert.equal(releases, 1);
  assert.ok(f.channels.has(i.channelId));
  assert.equal(f.gd.autoJail.violations[U].releaseAt, undefined);
  assert.equal(f.gd.autoJail.jailedUsers.length, 0);
  await f.ctx.handleWallAppealInteraction(i);
  assert.equal(releases, 1);
  assert.equal(logs, 2);
  assert.equal(f.channels.has(i.channelId), false);
  assert.equal(f.ws.appeals[U], undefined);
});

test("AutoJail sends the wall appeal container in the jail channel without pinging other members", async () => {
  const f = fixture();
  f.ws.jailChannelId = "lobby"; f.ws.appealPanelMessageId = "panel"; f.ws.appealVoiceChannelId = "voice";
  const lobby = f.make("lobby"); lobby.isTextBased = () => true; f.channels.set("lobby", lobby);
  assert.equal(await f.ctx.wallNotifyAutoJailAppeal({ id: U, guild: f.guild }), true);
  const payload = f.sent[0];
  const json = JSON.stringify(payload.components[0].toJSON());
  assert.match(json, /wallappeal_open/);
  assert.ok(json.includes(`<@${U}>`));
  assert.ok(json.includes("### Jailed User"));
  assert.ok(json.includes(`wallappeal_open_${U}`));
  assert.deepEqual(payload.components[0].toJSON().components.map(c => c.type), [10, 14, 10, 14, 1]);
  assert.equal(JSON.stringify(payload.allowedMentions), JSON.stringify({ parse: [], users: [U], roles: [] }));
  assert.equal(f.created.length, 0);
});

test("AutoJail does not send appeal notices for released members or disabled wall", async () => {
  const f = fixture();
  delete f.ws.quarantined[G][U];
  assert.equal(await f.ctx.wallNotifyAutoJailAppeal({ id: U, guild: f.guild }), false);
  f.ws.quarantined[G][U] = {}; f.ws.enabled = false;
  assert.equal(await f.ctx.wallNotifyAutoJailAppeal({ id: U, guild: f.guild }), false);
  assert.equal(f.sent.length, 0);
});

test("another member cannot use a personal appeal button", async () => {
  const f = fixture(), i = f.interaction(); i.customId = `wallappeal_open_${B}`;
  await f.ctx.handleWallAppealInteraction(i);
  assert.match(i.result.content, /another member/);
  assert.equal(f.created.length, 0);
});

test("auto release accepts zero and cancels old deadlines without releasing users", async () => {
  const source = fs.readFileSync(require("node:path").join(__dirname, "../events/interactionCreate.js"), "utf8");
  const start = source.indexOf('            const releaseMs = ["0", "off"');
  const end = source.indexOf("\n          saveDB();", start);
  const block = source.slice(start, end).replace(/\s*}\s*$/, "");
  for (const raw of ["0", "off", "disabled", "30m", "bad"]) {
    const aj = { autoReleaseMs: 123, violations: { user: { releaseAt: 456 } } };
    let error = false;
    await vm.runInNewContext(`(async () => { ${block} })()`, { raw, aj,
      parseDuration: value => value === "30m" ? 1800000 : null,
      createErrorContainer: () => ({}), MessageFlags: discord.MessageFlags,
      interaction: { reply: async () => { error = true; } } });
    assert.equal(error, raw === "bad");
    assert.equal(aj.autoReleaseMs, raw === "bad" ? 123 : raw === "30m" ? 1800000 : 0);
    if (["0", "off", "disabled"].includes(raw)) assert.equal(aj.violations.user.releaseAt, undefined);
  }
});

test("AutoJail invokes appeals once after saving and survives a notification failure", async () => {
  const text = fs.readFileSync(require("node:path").join(__dirname, "../utils/autoJailManager.js"), "utf8");
  const handler = text.slice(text.indexOf("async function triggerAutoJail("), text.indexOf("async function startAutoJailCleanup("));
  for (const duplicate of [false, true]) {
    let saved = false, notices = 0;
    const aj = { enabled: true, channelId: "trigger", jailedUsers: [] };
    const guild = { ownerId: "owner", members: { cache: new Map() }, channels: { cache: new Map() } };
    const member = { id: U, guild, permissions: { has: () => false }, roles: { cache: { some: () => false } } };
    const context = { RATE_LIMIT_MS: 1000, ensureAutoJailState: () => aj,
      __soezyAutoJailRuntime: { processingMessages: new Map() },
      guildData: () => ({ wallSystem: { enabled: true, quarantineRoleId: Q } }),
      wallQuarantineMember: async () => ({ alreadyQuarantined: duplicate }),
      wallNotifyAutoJailAppeal: async () => { assert.equal(saved, true); notices++; throw new Error("Missing permissions"); },
      createLoggingContainer: () => ({}), MessageFlags: discord.MessageFlags,
      saveDB: () => { saved = true; }, console: { warn() {}, error() {} } };
    vm.createContext(context); vm.runInContext(handler, context);
    const result = await context.triggerAutoJail({ guild, member, author: { id: U },
      channel: { id: "trigger", send: async () => {} }, delete: async () => {} }, G);
    assert.equal(result, !duplicate);
    assert.equal(notices, duplicate ? 0 : 1);
    assert.ok(aj.jailedUsers.includes(U));
  }
});
