"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { connectRedis, closeRedis, getRedisConfig, logStatus } = require("./redis");

const digest = value => createHash("sha256").update(value).digest("hex");
const isMap = value => value !== null && typeof value === "object" && !Array.isArray(value);
function* records(db) {
  const sections = Object.entries(db).map(([key, value]) => [key, isMap(value) ? "map" : "value"]);
  yield ["@root", JSON.stringify(sections)];
  for (const [section, kind] of sections) {
    if (kind === "map") {
      for (const [id, value] of Object.entries(db[section])) {
        const json = JSON.stringify(value);
        if (json !== undefined) yield [JSON.stringify([section, id]), json];
      }
    } else {
      const json = JSON.stringify(db[section]);
      if (json === undefined) throw new Error(`Non-JSON database section: ${section}`);
      yield [JSON.stringify([section]), json];
    }
  }
}

function decode(hash) {
  if (hash._schema !== "1" || !hash._migration || !/^\d+$/.test(hash._revision || "") || !hash["@root"]) throw new Error("Redis namespace contains incomplete/unsupported data; refusing JSON overwrite");
  const definitions = JSON.parse(hash["@root"]);
  const db = {};
  const kinds = new Map();
  for (const [section, kind] of definitions) {
    if (typeof section !== "string" || !["map", "value"].includes(kind) || kinds.has(section)) throw new Error("Invalid Redis root manifest");
    kinds.set(section, kind);
    Object.defineProperty(db, section, { value: kind === "map" ? {} : undefined, enumerable: true, writable: true, configurable: true });
  }
  for (const [field, raw] of Object.entries(hash)) {
    if (field.startsWith("_") || field === "@root") continue;
    if (raw === "\u0000") continue;
    const keys = JSON.parse(field);
    if (!Array.isArray(keys) || !kinds.has(keys[0]) || (keys.length !== 1 && keys.length !== 2)) throw new Error("Invalid Redis record path");
    const [section, id] = keys;
    if ((keys.length === 2) !== (kinds.get(section) === "map")) throw new Error("Redis record type mismatch");
    if (keys.length === 1) db[section] = JSON.parse(raw);
    else Object.defineProperty(db[section], id, { value: JSON.parse(raw), enumerable: true, writable: true, configurable: true });
  }
  for (const [section, kind] of definitions) if (kind === "value" && db[section] === undefined) throw new Error(`Missing Redis section: ${section}`);
  return db;
}

const LEASE = `
local owner = redis.call('GET', KEYS[1])
if owner and owner ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'PX', 90000)
return 1`;
const IMPORT = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return redis.error_reply('WRITER_LOCK_LOST') end
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[3], '_schema', 'pending')
redis.call('PEXPIRE', KEYS[3], 3600000)
for i=3,#ARGV,2 do redis.call('HSET', KEYS[3], ARGV[i], ARGV[i+1]) end
redis.call('HSET', KEYS[3], '_schema', '1', '_revision', '0', '_migration', ARGV[2])
redis.call('PERSIST', KEYS[3])
redis.call('RENAME', KEYS[3], KEYS[1])
return 1`;
const COMMIT = `
if redis.call('GET', KEYS[2]) ~= ARGV[1] then return redis.error_reply('WRITER_LOCK_LOST') end
if redis.call('HGET', KEYS[1], '_commit') == ARGV[3] then return redis.call('HGET', KEYS[1], '_revision') end
if redis.call('HGET', KEYS[1], '_revision') ~= ARGV[2] then return redis.error_reply('DATABASE_REVISION_CONFLICT') end
local removed = cjson.decode(ARGV[4])
local revision = tostring(tonumber(ARGV[2]) + 1)
local values = {'_commit', ARGV[3], '_revision', revision}
for i=5,#ARGV do table.insert(values, ARGV[i]) end
for _,field in ipairs(removed) do table.insert(values, field); table.insert(values, string.char(0)) end
redis.call('HSET', KEYS[1], unpack(values))
for _,field in ipairs(removed) do redis.call('HDEL', KEYS[1], field) end
return revision`;
const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`;

async function backupOriginal(file) {
  const raw = await fs.readFile(file);
  const parsed = JSON.parse(raw);
  if (!isMap(parsed)) throw new Error("database.json must contain an object");
  const directory = path.join(path.dirname(file), "logs", "db-backups");
  await fs.mkdir(directory, { recursive: true });
  const backup = path.join(directory, `database-pre-redis-${digest(raw)}.json`);
  try { await fs.writeFile(backup, raw, { flag: "wx" }); } catch (error) { if (error.code !== "EEXIST") throw error; }
  if (digest(await fs.readFile(backup)) !== digest(raw)) throw new Error("Pre-migration backup verification failed");
  return { db: parsed, hash: digest(raw), backup };
}

