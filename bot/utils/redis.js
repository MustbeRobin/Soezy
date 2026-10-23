"use strict";
const { createClient } = require("redis");
const { EventEmitter } = require("node:events");
let client;
let connecting;
let latencyProbe;
const lastLog = new Map();
const intentionallyClosing = new WeakSet();
const appConfig = require("../config.json");

class UpstashRestClient extends EventEmitter {
  constructor(url, token) {
    super();
    this.url = new URL(url).toString().replace(/\/$/, "");
    this.token = token;
    this.isReady = false;
    this.isOpen = false;
  }

  async command(command, args = [], options = {}) {
    const controller = options.signal ? null : new AbortController();
    const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs || 10000) : null;
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([command, ...args]),
        signal: options.signal || controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.error) {
        throw new Error(`Upstash Redis ${command} failed (${response.status}): ${payload.error || response.statusText}`);
      }
      return payload.result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async connect() {
    if (this.isReady) return this;
    this.isOpen = true;
    try {
      await this.ping();
      this.isReady = true;
      this.emit("ready");
      return this;
    } catch (error) {
      this.isOpen = false;
      throw error;
    }
  }

  async ping(options) { return this.command("PING", [], options); }
  async get(key) { return this.command("GET", [key]); }
  async set(key, value, options = {}) {
    const args = [key, value];
    for (const [name, setting] of Object.entries(options)) {
      if (["PX", "EX", "NX", "XX"].includes(name.toUpperCase())) args.push(name.toUpperCase(), setting);
    }
    return this.command("SET", args);
  }
  async del(key) { return this.command("DEL", [key]); }
  async hGetAll(key) {
    const result = await this.command("HGETALL", [key]);
    if (!Array.isArray(result)) return result || {};
    const hash = {};
    for (let i = 0; i + 1 < result.length; i += 2) hash[result[i]] = result[i + 1];
    return hash;
  }
  async eval(script, { keys = [], arguments: args = [] } = {}) {
    return this.command("EVAL", [script, keys.length, ...keys, ...args]);
  }
  withCommandOptions(options = {}) {
    const signal = options.abortSignal || options.signal;
    return { ping: () => this.ping(signal ? { signal } : {}) };
  }
  async close() { this.isReady = false; this.isOpen = false; }
  destroy() { this.isReady = false; this.isOpen = false; }
}

function getRedisConfig() {
  const settings = appConfig.redis || {};
  const host = settings.host || process.env.REDIS_HOST || "127.0.0.1";
  const port = Number(settings.port ?? process.env.REDIS_PORT ?? 6379);
  const database = Number(settings.database ?? process.env.REDIS_DB ?? 0);
  const keyPrefix = settings.keyPrefix || process.env.REDIS_KEY_PREFIX || "soezy:db:v1";
  const tlsSetting = String(settings.tls ?? process.env.REDIS_TLS ?? "false").trim().toLowerCase();
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !Number.isInteger(database) || database < 0) throw new Error("Invalid Redis port/database configuration");
  if (tlsSetting !== "true" && tlsSetting !== "false") throw new Error("Redis TLS setting must be true or false");
  return { host, port, database, keyPrefix, tls: tlsSetting === "true" };
}

function logStatus(key, message) {
  const now = Date.now();
  if (now - (lastLog.get(key) || 0) < 60000) return;
  lastLog.set(key, now);
  console.log(message);
}

