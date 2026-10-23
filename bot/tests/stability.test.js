"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const root = path.resolve(__dirname, "..");
const source = file => fs.readFileSync(path.join(root, file), "utf8");

function scratchDirectory(t) {
  const os = require("node:os");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "soezy-stability-test-"));
  t.after(() => {
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith("soezy-stability-test-"));
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

test("real filesystem atomic write creates valid JSON and leaves no database temp file", async t => {
  const dir = scratchDirectory(t);
  const file = path.join(dir, "database.json");
  fs.writeFileSync(file, '{"old":true}');
  const ctx = vm.createContext({ require, module: { exports: {} }, Date, console, setTimeout, clearTimeout });
  vm.runInContext(source("utils/dbWriteQueue.js"), ctx);
  assert.equal(await ctx.flushDatabaseWrite(file, () => ({ newest: true })), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { newest: true });
  assert.equal(fs.existsSync(`${file}.tmp`), false);
  const backups = fs.readdirSync(path.join(dir, "logs/db-backups"));
  assert.equal(backups.length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "logs/db-backups", backups[0]), "utf8")), { newest: true });
});

test("audit logs rotate on disk and retain bounded generations", async t => {
  const dir = scratchDirectory(t);
  const file = path.join(dir, "audit.log");
  const append = require("../utils/boundedLog").createBoundedLog(file, { maxBytes: 100, backups: 3 });
  for (let i = 0; i < 10; i++) await append(JSON.stringify({ i, text: "a".repeat(45) }));
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 4);
  for (const name of files) assert.ok(fs.statSync(path.join(dir, name)).size <= 100);
});

