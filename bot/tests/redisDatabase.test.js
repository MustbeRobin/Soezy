"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");
const { RedisDatabase, records, decode, exportDatabase } = require("../utils/redisDatabase");
const { installMemberFetchScheduler } = require("../utils/memberFetchScheduler");

class FakeRedis extends EventEmitter {
  constructor() { super(); this.isReady = true; this.values = new Map(); this.hashes = new Map(); this.commits = []; }
  async hGetAll(key) { if (!this.isReady) throw new Error("offline"); return { ...(this.hashes.get(key) || {}) }; }
  async eval(script, { keys, arguments: args }) {
    if (!this.isReady) throw new Error("offline");
    if (script.includes("'PX', 90000")) {
      const owner = this.values.get(keys[0]);
      if (owner && owner !== args[0]) return 0;
      this.values.set(keys[0], args[0]); return 1;
    }
    if (script.includes("redis.call('DEL'")) {
      if (this.values.get(keys[0]) === args[0]) return Number(this.values.delete(keys[0]));
      return 0;
    }
    if (this.values.get(keys[1]) !== args[0]) throw new Error("WRITER_LOCK_LOST");
    if (script.includes("'_schema', '1'")) {
      if (this.hashes.has(keys[0])) return 0;
      const data = { _schema: "1", _revision: "0", _migration: args[1] };
      for (let i = 2; i < args.length; i += 2) data[args[i]] = args[i + 1];
      this.hashes.set(keys[0], data); return 1;
    }
    const data = this.hashes.get(keys[0]);
    if (data._commit === args[2]) return data._revision;
    if (data._revision !== args[1]) throw new Error("DATABASE_REVISION_CONFLICT");
    for (const key of JSON.parse(args[3])) delete data[key];
    for (let i = 4; i < args.length; i += 2) data[args[i]] = args[i + 1];
    data._commit = args[2]; data._revision = String(Number(data._revision) + 1);
    this.commits.push(args.slice(4));
    if (this.loseReply) { this.loseReply = false; throw new Error("reply lost"); }
    return data._revision;
  }
}