function getRedisClient() {
  if (client) return client;
  const provider = String(process.env.REDIS_PROVIDER || "").trim().toLowerCase();
  if (provider && !["upstash-rest", "tcp"].includes(provider)) throw new Error("REDIS_PROVIDER must be upstash-rest or tcp");
  const restUrl = process.env.UPSTASH_REDIS_REST_URL;
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (provider === "tcp" && (restUrl || restToken)) throw new Error("REDIS_PROVIDER=tcp conflicts with configured Upstash REST credentials");
  if (provider === "upstash-rest" || restUrl || restToken) {
    if (!restUrl || !restToken) throw new Error("Both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required");
    const parsedUrl = new URL(restUrl);
    if (parsedUrl.protocol !== "https:") throw new Error("Upstash Redis REST URL must use HTTPS");
    client = new UpstashRestClient(restUrl, restToken);
    return client;
  }
  const { host, port, database, tls } = getRedisConfig();
  const isLoopback = ["127.0.0.1", "localhost", "::1"].includes(host.toLowerCase());
  if (!provider && !isLoopback) throw new Error("Remote Redis requires REDIS_PROVIDER=tcp or configured Upstash REST credentials");
  if (!tls && !isLoopback) {
    logStatus("plaintext", "[REDIS] Warning: remote Redis is using unencrypted TCP; use a TLS endpoint or encrypted tunnel");
  }
  const redisClient = createClient({
    socket: {
      host, port, tls,
      connectTimeout: 5000,
      socketTimeout: 10000,
      reconnectStrategy: retries => Math.min(30000, 1000 * 2 ** Math.min(retries, 5)) + Math.floor(Math.random() * 500),
    },
    username: process.env.REDIS_USERNAME || undefined,
    password: process.env.REDIS_PASSWORD || undefined,
    database, disableOfflineQueue: true, commandsQueueMaxLength: 200,
    // Keep idle connections alive before the socket timeout, even between database saves.
    pingInterval: 5000,
  });
  redisClient.on("error", error => {
    if (!intentionallyClosing.has(redisClient)) logStatus("error", `[REDIS] Connection/command failed (${error.code || error.name || "unavailable"}); retrying safely`);
  });
  redisClient.on("reconnecting", () => logStatus("retry", "[REDIS] Reconnecting..."));
  redisClient.on("ready", () => {
    console.log("[REDIS] Connected");
    if (process.env.REDIS_PASSWORD) console.log("[REDIS] Authentication successful");
  });
  client = redisClient;
  return redisClient;
}

async function connectRedis(timeoutMs = 12000) {
  const redis = getRedisClient();
  if (redis.isReady) return redis;
  if (!connecting && !redis.isOpen) {
    logStatus("connect", "[REDIS] Connecting...");
    connecting = redis.connect().finally(() => { connecting = null; });
    connecting.catch(() => {});
  }
  await new Promise((resolve, reject) => {
    const ready = () => { clearTimeout(timer); redis.off("ready", ready); resolve(); };
    const timer = setTimeout(() => { redis.off("ready", ready); reject(new Error("Redis startup connection timed out")); }, timeoutMs);
    redis.once("ready", ready);
    if (redis.isReady) ready();
  });
  return redis;
}

async function closeRedis() {
  const current = client;
  if (!current) return;
  intentionallyClosing.add(current);
  try {
    if (current.isReady) await current.close();
    else if (current.isOpen) current.destroy();
  } finally {
    intentionallyClosing.delete(current);
    if (client === current) client = null;
  }
  connecting = null;
}

async function getRedisLatency(timeoutMs = 2000) {
  // Module consumers and the VM runtime must probe the same database client.
  if (!client?.isReady) return null;
  if (latencyProbe) return latencyProbe;
  const current = client;
  const controller = new AbortController();
  let timer;
  const startedAt = process.hrtime.bigint();
  const request = current.withCommandOptions({ abortSignal: controller.signal }).ping();
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs);
  });
  latencyProbe = Promise.race([
    request.then(reply => reply === "PONG" ? Number(process.hrtime.bigint() - startedAt) / 1e6 : null).catch(() => null),
    deadline,
  ]).finally(() => { clearTimeout(timer); });
  // Keep coalescing after a timeout until the queued request actually settles.
  void request.catch(() => {}).finally(() => { latencyProbe = null; });
  return latencyProbe;
}

module.exports = { UpstashRestClient, getRedisClient, getRedisConfig, connectRedis, closeRedis, getRedisLatency, logStatus };