class RedisDatabase {
  constructor(client, options = {}) {
    this.client = client;
    this.prefix = options.prefix || getRedisConfig().keyPrefix;
    this.key = `${this.prefix}:data`;
    this.lock = `${this.prefix}:writer`;
    this.token = randomUUID();
    this.hashes = new Map();
    this.revision = "0";
    this.batch = null;
    this.activeWrite = null;
    this.file = options.file || path.resolve(__dirname, "../database.json");
    this.pendingFile = path.join(path.dirname(this.file), "logs", "db-backups", "redis-pending.json");
    this.timer = null;
  }
  async lease() {
    if (!this.client.isReady) throw new Error("Redis unavailable; retaining pending changes in memory");
    if (Number(await this.client.eval(LEASE, { keys: [this.lock], arguments: [this.token] })) !== 1) throw new Error("Another bot/database writer holds the Redis lease");
  }
  async initialize() {
    await this.lease();
    let hash = await this.client.hGetAll(this.key);
    if (!Object.keys(hash).length) {
      const original = await backupOriginal(this.file);
      const args = [this.token, JSON.stringify({ sourceSha256: original.hash, importedAt: new Date().toISOString(), backup: path.basename(original.backup) })];
      for (const [field, json] of records(original.db)) args.push(field, json);
      const staging = `${this.prefix}:import:${this.token}`;
      await this.client.eval(IMPORT, { keys: [this.key, this.lock, staging], arguments: args });
      hash = await this.client.hGetAll(this.key);
      this.db = decode(hash);
      if (!isDeepStrictEqual(this.db, original.db)) throw new Error("Migration verification failed; original JSON and Redis retained for inspection");
      console.log("[DB] JSON migration verified; database.json unchanged");
    } else {
      this.db = decode(hash);
      console.log("[DB] JSON migration skipped - Redis already contains data");
    }
    this.revision = hash._revision;
    for (const [field, raw] of Object.entries(hash)) if (!field.startsWith("_")) this.hashes.set(field, digest(raw));
    await this.recoverPending(hash);
    this.timer = setInterval(() => {
      if (this.renewing) return;
      this.renewing = this.lease().catch(() => logStatus("lease", "[REDIS] Writer lease unavailable; pending changes are retained, not overwritten")).finally(() => { this.renewing = null; });
    }, 20000);
    this.timer.unref?.();
    console.log("[REDIS] Database ready");
    console.log("[DB] Redis database loaded");
    return this.db;
  }
  async read() { return decode(await this.client.hGetAll(this.key)); }
  async preservePending(db = this.db) {
    const snapshot = JSON.stringify({ schema: 1, prefix: this.prefix, revision: this.revision, commitId: this.batch?.id || null, db });
    await fs.mkdir(path.dirname(this.pendingFile), { recursive: true });
    const handle = await fs.open(this.pendingFile, "wx");
    try { await handle.writeFile(snapshot, "utf8"); await handle.sync(); }
    finally { await handle.close(); }
    console.warn("[DB] Unsynced changes saved to logs/db-backups/redis-pending.json; original JSON unchanged");
  }
  async recoverPending(hash) {
    let raw;
    try { raw = await fs.readFile(this.pendingFile, "utf8"); }
    catch (error) { if (error.code === "ENOENT") return; throw error; }
    const pending = JSON.parse(raw);
    if (pending.schema !== 1 || pending.prefix !== this.prefix || !isMap(pending.db)) throw new Error("Invalid pending Redis recovery file; manual review required");
    if (pending.revision !== hash._revision && (!pending.commitId || pending.commitId !== hash._commit)) throw new Error("Pending changes conflict with newer Redis data; refusing overwrite, manual review required");
    await this.write(pending.db);
    this.db = pending.db;
    await fs.rename(this.pendingFile, `${this.pendingFile}.applied-${Date.now()}`);
    console.log("[DB] Recovered pending offline changes; recovery snapshot archived");
  }
  write(db = this.db) {
    this.writeRequested = true;
    if (this.activeWrite) return this.activeWrite;
    this.activeWrite = (async () => {
      do { this.writeRequested = false; await this.persist(db); } while (this.writeRequested);
      return true;
    })().finally(() => { this.activeWrite = null; });
    return this.activeWrite;
  }
  async commitBatch() {
    const batch = this.batch;
    await this.lease();
    const result = await this.client.eval(COMMIT, { keys: [this.key, this.lock], arguments: [this.token, this.revision, batch.id, JSON.stringify(batch.removed), ...batch.fields] });
    this.revision = String(result);
    for (const field of batch.removed) this.hashes.delete(field);
    for (let i = 0; i < batch.fields.length; i += 2) this.hashes.set(batch.fields[i], digest(batch.fields[i + 1]));
    this.batch = null;
  }
  async persist(db) {
    if (!this.client.isReady) throw new Error("Redis unavailable; write deferred");
    if (this.batch) await this.commitBatch(); // Retry uncertain writes with the same idempotency ID.
    const seen = new Set();
    const fields = [];
    for (const [field, json] of records(db)) {
      seen.add(field);
      if (this.hashes.get(field) !== digest(json)) fields.push(field, json);
    }
    const removed = [...this.hashes.keys()].filter(key => !seen.has(key));
    if (!fields.length && !removed.length) return true;
    this.batch = { id: randomUUID(), fields, removed };
    await this.commitBatch();
    return true;
  }
  async close() {
    clearInterval(this.timer);
    if (this.resumeWrites) this.client.off("ready", this.resumeWrites);
    if (this.renewing) await this.renewing;
    if (this.client.isReady) await this.client.eval(RELEASE, { keys: [this.lock], arguments: [this.token] }).catch(() => {});
  }
}

async function openDatabase(options = {}) {
  const client = options.client || await connectRedis();
  const store = new RedisDatabase(client, options);
  try { await store.initialize(); return store; }
  catch (error) { await store.close(); throw error; }
}

async function exportDatabase(destination, options = {}) {
  const file = path.resolve(destination);
  if (file === path.resolve(__dirname, "../database.json")) throw new Error("Refusing to overwrite original database.json");
  const client = options.client || await connectRedis();
  const store = new RedisDatabase(client, options);
  const db = await store.read();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(db, null, 2), { flag: "wx" });
  return { file, guilds: Object.keys(db.guilds || {}).length, users: Object.keys(db.users || {}).length };
}

function requestSave() {
  if (!globalThis.soezyDatabase?.requestSave) throw new Error("Shared database writer is not initialized");
  return globalThis.soezyDatabase.requestSave();
}

module.exports = { RedisDatabase, openDatabase, exportDatabase, backupOriginal, records, decode, closeRedis, requestSave };
