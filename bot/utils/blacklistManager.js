/* ================= CENTRAL BLACKLIST MANAGER =================
 * Runtime-loaded by handlers/runtime-files.js after utils/database.js.
 * Keeps DB paths and in-memory blacklist checks synchronized.
 */

if (typeof globalThis.__soezyBlacklistCache === "undefined") {
  globalThis.__soezyBlacklistCache = {
    globalUsers: new Set(),
    guilds: new Map(),
    syncedAt: 0,
  };
}

const BLACKLIST_CACHE = globalThis.__soezyBlacklistCache;

function normalizeBlacklistId(id) {
  const value = String(id || "").replace(/[<@!>]/g, "").trim();
  return /^\d{17,20}$/.test(value) ? value : null;
}

function isGuildId(value) {
  return /^\d{17,20}$/.test(String(value || ""));
}

function storedGuildIds() {
  return Object.keys(db.guilds || {}).filter(isGuildId);
}

function ensureBlacklistRoot() {
  if (!db.globalBlacklist || typeof db.globalBlacklist !== "object" || Array.isArray(db.globalBlacklist)) {
    db.globalBlacklist = {};
  }
  if (!db.blacklistedServers || typeof db.blacklistedServers !== "object" || Array.isArray(db.blacklistedServers)) {
    db.blacklistedServers = {};
  }
  if (!db.guilds || typeof db.guilds !== "object" || Array.isArray(db.guilds)) {
    db.guilds = {};
  }
}

function ensureGuildBlacklistState(guildId) {
  ensureBlacklistRoot();
  const gId = String(guildId || "");
  if (!isGuildId(gId)) return null;
  if (!db.guilds[gId] || typeof db.guilds[gId] !== "object" || Array.isArray(db.guilds[gId])) {
    db.guilds[gId] = {};
  }
  const gd = db.guilds[gId];
  if (!gd.security || typeof gd.security !== "object" || Array.isArray(gd.security)) gd.security = {};
  if (!gd.security.blacklistedUsers || typeof gd.security.blacklistedUsers !== "object" || Array.isArray(gd.security.blacklistedUsers)) {
    gd.security.blacklistedUsers = {};
  }
  if (!gd.security.violations || typeof gd.security.violations !== "object" || Array.isArray(gd.security.violations)) {
    gd.security.violations = {};
  }
  if (!Array.isArray(gd.shadowMuted)) gd.shadowMuted = [];
  gd.shadowMuted = [...new Set(gd.shadowMuted.map(normalizeBlacklistId).filter(Boolean))];
  if (!gd.wallSystem || typeof gd.wallSystem !== "object" || Array.isArray(gd.wallSystem)) gd.wallSystem = {};
  if (!Array.isArray(gd.wallSystem.whitelist)) gd.wallSystem.whitelist = [];
  gd.wallSystem.whitelist = [...new Set(gd.wallSystem.whitelist.map(normalizeBlacklistId).filter(Boolean))];
  if (!gd.wallSystem.quarantined || typeof gd.wallSystem.quarantined !== "object" || Array.isArray(gd.wallSystem.quarantined)) {
    gd.wallSystem.quarantined = {};
  }
  return gd;
}

function syncGuildBlacklistCache(guildId) {
  const gd = ensureGuildBlacklistState(guildId);
  if (!gd) return;
  const securityUsers = new Set(Object.keys(gd.security.blacklistedUsers || {}).map(normalizeBlacklistId).filter(Boolean));
  const shadowMuted = new Set((gd.shadowMuted || []).map(normalizeBlacklistId).filter(Boolean));
  const fingerprint = `${[...securityUsers].sort().join(",")}|${[...shadowMuted].sort().join(",")}`;
  const previous = BLACKLIST_CACHE.guilds.get(String(guildId));
  if (previous?.fingerprint === fingerprint) return false;
  BLACKLIST_CACHE.guilds.set(String(guildId), { securityUsers, shadowMuted, fingerprint, syncedAt: Date.now() });
  return true;
}