async function fixture(t, data) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "soezy-redis-test-"));
  const file = path.join(directory, "database.json");
  const raw = JSON.stringify(data, null, 2);
  await fs.writeFile(file, raw);
  const redis = new FakeRedis();
  const stores = [];
  const open = async () => { const store = new RedisDatabase(redis, { file, prefix: "test" }); stores.push(store); await store.initialize(); return store; };
  t.after(async () => {
    for (const store of stores) await store.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { redis, file, raw, open };
}

test("first migration retains every section, composite keys and original bytes", async t => {
  const source = JSON.parse(await fs.readFile(path.join(__dirname, "../database.json"), "utf8"));
  source.intentionalComposite = { "1345717715892961333-1113012632270667908": { economy: 52, xp: 100 } };
  const h = await fixture(t, source);
  const store = await h.open();
  assert.deepEqual(store.db, source);
  assert.deepEqual(await store.read(), source);
  assert.equal(await fs.readFile(h.file, "utf8"), h.raw);
  const backups = await fs.readdir(path.join(path.dirname(h.file), "logs/db-backups"));
  assert.equal(backups.length, 1);
  assert.equal(await fs.readFile(path.join(path.dirname(h.file), "logs/db-backups", backups[0]), "utf8"), h.raw);
});

test("restart loads newer Redis data rather than importing stale JSON", async t => {
  const h = await fixture(t, { guilds: { g: { prefix: "." } }, users: { u: { coins: 4 } } });
  const first = await h.open();
  first.db.users.u.coins = 50;
  await first.write(); await first.close();
  const second = await h.open();
  assert.equal(second.db.users.u.coins, 50);
  assert.equal(await fs.readFile(h.file, "utf8"), h.raw);
});

test("single-record updates do not rewrite all guilds and support delete/array mutations", async t => {
  const h = await fixture(t, { guilds: { a: { x: 1 }, b: { x: 2 } }, users: { u: { coins: 1 } }, list: [1] });
  const store = await h.open();
  store.db.guilds.a.x = 3;
  await store.write();
  assert.equal(h.redis.commits[0].length, 2);
  assert.equal(h.redis.commits[0][0], '["guilds","a"]');
  await store.write(); assert.equal(h.redis.commits.length, 1);
  delete store.db.guilds.b; store.db.list.push(2);
  await store.write(); assert.deepEqual(await store.read(), store.db);
});

test("outage retains current memory and reconnect flushes latest state", async t => {
  const h = await fixture(t, { users: { u: { xp: 1 } } });
  const store = await h.open();
  h.redis.isReady = false;
  store.db.users.u.xp = 12;
  await assert.rejects(store.write(), /unavailable/);
  store.db.users.u.xp = 19;
  h.redis.isReady = true;
  await store.write();
  assert.equal((await store.read()).users.u.xp, 19);
  assert.equal(store.batch, null);
});

test("lost reply retries idempotently and preserves later mutations", async t => {
  const h = await fixture(t, { users: { u: 1 } });
  const store = await h.open();
  store.db.users.u = 2; h.redis.loseReply = true;
  await assert.rejects(store.write(), /reply lost/);
  store.db.users.u = 3;
  await store.write();
  assert.equal((await store.read()).users.u, 3);
  assert.equal(h.redis.commits.length, 2);
});

test("writer lease and revision conflicts prevent overwriting another process", async t => {
  const h = await fixture(t, { data: { k: 1 } });
  const store = await h.open();
  await assert.rejects(h.open(), /Another.*writer/);
  h.redis.hashes.get(store.key)._revision = "9";
  store.db.data.k = 2;
  await assert.rejects(store.write(), /REVISION_CONFLICT/);
  assert.equal((await store.read()).data.k, 1);
});

test("incomplete Redis data is never overwritten by JSON", async t => {
  const h = await fixture(t, { users: { a: 1 } });
  h.redis.hashes.set("test:data", { foreign: "keep" });
  await assert.rejects(h.open(), /unsupported/);
  assert.deepEqual(h.redis.hashes.get("test:data"), { foreign: "keep" });
});

test("export refuses existing paths and never changes the original", async t => {
  const h = await fixture(t, { guilds: {}, users: {} });
  const store = await h.open();
  const output = path.join(path.dirname(h.file), "database-backup.json");
  await exportDatabase(output, { client: h.redis, prefix: "test" });
  assert.deepEqual(JSON.parse(await fs.readFile(output)), store.db);
  await assert.rejects(exportDatabase(output, { client: h.redis, prefix: "test" }), { code: "EEXIST" });
  await assert.rejects(exportDatabase(h.file, { client: h.redis, prefix: "test" }), { code: "EEXIST" });
  assert.equal(await fs.readFile(h.file, "utf8"), h.raw);
});

test("offline shutdown checkpoint is recovered on restart without touching JSON", async t => {
  const h = await fixture(t, { users: { u: 1 } });
  const first = await h.open(); first.db.users.u = 2;
  await first.preservePending(); await first.close();
  const second = await h.open();
  assert.equal(second.db.users.u, 2);
  assert.equal((await second.read()).users.u, 2);
  assert.equal(await fs.readFile(h.file, "utf8"), h.raw);
});

test("record codec retains empty maps, arrays, primitive sections and suspicious-looking keys", () => {
  const data = JSON.parse('{"guilds":{"1-2":{"value":9}},"empty":{},"list":[1,2],"nil":null,"n":3,"__proto__":{"safe":true}}');
  const encoded = Object.fromEntries(records(data));
  assert.deepEqual(decode({ ...encoded, _schema: "1", _revision: "0", _migration: "test" }), data);
  assert.equal({}.safe, undefined);
});

test("existing write queue uses Redis, coalesces 10000 saves and never rewrites JSON", async t => {
  const h = await fixture(t, { users: { u: { coins: 0 } } });
  const store = await h.open();
  const before = await fs.stat(h.file);
  const ctx = vm.createContext({ require, module: { exports: {} }, soezyDatabase: store, Date, console, setTimeout, clearTimeout });
  vm.runInContext(await fs.readFile(path.join(__dirname, "../utils/dbWriteQueue.js"), "utf8"), ctx);
  for (let i = 0; i < 10000; i++) { store.db.users.u.coins = i; ctx.queueDatabaseWrite(h.file, () => store.db); }
  assert.equal(ctx.getDbWriteQueueStats().pending, 1);
  assert.equal(await ctx.flushDatabaseWrite(), true);
  assert.equal(h.redis.commits.length, 1);
  assert.equal((await store.read()).users.u.coins, 9999);
  assert.equal((await fs.stat(h.file)).mtimeMs, before.mtimeMs);
  assert.equal(await fs.readFile(h.file, "utf8"), h.raw);
  assert.equal(store.client.listenerCount("ready"), 1);
});

test("offline recovery refuses to replace a newer Redis revision", async t => {
  const h = await fixture(t, { users: { u: 1 } });
  const store = await h.open(); store.db.users.u = 2;
  await store.preservePending(); await store.close();
  h.redis.hashes.get(store.key)._revision = "5";
  await assert.rejects(h.open(), /conflict/);
  assert.equal((await store.read()).users.u, 1);
  assert.ok(await fs.stat(store.pendingFile));
});

test("central Redis client is a singleton with one error listener", () => {
  const { getRedisClient } = require("../utils/redis");
  const first = getRedisClient();
  assert.strictEqual(first, getRedisClient());
  assert.equal(first.listenerCount("error"), 1);
});

test("non-secret Redis connection settings come from config.json", () => {
  const { getRedisConfig } = require("../utils/redis");
  assert.deepEqual(getRedisConfig(), {
    host: "78.154.103.50",
    port: 11313,
    database: 0,
    keyPrefix: "soezy:db:v1",
    tls: false,
  });
});

test("Redis heartbeat precedes idle socket timeout while outage queues remain bounded", () => {
  const { getRedisClient } = require("../utils/redis");
  const options = getRedisClient().options;
  assert.ok(options.socket.socketTimeout > 0);
  assert.ok(options.pingInterval > 0);
  assert.ok(options.pingInterval <= options.socket.socketTimeout / 2);
  assert.equal(options.disableOfflineQueue, true);
  assert.equal(options.commandsQueueMaxLength, 200);
});

test("music and savedb have no direct writes to original database.json", async () => {
  for (const file of ["commands/music/music.js", "events/messageCreate.js"]) {
    const source = await fs.readFile(path.join(__dirname, "..", file), "utf8");
    assert.doesNotMatch(source, /writeFile(?:Sync)?\(\s*["']\.\/database\.json["']/);
  }
});

test("full member fetches are single-flight and bulk requests have bounded concurrency", async () => {
  let active = 0; let peak = 0; let calls = 0;
  class Manager {
    constructor() { this.client = { users: { resolveId: value => typeof value === "string" ? value : null } }; }
    async fetch() { calls++; active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; return "members"; }
  }
  assert.equal(installMemberFetchScheduler(Manager), true);
  assert.equal(installMemberFetchScheduler(Manager), false);
  const m = new Manager();
  await Promise.all(Array.from({ length: 30 }, () => m.fetch()));
  assert.equal(calls, 1);
  await Promise.all(Array.from({ length: 20 }, () => new Manager().fetch()));
  assert.ok(peak <= 4);
  assert.equal(active, 0);
});
