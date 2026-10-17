/* ================= CACHE-FIRST RESOLVERS ================= */
(() => {
const USERNAME_CACHE_TTL_MS = 5 * 60 * 1000;
const PREMIUM_CACHE_TTL_MS = 60 * 1000;
const usernameCache = globalThis.__soezyUsernameCache || (globalThis.__soezyUsernameCache = new Map());
const premiumCache = globalThis.__soezyPremiumCache || (globalThis.__soezyPremiumCache = new Map());

function normalizeLookup(value) {
  return String(value || "").replace(/[<@!>#&]/g, "").trim();
}

function isSnowflake(value) {
  return /^\d{17,20}$/.test(String(value || ""));
}

function findCachedMember(guild, query) {
  if (!guild || !query) return null;
  const clean = normalizeLookup(query);
  if (!clean) return null;
  if (isSnowflake(clean)) return guild.members.cache.get(clean) || null;

  const lowered = clean.toLowerCase();
  const cacheKey = `${guild.id}:${lowered}`;
  const cached = usernameCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return guild.members.cache.get(cached.memberId) || null;
  }

  const member = guild.members.cache.find(m =>
    m.user.username.toLowerCase() === lowered ||
    (m.user.globalName || "").toLowerCase() === lowered ||
    m.displayName.toLowerCase() === lowered ||
    m.user.username.toLowerCase().startsWith(lowered)
  ) || null;
  if (member) usernameCache.set(cacheKey, { memberId: member.id, expiresAt: Date.now() + USERNAME_CACHE_TTL_MS });
  return member;
}

async function resolveMemberCached(guild, input, options = {}) {
  if (!guild || !input) return null;
  const clean = normalizeLookup(input);
  const cached = findCachedMember(guild, clean);
  if (cached) return cached;
  if (isSnowflake(clean) && options.fetch !== false) {
    if (typeof globalThis.throttledMemberFetch === "function") {
      return await globalThis.throttledMemberFetch(guild, clean, options).catch(() => null);
    }
    return await guild.members.fetch(clean).catch(() => null);
  }
  return null;
}

async function resolveUserCached(client, guild, input, options = {}) {
  if (!input) return null;
  const clean = normalizeLookup(input);
  const member = await resolveMemberCached(guild, clean, options);
  if (member?.user) return member.user;
  if (isSnowflake(clean) && options.fetchUser !== false) {
    return await client.users.fetch(clean).catch(() => null);
  }
  return null;
}

async function resolveChannelCached(client, guild, input, options = {}) {
  if (!guild || !input) return null;
  const clean = normalizeLookup(input);
  if (!clean) return null;
  const cached = guild.channels.cache.get(clean);
  if (cached) return cached;
  if (isSnowflake(clean) && options.fetch !== false) return await client.channels.fetch(clean).catch(() => null);
  const lowered = clean.toLowerCase();
  return guild.channels.cache.find(c => c.name?.toLowerCase() === lowered || c.name?.toLowerCase().startsWith(lowered)) || null;
}

function cleanupLookupCaches(now = Date.now()) {
  for (const [key, value] of usernameCache) {
    if (value.expiresAt <= now) usernameCache.delete(key);
  }
}

function getCachedPremiumState(userId, guildId = null) {
  const key = `${userId || "unknown"}:${guildId || "global"}`;
  const cached = premiumCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const now = Date.now();
  const premium = globalThis.db?.premium || {};
  const shop = globalThis.db?.shopPremium || {};
  const userPremium = premium.users?.[userId] || premium[userId] || null;
  const guildPremium = guildId ? (premium.guilds?.[guildId] || null) : null;
  const shopItems = shop[userId] || {};
  const shopActive = Object.values(shopItems).some(item => item?.expiresAt > now);
  const value = {
    user: !!(userPremium && (!userPremium.expiresAt || userPremium.expiresAt > now)),
    guild: !!(guildPremium && (!guildPremium.expiresAt || guildPremium.expiresAt > now)),
    shop: shopActive,
    plan: userPremium?.plan || guildPremium?.plan || (shopActive ? "plus" : "free"),
  };
  premiumCache.set(key, { value, expiresAt: now + PREMIUM_CACHE_TTL_MS });
  return value;
}

function cleanupPremiumCache(now = Date.now()) {
  for (const [key, value] of premiumCache) {
    if (value.expiresAt <= now) premiumCache.delete(key);
  }
}

if (!globalThis.__soezyLookupCleanupInterval) {
  globalThis.__soezyLookupCleanupInterval = setInterval(() => { cleanupLookupCaches(); cleanupPremiumCache(); }, 60 * 1000);
  globalThis.__soezyLookupCleanupInterval.unref?.();
}

Object.assign(globalThis, {
  soezyCacheManager: { resolveMemberCached, resolveUserCached, resolveChannelCached, findCachedMember, cleanupLookupCaches, getCachedPremiumState, cleanupPremiumCache },
  resolveMemberCached,
  resolveUserCached,
  resolveChannelCached,
  cleanupLookupCaches,
  getCachedPremiumState,
  cleanupPremiumCache,
});

module.exports = globalThis.soezyCacheManager;
})();