function syncBlacklistCache(guildId = null) {
  ensureBlacklistRoot();
  const globalUsers = new Set(Object.keys(db.globalBlacklist || {}).map(normalizeBlacklistId).filter(Boolean));
  const globalFingerprint = [...globalUsers].sort().join(",");
  const globalChanged = BLACKLIST_CACHE.globalFingerprint !== globalFingerprint;
  BLACKLIST_CACHE.globalUsers = globalUsers;
  BLACKLIST_CACHE.globalFingerprint = globalFingerprint;
  let changed = globalChanged;
  if (guildId) {
    changed = syncGuildBlacklistCache(String(guildId)) || changed;
  } else {
    const validGuildIds = new Set(storedGuildIds());
    for (const cachedGuildId of BLACKLIST_CACHE.guilds.keys()) if (!validGuildIds.has(cachedGuildId)) { BLACKLIST_CACHE.guilds.delete(cachedGuildId); changed = true; }
    for (const gId of validGuildIds) changed = syncGuildBlacklistCache(gId) || changed;
  }
  BLACKLIST_CACHE.syncedAt = Date.now();
  if (changed) console.log(`[BLACKLIST] Cache synced${guildId ? ` for guild ${guildId}` : ""}`);
  return BLACKLIST_CACHE;
}

function clearBlacklistCache(guildId = null) {
  if (guildId) {
    BLACKLIST_CACHE.guilds.delete(String(guildId));
  } else {
    BLACKLIST_CACHE.globalUsers.clear();
    BLACKLIST_CACHE.guilds.clear();
  }
  BLACKLIST_CACHE.syncedAt = Date.now();
  console.log(`[BLACKLIST] Cache cleared${guildId ? ` for guild ${guildId}` : ""}`);
}

function getGuildBlacklistCache(guildId) {
  const gId = String(guildId || "");
  // Legacy commands mutate the source objects directly. Refresh only the guild
  // being checked so removing full-cache rebuilds from saveDB never stales bans.
  syncGuildBlacklistCache(gId);
  return BLACKLIST_CACHE.guilds.get(gId);
}

function isBlacklisted(input, maybeUserId, maybeScope) {
  const opts = typeof input === "object"
    ? input
    : { guildId: input, userId: maybeUserId, scope: maybeScope };
  const userId = normalizeBlacklistId(opts.userId);
  if (!userId) return false;
  const scope = opts.scope || "any";

  if ((scope === "global" || scope === "any") && db.globalBlacklist?.[userId]) return true;
  if (!opts.guildId) return false;

  const guildCache = getGuildBlacklistCache(opts.guildId);
  if ((scope === "security" || scope === "any") && guildCache?.securityUsers.has(userId)) return true;
  if ((scope === "shadow" || scope === "any") && guildCache?.shadowMuted.has(userId)) return true;
  return false;
}

function addBlacklist(options = {}) {
  const userId = normalizeBlacklistId(options.userId);
  if (!userId) return { changed: false, reason: "invalid_user" };
  const scope = options.scope || "security";
  const entry = {
    reason: options.reason || "No reason provided",
    by: options.by || null,
    type: options.type || "manual",
    createdAt: options.createdAt || Date.now(),
    auto: !!options.auto,
  };

  let changed = false;
  if (scope === "global") {
    ensureBlacklistRoot();
    changed = !db.globalBlacklist[userId] || JSON.stringify(db.globalBlacklist[userId]) !== JSON.stringify(entry);
    db.globalBlacklist[userId] = { reason: entry.reason, by: entry.by, at: entry.createdAt };
  } else if (scope === "shadow") {
    const gd = ensureGuildBlacklistState(options.guildId);
    if (!gd.shadowMuted.includes(userId)) {
      gd.shadowMuted.push(userId);
      changed = true;
    }
  } else {
    const gd = ensureGuildBlacklistState(options.guildId);
    changed = !gd.security.blacklistedUsers[userId] || JSON.stringify(gd.security.blacklistedUsers[userId]) !== JSON.stringify(entry);
    gd.security.blacklistedUsers[userId] = entry;
  }

  if (changed) {
    syncBlacklistCache(options.guildId || null);
    if (typeof refreshBlacklistState === "function") refreshBlacklistState(options.guildId || null, userId);
    saveDB();
    console.log(`[BLACKLIST] User blacklisted scope=${scope} guild=${options.guildId || "global"} user=${userId}`);
  }
  return { changed, userId, scope };
}

