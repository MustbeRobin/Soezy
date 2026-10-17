(() => {
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 50000;
const CLEANUP_INTERVAL_MS = 60 * 1000;

class TTLCache {
  constructor(name, options = {}) {
    this.name = name;
    this.ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    this.maxEntries = options.maxEntries || DEFAULT_MAX_ENTRIES;
    this.store = new Map();
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return undefined;
    if (item.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    item.lastAccess = Date.now();
    return item.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (this.store.size >= this.maxEntries && !this.store.has(key)) this.evictOldest();
    this.store.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1, ttlMs),
      lastAccess: Date.now(),
    });
    return value;
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  delete(key) {
    return this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }

  cleanup(now = Date.now()) {
    for (const [key, item] of this.store) {
      if (item.expiresAt <= now) this.store.delete(key);
    }
  }

  evictOldest() {
    let oldestKey = null;
    let oldestAccess = Infinity;
    for (const [key, item] of this.store) {
      if (item.lastAccess < oldestAccess) {
        oldestAccess = item.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey !== null) this.store.delete(oldestKey);
  }

  size() {
    this.cleanup();
    return this.store.size;
  }
}

const cacheRegistry = globalThis.__soezyCacheRegistry || (globalThis.__soezyCacheRegistry = new Map());

function getSoezyCache(name, options = {}) {
  if (!cacheRegistry.has(name)) cacheRegistry.set(name, new TTLCache(name, options));
  return cacheRegistry.get(name);
}

const soezyCaches = {
  guildSettings: getSoezyCache("guildSettings", { ttlMs: 10 * 60 * 1000 }),
  premium: getSoezyCache("premium", { ttlMs: 5 * 60 * 1000 }),
  cooldowns: getSoezyCache("cooldowns", { ttlMs: 10 * 60 * 1000 }),
  musicState: getSoezyCache("musicState", { ttlMs: 3 * 60 * 1000 }),
  dashboard: getSoezyCache("dashboard", { ttlMs: 2 * 60 * 1000 }),
  embeds: getSoezyCache("embeds", { ttlMs: 10 * 60 * 1000 }),
};

async function initSoezyRedis() {
  const redis = require("./utils/redis").getRedisClient();
  globalThis.__soezyRedis = redis;
  return redis;
}

function cacheKey(scope, id) {
  return `soezy:cache:${scope}:${id}`;
}

async function soezyCacheGet(scope, id) {
  const key = cacheKey(scope, id);
  const local = getSoezyCache(scope).get(key);
  if (local !== undefined) return local;
  const redis = globalThis.__soezyRedis;
  if (!redis?.isOpen) return undefined;
  const raw = await redis.get(key).catch(() => null);
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw);
    getSoezyCache(scope).set(key, value);
    return value;
  } catch {
    return undefined;
  }
}

async function soezyCacheSet(scope, id, value, ttlMs = DEFAULT_TTL_MS) {
  const key = cacheKey(scope, id);
  getSoezyCache(scope).set(key, value, ttlMs);
  const redis = globalThis.__soezyRedis;
  if (redis?.isOpen) {
    await redis.set(key, JSON.stringify(value), { PX: ttlMs }).catch(() => {});
  }
  return value;
}

async function soezyCacheDelete(scope, id) {
  const key = cacheKey(scope, id);
  getSoezyCache(scope).delete(key);
  const redis = globalThis.__soezyRedis;
  if (redis?.isOpen) await redis.del(key).catch(() => {});
}

function cacheGuildSettings(guildId, value, ttlMs) {
  return soezyCaches.guildSettings.set(cacheKey("guild", guildId), value, ttlMs);
}

function getCachedGuildSettings(guildId) {
  return soezyCaches.guildSettings.get(cacheKey("guild", guildId));
}

function invalidateGuildSettings(guildId) {
  if (guildId) soezyCaches.guildSettings.delete(cacheKey("guild", guildId));
}

function cachePremiumData(id, value, ttlMs) {
  return soezyCaches.premium.set(cacheKey("premium", id), value, ttlMs);
}

function invalidatePremiumData(id) {
  if (id) soezyCaches.premium.delete(cacheKey("premium", id));
  else soezyCaches.premium.clear();
}

function cleanupSoezyCaches() {
  for (const cache of cacheRegistry.values()) cache.cleanup();
}

if (!globalThis.__soezyCacheCleanupInterval) {
  globalThis.__soezyCacheCleanupInterval = setInterval(cleanupSoezyCaches, CLEANUP_INTERVAL_MS);
  globalThis.__soezyCacheCleanupInterval.unref?.();
}

Object.assign(globalThis, {
  TTLCache,
  getSoezyCache,
  soezyCaches,
  initSoezyRedis,
  soezyCacheGet,
  soezyCacheSet,
  soezyCacheDelete,
  cacheGuildSettings,
  getCachedGuildSettings,
  invalidateGuildSettings,
  cachePremiumData,
  invalidatePremiumData,
  cleanupSoezyCaches,
});

module.exports = {
  TTLCache,
  getSoezyCache,
  soezyCaches,
  initSoezyRedis,
  soezyCacheGet,
  soezyCacheSet,
  soezyCacheDelete,
  cacheGuildSettings,
  getCachedGuildSettings,
  invalidateGuildSettings,
  cachePremiumData,
  invalidatePremiumData,
  cleanupSoezyCaches,
};
})();
