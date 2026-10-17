/* ================= OWNER MANAGER =================
 * Single source for bot-owner validation and owner bypass decisions.
 */
(() => {
function normalizeOwnerId(id) {
  const value = String(id || "").trim();
  return /^\d{17,20}$/.test(value) ? value : null;
}

function getOwnerIds() {
  const ids = [
    ...(Array.isArray(config?.ownerIds) ? config.ownerIds : []),
    ...(Array.isArray(config?.owners) ? config.owners : []),
  ];
  return new Set(ids.map(normalizeOwnerId).filter(Boolean));
}

function hydrateConfigOwnerIds() {
  if (!config || typeof config !== "object") return;
  if (!Array.isArray(config.ownerIds)) config.ownerIds = [];
  for (const id of getOwnerIds()) {
    if (!config.ownerIds.includes(id)) config.ownerIds.push(id);
  }
}

function isBotOwner(userId) {
  const normalized = normalizeOwnerId(userId);
  if (!normalized) return false;
  return getOwnerIds().has(normalized);
}

function assertOwner(userId) {
  if (!isBotOwner(userId)) {
    const err = new Error("Bot owners only.");
    err.code = "OWNER_ONLY";
    throw err;
  }
  return true;
}

function canOwnerBypass(userId, reason = "generic") {
  const allowed = isBotOwner(userId);
  if (allowed) console.log(`[OWNER] Owner bypass used reason=${reason} user=${userId}`);
  return allowed;
}

function ownerOnlyCommandNames() {
  return new Set([
    "ownerhelp", "owner", "eval", "ev", "exec", "sh", "reload", "reloadcmd",
    "reloadall", "reloadmusic", "restart", "reboot", "shutdown", "botstats",
    "bstats", "memory", "queues", "nodeinfo", "blacklist", "bl", "collectors", "cache", "ratelimits",
    "blacklistuser", "unblacklist", "unbl", "unblacklistuser", "premiumadd",
    "premiumremove", "forcedbsave", "savedb", "clearcache", "clearcollectors",
    "clearqueues", "debug", "runtime", "diagnostics", "refreshconfig",
    "refreshcache", "syncguild", "panelrefresh", "gtoggle", "globaltoggle",
    "genable", "gdisable", "fixdb", "dbstats", "dbs", "backupdb", "dbbackup",
    "resetserver", "wipeserver", "blacklistserver", "blserver", "bls",
    "unblacklistserver", "unblserver", "unbls", "broadcast", "bcast",
    "ownersi", "oserverinfo", "gsi", "ownerui", "ouserinfo", "gui",
    "finduser", "searchuser", "clearpoints", "clearpts", "resetpoints", "resetpts",
    "reconnectnode", "reconnectnodeall", "reconnectallnodes", "switchnode", "fixplayer", "fixplayers",
    "recovermusic", "recoverqueue", "rejoinvc", "forcereconnect", "clearghostplayers",
    "nodecleanup", "playerdebug", "nodestatus", "musicdiagnostics",
    "serverleave", "sleave", "leaveguild", "totalservers", "totalserver", "botadmin", "botpartner",
    "totleserver", "totle", "tserver", "ts", "link", "gbot", "dev"
  ]);
}

hydrateConfigOwnerIds();

Object.assign(globalThis, {
  soezyOwnerManager: {
    normalizeOwnerId,
    getOwnerIds,
    hydrateConfigOwnerIds,
    isBotOwner,
    assertOwner,
    canOwnerBypass,
    ownerOnlyCommandNames,
  },
  isBotOwner,
  canOwnerBypass,
});

module.exports = globalThis.soezyOwnerManager;
})();