function removeBlacklist(options = {}) {
  const userId = normalizeBlacklistId(options.userId);
  if (!userId) return { changed: false, reason: "invalid_user" };
  const scope = options.scope || "all";
  let changed = false;

  ensureBlacklistRoot();
  if (scope === "global" || scope === "all") {
    if (db.globalBlacklist?.[userId]) {
      delete db.globalBlacklist[userId];
      changed = true;
    }
  }

  const guildIds = options.guildId ? [String(options.guildId)].filter(isGuildId) : storedGuildIds();
  if (scope !== "global") {
    for (const gId of guildIds) {
      const gd = ensureGuildBlacklistState(gId);
      if ((scope === "security" || scope === "all") && gd.security.blacklistedUsers?.[userId]) {
        delete gd.security.blacklistedUsers[userId];
        changed = true;
      }
      if ((scope === "security" || scope === "all") && gd.security.violations?.[userId]) {
        delete gd.security.violations[userId];
        changed = true;
      }
      if ((scope === "shadow" || scope === "all") && gd.shadowMuted.includes(userId)) {
        gd.shadowMuted = gd.shadowMuted.filter(id => id !== userId);
        changed = true;
      }
      if ((scope === "wall" || scope === "all") && gd.wallSystem?.quarantined) {
        if (gd.wallSystem.quarantined[userId]) {
          delete gd.wallSystem.quarantined[userId];
          changed = true;
        }
        if (gd.wallSystem.quarantined[gId]?.[userId]) {
          delete gd.wallSystem.quarantined[gId][userId];
          changed = true;
        }
      }
      if (typeof soezySecurity?.clearBlacklistRuntime === "function") {
        soezySecurity.clearBlacklistRuntime(gId, userId);
      }
    }
  }

  syncBlacklistCache(options.guildId || null);
  if (typeof refreshBlacklistState === "function") refreshBlacklistState(options.guildId || null, userId);
  if (changed) {
    saveDB();
    console.log(`[BLACKLIST] User unblacklisted scope=${scope} guild=${options.guildId || "all"} user=${userId}`);
  }
  return { changed, userId, scope };
}

function listBlacklistedUsers() {
  ensureBlacklistRoot();
  return Object.entries(db.globalBlacklist || {}).map(([userId, entry]) => ({
    userId,
    username: entry?.username || entry?.tag || null,
    reason: entry?.reason || "No reason provided",
    by: entry?.by || entry?.addedBy || null,
    at: entry?.at || entry?.createdAt || entry?.date || null,
  })).sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
}

function listBlacklistedServers() {
  ensureBlacklistRoot();
  return Object.entries(db.blacklistedServers || {}).map(([guildId, entry]) => ({
    guildId,
    name: entry?.name || entry?.guildName || null,
    reason: entry?.reason || "No reason provided",
    by: entry?.by || entry?.addedBy || null,
    at: entry?.at || entry?.createdAt || entry?.date || null,
  })).sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
}

globalThis.addBlacklist = addBlacklist;
globalThis.removeBlacklist = removeBlacklist;
globalThis.isBlacklisted = isBlacklisted;
globalThis.clearBlacklistCache = clearBlacklistCache;
globalThis.syncBlacklistCache = syncBlacklistCache;
globalThis.normalizeBlacklistId = normalizeBlacklistId;
globalThis.listBlacklistedUsers = listBlacklistedUsers;
globalThis.listBlacklistedServers = listBlacklistedServers;
globalThis.soezyBlacklistManager = {
  addBlacklist,
  removeBlacklist,
  isBlacklisted,
  clearBlacklistCache,
  syncBlacklistCache,
  normalizeBlacklistId,
  listBlacklistedUsers,
  listBlacklistedServers,
};

syncBlacklistCache();