function writerHarness() {
  let now = 1800000000000;
  const files = new Map([[path.resolve("database.json"), '{"value":0}']]);
  const timers = new Map();
  const errors = [];
  let timerId = 0;
  let failure = null;
  let writes = 0;
  let hold = null;
  const fakeFs = {
    existsSync: file => files.has(file), mkdirSync() {},
    promises: {
      unlink: async file => { if (!files.delete(file)) throw Object.assign(new Error("missing"), { code: "ENOENT" }); },
      open: async file => ({
        writeFile: async json => { writes++; files.set(file, json.slice(0, 4)); if (failure) throw Object.assign(new Error(failure), { code: failure }); if (hold) await hold; files.set(file, json); },
        sync: async () => {}, close: async () => {},
      }),
      rename: async (from, to) => { if (failure === "RENAME") throw new Error("rename failed"); files.set(to, files.get(from)); files.delete(from); },
      copyFile: async (from, to) => files.set(to, files.get(from)),
      readdir: async dir => [...files.keys()].filter(file => path.dirname(file) === dir).map(file => path.basename(file)),
    },
  };
  const context = vm.createContext({ module: { exports: {} },
    require: name => name === "fs" ? fakeFs : require(name),
    Date: class extends Date { static now() { return now; } },
    console: { error: line => errors.push(line), warn: line => errors.push(line) },
    setTimeout: (fn, delay) => { const id = { id: ++timerId, unref() {} }; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  vm.runInContext(source("utils/dbWriteQueue.js"), context);
  return { api: context.module.exports, files, timers, errors, context,
    setFailure(value) { failure = value; }, setHold(value) { hold = value; }, advance(ms) { now += ms; },
    get writes() { return writes; }, value() { return JSON.parse(files.get(path.resolve("database.json"))); } };
}

test("ENOSPC keeps original JSON, coalesces 10000 saves, backs off and recovers newest state", async () => {
  const h = writerHarness();
  let value = 1;
  h.setFailure("ENOSPC");
  assert.equal(await h.api.flushDatabaseWrite("database.json", () => ({ value })), false);
  assert.deepEqual(h.value(), { value: 0 });
  assert.equal(h.files.has(path.resolve("database.json.tmp")), false);
  for (let i = 0; i < 10000; i++) { value++; h.api.queueDatabaseWrite("database.json", () => ({ value })); }
  assert.equal(h.timers.size, 1);
  assert.equal(h.api.getDbWriteQueueStats().pending, 1);
  await h.api.flushDatabaseWrite();
  assert.equal(h.writes, 1);
  assert.equal(h.errors.length, 1);
  h.setFailure(null); h.advance(600000);
  assert.equal(await h.api.flushDatabaseWrite(), true);
  assert.deepEqual(h.value(), { value: 10001 });
  assert.equal(h.api.getDbWriteQueueStats().pending, 0);
  assert.equal(h.timers.size, 0);
});

test("in-flight saves serialize and shutdown persists the latest update", async () => {
  const h = writerHarness();
  let release;
  h.setHold(new Promise(resolve => { release = resolve; }));
  const first = h.api.flushDatabaseWrite("database.json", () => ({ value: 1 }));
  h.api.queueDatabaseWrite("database.json", () => ({ value: 2 }));
  const joined = h.api.flushDatabaseWrite();
  assert.equal(first, joined);
  const stopped = h.api.shutdownDatabaseWrites("database.json", () => ({ value: 3 }));
  release(); h.setHold(null);
  assert.equal(await stopped, true);
  assert.equal(h.writes, 2);
  assert.deepEqual(h.value(), { value: 3 });
  assert.equal(h.timers.size, 0);
});

test("rename failures preserve original database and clean temporary file", async () => {
  const h = writerHarness(); h.setFailure("RENAME");
  assert.equal(await h.api.flushDatabaseWrite("database.json", () => ({ value: 2 })), false);
  assert.deepEqual(h.value(), { value: 0 });
  assert.equal(h.files.has(path.resolve("database.json.tmp")), false);
});

test("automatic backup rotation preserves manual/pre-migration backups", async () => {
  const h = writerHarness();
  const dir = path.resolve("logs/db-backups");
  const manual = path.join(dir, "database-pre-stability-20260928-002024.json");
  h.files.set(manual, "manual backup");
  for (let i = 1; i <= 8; i++) h.files.set(path.join(dir, `database-2026-09-0${i}T00-00-00-000Z.json`), "{}");
  await h.api.flushDatabaseWrite("database.json", () => ({ value: 1 }));
  assert.equal(h.files.get(manual), "manual backup");
  assert.equal([...h.files.keys()].filter(file => path.dirname(file) === dir).length, 6);
});

function listenerHarness() {
  const text = source("utils/runtimeManager.js");
  const context = vm.createContext({ process: {}, console: { log() {}, warn() {}, error() {} } });
  vm.runInContext(text.slice(0, text.indexOf("function soezyInteractionAlreadyAcked")), context);
  const emitter = new EventEmitter();
  context.installSoezyClientListenerGuard(emitter);
  return { emitter, context };
}

test("wrapped Discord listeners can be removed using their original callbacks", () => {
  const { emitter } = listenerHarness();
  for (let i = 0; i < 10000; i++) {
    const callback = () => {};
    emitter.on("raw", callback);
    emitter.on("guildMembersChunk", callback);
    assert.equal(emitter.listeners("raw")[0], callback);
    emitter.off("raw", callback);
    emitter.removeListener("guildMembersChunk", callback);
  }
  assert.equal(emitter.listenerCount("raw"), 0);
  assert.equal(emitter.listenerCount("guildMembersChunk"), 0);
});

test("once callbacks fire once, are removable before firing, and registration is idempotent", () => {
  const { emitter, context } = listenerHarness();
  let calls = 0; const callback = () => calls++;
  emitter.once("ready", callback);
  emitter.off("ready", callback);
  emitter.emit("ready"); assert.equal(calls, 0);
  emitter.once("ready", callback);
  emitter.emit("ready"); emitter.emit("ready");
  assert.equal(calls, 1); assert.equal(emitter.listenerCount("ready"), 0);
  const on = emitter.on;
  context.installSoezyClientListenerGuard(emitter);
  assert.equal(emitter.on, on);
});

test("actual Discord.js member fetches release raw/chunk listeners after completion", async () => {
  const { Client, Guild, Collection, Events } = require("discord.js");
  const { context } = listenerHarness();
  const client = new Client({ intents: [] });
  context.installSoezyClientListenerGuard(client);
  const guild = new Guild(client, { id: "1345717715892961333", name: "offline-test", roles: [], emojis: [], features: [], shard_id: 0 });
  client.ws.shards.set(guild.shardId, { send(packet) {
    queueMicrotask(() => client.emit(Events.GuildMembersChunk, new Collection(), guild, { nonce: packet.d.nonce, count: 1 }));
  }, destroy() {} });
  const initial = client.getMaxListeners();
  for (let i = 0; i < 50; i++) await guild.members.fetch();
  assert.equal(client.listenerCount(Events.Raw), 0);
  assert.equal(client.listenerCount(Events.GuildMembersChunk), 0);
  assert.equal(client.getMaxListeners(), initial);
  client.ws.shards.clear();
  await client.destroy();
});

test("spoiler sessions release expired attachments and reject excess memory", () => {
  const { SpoilerSessionStore } = require("../utils/spoilerSessions");
  const store = new SpoilerSessionStore({ maxBytes: 100, maxEntries: 2 });
  store.set("one", { expiresAt: Date.now() + 10000, attachment: { buffer: "a".repeat(30) } });
  assert.throws(() => store.set("two", { expiresAt: Date.now() + 10000, attachment: { buffer: "a".repeat(30) } }), /busy/);
  store.cleanup(Date.now() + 20000);
  assert.equal(store.size, 0); assert.equal(store.usedBytes, 0);
});

function confirmationHarness() {
  const timers = new Map();
  // Fluent builders are presentation only; the tests drive the real state/handler functions.
  function builder() { return new Proxy({}, { get: (_target, key) => key === "then" ? undefined : () => builder() }); }
  const ctx = vm.createContext({
    Map, Set, Date, Math, Promise, console,
    ActionRowBuilder: builder, ButtonBuilder: builder, ContainerBuilder: builder,
    ButtonStyle: { Success: 1, Danger: 2 }, SeparatorSpacingSize: { Small: 1 },
    MessageFlags: { IsComponentsV2: 32768 }, PermissionsBitField: { Flags: { ManageMessages: 8192 } },
    createErrorContainer: (title, message) => ({ title, message }),
    setTimeout: fn => { const id = { unref() {} }; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id),
  });
  const code = source("events/messageCreate.js");
  vm.runInContext(code.slice(code.indexOf("const moderationConfirmations ="), code.indexOf("function resolveSystemName")), ctx);
  let allowed = true;
  const member = { permissions: { has: () => allowed } };
  const guild = { id: "100000000000000001", members: { fetch: async () => member, fetchMe: async () => member } };
  const panel = { id: "panel", edit: async () => {}, delete: async () => {} };
  const msg = { author: { id: "100000000000000002" }, guild, reply: async () => panel };
  const open = async () => {
    const result = ctx.requestModerationConfirmation(msg, { permission: "ManageMessages" });
    await new Promise(resolve => setImmediate(resolve));
    const state = [...ctx.__soezyModerationConfirmations.values()][0];
    const click = { customId: state.confirmId, message: panel, isButton: () => true, guild, guildId: guild.id, member, user: msg.author,
      reply: async payload => { click.response = payload; }, followUp: async payload => { click.response = payload; },
      update: async () => {}, deferUpdate: async () => { click.deferred = true; } };
    return { result, state, click };
  };
  return { ctx, timers, open, deny() { allowed = false; } };
}

test("confirmation rejects outsiders and duplicates; valid execution happens only once", async () => {
  const h = confirmationHarness(); const { click, result } = await h.open();
  const outsider = { ...click, user: { id: "wrong" } };
  await h.ctx.handleModerationConfirmationInteraction(outsider);
  assert.equal(h.ctx.__soezyModerationConfirmations.size, 2);
  await Promise.all([h.ctx.handleModerationConfirmationInteraction(click), h.ctx.handleModerationConfirmationInteraction({ ...click })]);
  assert.equal((await result).interaction, click);
  assert.equal(h.ctx.__soezyModerationConfirmations.size, 0);
  assert.equal(h.timers.size, 0);
});

test("permission revoked while confirmation is open prevents execution", async () => {
  const h = confirmationHarness(); const { click, result } = await h.open();
  h.deny(); await h.ctx.handleModerationConfirmationInteraction(click);
  assert.equal(await result, false); assert.equal(h.timers.size, 0);
});

test("cancel, timeout and failed acknowledgement settle pending actions", async () => {
  for (const scenario of ["cancel", "timeout", "ackFailure"]) {
    const h = confirmationHarness(); const { click, result, state } = await h.open();
    if (scenario === "timeout") await [...h.timers.values()][0]();
    else {
      if (scenario === "cancel") click.customId = state.cancelId;
      else click.deferUpdate = async () => { throw new Error("expired interaction"); };
      await h.ctx.handleModerationConfirmationInteraction(click);
    }
    assert.equal(await result, false, scenario);
    assert.equal(h.ctx.__soezyModerationConfirmations.size, 0, scenario);
  }
});

test("cleanup recognizes legacy hyphen-separated guild/user runtime keys", () => {
  const code = source("utils/embedBuilders/dashboardEmbeds.js");
  const callbacks = [];
  const guilds = [];
  const key = "1345717715892961333-1113012632270667908";
  const ctx = vm.createContext({ Date, setInterval: fn => callbacks.push(fn),
    antiNukeActions: new Map([[key, []]]), spamTracker: new Map([[key, []]]),
    guildData: id => { guilds.push(id); return {}; } });
  vm.runInContext(code.slice(code.indexOf("// Anti-Nuke Action Cleanup Timer")), ctx);
  callbacks.forEach(fn => fn());
  assert.deepEqual(guilds, ["1345717715892961333", "1345717715892961333"]);
});

test("saveDB only synchronizes touched guild feature stores and never triggers global cache rebuilds", () => {
  const calls = [];
  const ctx = vm.createContext({ db: {},
    __soezyTouchedGuilds: new Set(["1345717715892961333"]),
    isDiscordGuildId: id => /^\d{17,20}$/.test(String(id || "")),
    syncGuildFeatureStoresFromGuildData: id => calls.push(id),
    syncRuntimeState: () => { throw new Error("unexpected global sync"); },
    queueDatabaseWrite: () => {},
  });
  const code = source("utils/database.js");
  vm.runInContext(code.slice(code.indexOf("function saveDB("), code.indexOf("// Shutdown persistence")), ctx);
  ctx.saveDB(); ctx.saveDB();
  assert.deepEqual(calls, ["1345717715892961333"]);
});

test("legacy direct blacklist mutations are visible without rebuilding every guild", () => {
  const ctx = vm.createContext({ db: { guilds: { "1345717715892961333": {} } }, console: { log() {} } });
  vm.runInContext(source("utils/blacklistManager.js"), ctx);
  const gd = ctx.db.guilds["1345717715892961333"];
  gd.security.blacklistedUsers["1113012632270667908"] = {};
  assert.equal(ctx.isBlacklisted("1345717715892961333", "1113012632270667908"), true);
  delete gd.security.blacklistedUsers["1113012632270667908"];
  assert.equal(ctx.isBlacklisted("1345717715892961333", "1113012632270667908"), false);
});

test("API queue has a hard admission limit and releases idle route state", async () => {
  const ctx = vm.createContext({ module: { exports: {} }, console, Date, setInterval: () => ({ unref() {} }) });
  vm.runInContext(source("utils/apiQueue.js"), ctx);
  const queue = new ctx.PriorityRequestQueue({ maxPending: 2 });
  queue.pump = () => {};
  queue.enqueue("test", () => {}); queue.enqueue("test", () => {});
  await assert.rejects(queue.enqueue("test", () => {}), { code: "QUEUE_FULL" });
  assert.equal(queue.size(), 2);
  queue.routeNextAt.set("old", Date.now() - 120000);
  queue.cleanup(); assert.equal(queue.routeNextAt.size, 0);
});

test("PM2 starts the bot and embedded web app as one service", () => {
  const { apps } = require("../ecosystem.config");
  assert.equal(apps.length, 1);
  assert.equal(apps[0].name, "Soezy");
  assert.equal(apps[0].instances, 1);
  assert.equal(apps[0].env.SOEZY_START_WEB, "false");
  assert.equal(apps[0].env.SOEZY_BOT_DIR, require("node:path").resolve(__dirname, ".."));
  assert.ok(apps[0].kill_timeout >= 15000);
});
