"use strict";
(() => {

const featurePanelCache = globalThis.__soezyFeaturePanelCache || (globalThis.__soezyFeaturePanelCache = new Map());

function featureKey(feature) {
  return String(feature || "").toLowerCase().trim();
}

function featureSystems() {
  return Array.isArray(globalThis.ALL_SYSTEMS) ? globalThis.ALL_SYSTEMS : [];
}

const KNOWN_FEATURE_KEYS = new Set([
  "accountage", "afk", "antibot", "antilink", "antinuke", "antiraid", "autoreact",
  "autoresponder", "automod", "birthday", "boost", "confession", "counting",
  "customroles", "economy", "fun", "giveaway", "goodbye", "invites", "joindm",
  "logging", "media", "muteevasion", "security", "sticky",
  "tempvoice", "ticket", "verify", "wall", "warnpunish", "welcome",
]);

function isGuildId(value) {
  return /^\d{17,20}$/.test(String(value || ""));
}

function storedGuildIds() {
  return Object.keys(globalThis.db?.guilds || {}).filter(isGuildId);
}

function ensureFeatureStores(guildId = null) {
  if (!globalThis.db) return null;
  const db = globalThis.db;
  if (!db.global || typeof db.global !== "object") db.global = {};
  if (!db.global.features || typeof db.global.features !== "object") db.global.features = {};
  if (!db.globalSystems || typeof db.globalSystems !== "object") db.globalSystems = {};
  for (const [key, value] of Object.entries(db.globalSystems)) {
    if (typeof value === "boolean" && db.global.features[key] === undefined) db.global.features[key] = value;
  }

  if (!guildId) return null;
  if (!isGuildId(guildId)) return null;
  const gd = typeof globalThis.guildData === "function" ? globalThis.guildData(guildId) : db.guilds?.[guildId];
  if (!gd) return null;
  if (!gd.features || typeof gd.features !== "object") gd.features = {};
  if (!db.guildSystems || typeof db.guildSystems !== "object") db.guildSystems = {};
  if (!db.guildSystems[guildId] || typeof db.guildSystems[guildId] !== "object") db.guildSystems[guildId] = {};
  for (const [key, value] of Object.entries(db.guildSystems[guildId])) {
    if (typeof value === "boolean") {
      const systemRoot = key === "antinuke" ? gd.antinuke : key === "automod" ? gd.automod : key === "wall" ? gd.wallSystem : null;
      const resolved = typeof systemRoot?.systemEnabled === "boolean" ? systemRoot.systemEnabled : value;
      db.guildSystems[guildId][key] = resolved;
      if (gd.features[key] !== resolved) gd.features[key] = resolved;
      applyPerSystemState(gd, key, resolved);
    }
  }
  for (const key of ["antinuke", "automod", "wall"]) {
    const systemRoot = key === "antinuke" ? gd.antinuke : key === "automod" ? gd.automod : gd.wallSystem;
    if (!systemRoot || typeof systemRoot !== "object") continue;
    const enabled = typeof systemRoot.systemEnabled === "boolean" ? systemRoot.systemEnabled : systemRoot.enabled === true;
    systemRoot.systemEnabled = systemRoot.enabled = enabled;
    gd.features[key] = enabled;
    db.guildSystems[guildId][key] = enabled;
  }
  for (const key of ["afk", "autoresponder", "autoreact"]) {
    gd.features[key] = true;
    db.guildSystems[guildId][key] = true;
    applyPerSystemState(gd, key, true);
  }
  // Security is now the protection backend of AutoMod, with one master switch.
  const automodEnabled = (typeof gd.automod?.systemEnabled === "boolean" ? gd.automod.systemEnabled : gd.automod?.enabled) === true;
  gd.automod ||= {};
  gd.automod.systemEnabled = gd.automod.enabled = automodEnabled;
  gd.security ||= {};
  gd.security.enabled = automodEnabled;
  gd.features.security = automodEnabled;
  db.guildSystems[guildId].security = automodEnabled;
  return gd;
}

function getPerSystemState(gd, key) {
  if (!gd) return undefined;
  const map = {
    ticket: gd.ticket?.enabled,
    counting: gd.countingSystem?.enabled,
    confession: gd.confession?.enabled,
    economy: gd.economy?.enabled,
    giveaway: gd.giveawaySystem?.enabled,
    sticky: gd.stickySystem?.enabled,
    afk: gd.afk?.enabled,
    antibot: gd.antibot?.enabled,
    antinuke: gd.antinuke?.systemEnabled ?? gd.antinuke?.enabled,
    antiraid: gd.security?.antiraid?.enabled ?? gd.antiRaid?.enabled,
    antilink: gd.antilink?.enabled,
    automod: gd.automod?.systemEnabled ?? gd.automod?.enabled,
    security: gd.security?.enabled,
    media: gd.media?.enabled,
    welcome: gd.welcome?.enabled,
    goodbye: gd.goodbye?.enabled,
    boost: gd.boost?.enabled,
    logging: gd.logging?.enabled,
    birthday: gd.birthday?.enabled,
    invites: gd.inviteSystem?.enabled,
    wall: gd.wallSystem?.systemEnabled ?? gd.wallSystem?.enabled,
    autoresponder: gd.autoresponder?.enabled,
    autoreact: gd.autoreact?.enabled,
    customroles: gd.customRoles?.enabled ?? gd.customroles?.enabled,
    fun: gd.fun?.enabled,
    tempvoice: gd.tempVoice?.enabled ?? gd.tempvoice?.enabled,
    joindm: gd.joinDm?.enabled,
    accountage: gd.accountAge?.enabled,
    verify: gd.verify?.enabled,
    warnpunish: gd.warnPunish?.enabled,
    muteevasion: gd.muteEvasion?.enabled,
  };
  return map[key];
}

function applyPerSystemState(gd, key, enabled, resetFilters = false) {
  if (!gd) return;
  const set = {
    ticket: () => { gd.ticket ||= {}; gd.ticket.enabled = enabled; },
    counting: () => { gd.countingSystem ||= {}; gd.countingSystem.enabled = enabled; },
    confession: () => { gd.confession ||= {}; gd.confession.enabled = enabled; },
    economy: () => { gd.economy ||= {}; gd.economy.enabled = enabled; },
    giveaway: () => { gd.giveawaySystem ||= {}; gd.giveawaySystem.enabled = enabled; },
    sticky: () => { gd.stickySystem ||= {}; gd.stickySystem.enabled = enabled; },
    afk: () => { gd.afk ||= {}; gd.afk.enabled = enabled; },
    antibot: () => { gd.antibot ||= {}; gd.antibot.enabled = enabled; gd.automod ||= {}; gd.automod.features ||= {}; gd.automod.features.antiBot = { ...(gd.automod.features.antiBot || {}), enabled }; },
    antinuke: () => { gd.antinuke ||= {}; gd.antinuke.systemEnabled = gd.antinuke.enabled = enabled; },
    antiraid: () => { gd.antiRaid ||= {}; gd.antiRaid.enabled = enabled; gd.security ||= {}; gd.security.antiraid ||= {}; gd.security.antiraid.enabled = enabled; },
    antilink: () => {
      gd.antilink ||= {};
      gd.antilink.enabled = enabled;
      gd.automod ||= {};
      gd.automod.antiLink = { ...gd.automod.antiLink, enabled };
      gd.automod.features ||= {};
      gd.automod.features.antiLink = { ...(gd.automod.features.antiLink || {}), enabled };
    },
    automod: () => {
      gd.automod ||= {};
      gd.automod.systemEnabled = gd.automod.enabled = enabled;
      gd.security ||= {};
      gd.security.enabled = enabled;
      gd.features ||= {};
      gd.features.security = enabled;
      gd.automod.antiSpam ||= {};
      gd.automod.antiMassMention ||= {};
      gd.automod.antiCaps ||= {};
      gd.automod.antiInvite ||= {};
      for (const filter of ["antiSpam", "antiMassMention", "antiCaps", "antiInvite"]) {
        if (typeof gd.automod[filter].enabled !== "boolean") gd.automod[filter].enabled = false;
      }
    },
    security: () => { gd.security ||= {}; gd.security.enabled = enabled; },
    media: () => { gd.media ||= {}; gd.media.enabled = enabled; },
    welcome: () => { gd.welcome ||= {}; gd.welcome.enabled = enabled; },
    goodbye: () => { gd.goodbye ||= {}; gd.goodbye.enabled = enabled; },
    boost: () => { gd.boost ||= {}; gd.boost.enabled = enabled; },
    logging: () => { gd.logging ||= {}; gd.logging.enabled = enabled; },
    birthday: () => { gd.birthday ||= {}; gd.birthday.enabled = enabled; },
    invites: () => { gd.inviteSystem ||= {}; gd.inviteSystem.enabled = enabled; },
    wall: () => { gd.wallSystem ||= {}; gd.wallSystem.systemEnabled = gd.wallSystem.enabled = enabled; },
    autoresponder: () => { gd.autoresponder ||= {}; gd.autoresponder.enabled = enabled; },
    autoreact: () => { gd.autoreact ||= {}; gd.autoreact.enabled = enabled; },
    customroles: () => { gd.customRoles ||= {}; gd.customRoles.enabled = enabled; gd.customroles ||= {}; gd.customroles.enabled = enabled; },
    fun: () => { gd.fun ||= {}; gd.fun.enabled = enabled; },
    tempvoice: () => { gd.tempVoice ||= {}; gd.tempVoice.enabled = enabled; gd.tempvoice ||= {}; gd.tempvoice.enabled = enabled; },
    joindm: () => { gd.joinDm ||= {}; gd.joinDm.enabled = enabled; },
    accountage: () => { gd.accountAge ||= {}; gd.accountAge.enabled = enabled; gd.automod ||= {}; gd.automod.features ||= {}; gd.automod.features.accountAge = { ...(gd.automod.features.accountAge || {}), enabled }; },
    verify: () => { gd.verify ||= {}; gd.verify.enabled = enabled; },
    warnpunish: () => { gd.warnPunish ||= {}; gd.warnPunish.enabled = enabled; },
    muteevasion: () => { gd.muteEvasion ||= {}; gd.muteEvasion.enabled = enabled; },
  };
  set[key]?.();
}

function linkedFeatureKeys(key) {
  const systems = featureSystems();
  const sys = systems.find(item => item?.name === key);
  return (sys?.linked || []).filter(child => child && child !== key);
}

function validFeature(key) {
  if (!key) return false;
  if (KNOWN_FEATURE_KEYS.has(key)) return true;
  const systems = featureSystems();
  if (!systems.length) return true;
  return systems.some(sys => sys.name === key || (sys.linked || []).includes(key));
}

function defaultFeatureState(key) {
  return key === "fun" || key === "economy" || key === "afk" || key === "autoresponder" || key === "autoreact";
}

function getFeatureState(guildId, feature, options = {}) {
  const key = featureKey(feature);
  if (!key) return true;
  const db = globalThis.db || {};
  const gd = ensureFeatureStores(guildId) || {};
  const gs = db.guildSystems?.[guildId] || {};
  if (!options.global && (gs[key] === true || gs[key] === false)) return gs[key];
  if (!options.global && gd.features && typeof gd.features[key] === "boolean") return gd.features[key];
  const perSystem = !options.global ? getPerSystemState(gd, key) : undefined;
  if (typeof perSystem === "boolean") return perSystem;
  if (db.global?.features && typeof db.global.features[key] === "boolean") return db.global.features[key];
  if (db.globalSystems && typeof db.globalSystems[key] === "boolean") return db.globalSystems[key];
  return defaultFeatureState(key);
}

function getProtectionRuntimeState(guildId, system, feature = null) {
  const systemKey = featureKey(system);
  const gd = ensureFeatureStores(guildId) || {};
  const root = ({ antinuke: gd.antinuke, automod: gd.automod, wall: gd.wallSystem })[systemKey];
  const systemEnabled = Boolean(root && (typeof root.systemEnabled === "boolean" ? root.systemEnabled : root.enabled === true));
  if (!feature) return { systemEnabled, featureEnabled: true, effectiveEnabled: systemEnabled };

  const key = String(feature).trim();
  const canonical = root?.features?.[key]?.enabled;
  let legacy;
  if (systemKey === "antinuke") legacy = root?.events?.[key];
  if (systemKey === "automod") {
    const gdRoot = typeof globalThis.guildData === "function" ? globalThis.guildData(guildId) : gd;
    const advanced = root?.advanced || {};
    const map = {
      antiSpam: root?.antiSpam?.enabled,
      antiMassMention: root?.antiMassMention?.enabled,
      antiCaps: root?.antiCaps?.enabled,
      antiInvite: root?.antiInvite?.enabled,
      antiLink: root?.antiLink?.enabled ?? gdRoot?.antilink?.enabled,
      antiBot: gdRoot?.antibot?.enabled,
      accountAge: gdRoot?.accountAge?.enabled ?? (Number(gdRoot?.security?.accountAgeDays) > 0),
      duplicate: advanced.duplicate?.enabled,
      invite: advanced.invite?.enabled,
      scams: advanced.scams?.enabled,
      imageScam: advanced.imageScam?.enabled,
      suspiciousLinks: advanced.suspiciousLinks?.enabled,
      badWords: gdRoot?.badWordEnabled,
      nsfw: gdRoot?.nsfwProtection,
      antiZalgo: gdRoot?.security?.antiZalgo,
      antiEveryoneBP: gdRoot?.security?.antiEveryoneBP,
    };
    legacy = map[key];
  }
  const featureEnabled = typeof canonical === "boolean" ? canonical : legacy === true;
  return { systemEnabled, featureEnabled, effectiveEnabled: systemEnabled && featureEnabled };
}

function setFeatureState(guildId, feature, enabled, options = {}) {
  const key = featureKey(feature);
  if (!validFeature(key)) return false;
  const next = enabled === true;
  const db = globalThis.db;
  if (!db) return false;
  ensureFeatureStores(guildId);

  if (options.global) {
    db.global ||= {};
    db.global.features ||= {};
    db.globalSystems ||= {};
    const current = getFeatureState(null, key, { global: true });
    console.log("[TOGGLE]", key, "OLD:", current, "NEW:", next);
    db.global.features[key] = next;
    db.globalSystems[key] = next;
  } else {
    if (!guildId) return false;
    const gd = ensureFeatureStores(guildId);
    if (!gd) return false;
    const current = getFeatureState(guildId, key);
    console.log("[TOGGLE]", key, "OLD:", current, "NEW:", next);
    gd.features[key] = next;
    db.guildSystems ||= {};
    db.guildSystems[guildId] ||= {};
    db.guildSystems[guildId][key] = next;
    applyPerSystemState(gd, key, next);
    if (typeof globalThis.syncProtectionPreferenceState === "function") {
      globalThis.syncProtectionPreferenceState(gd, "canonical");
    }
    if (key === "automod") db.guildSystems[guildId].security = next;
    if (options.linked !== false) {
      for (const child of linkedFeatureKeys(key)) {
        if (!validFeature(child)) continue;
        gd.features[child] = next;
        db.guildSystems[guildId][child] = next;
        applyPerSystemState(gd, child, next);
      }
    }
  }

  invalidateFeatureCache(guildId, key);
  if (options.sync === false) return true;
  syncFeatureState(guildId || null, key, { client: options.client || globalThis.client, reason: `feature:${key}`, refreshPanels: options.refreshPanels !== false }).catch(err => {
    console.warn(`[TOGGLE] sync failed guild=${guildId || "global"} feature=${key}: ${err.message}`);
  });
  return true;
}

function toggleFeatureState(guildId, feature, options = {}) {
  const current = getFeatureState(guildId, feature, options);
  const next = !current;
  return { current, next, ok: setFeatureState(guildId, feature, next, options) };
}

function syncGuildFeatureStoresFromGuildData(guildId = null) {
  const db = globalThis.db;
  if (!db || !db.guilds || typeof db.guilds !== "object") return false;
  if (!db.guildSystems || typeof db.guildSystems !== "object") db.guildSystems = {};

  const guildIds = guildId ? [String(guildId)].filter(isGuildId) : storedGuildIds();
  for (const gId of guildIds) {
    const gd = db.guilds[gId];
    if (!gd || typeof gd !== "object") continue;
    if (!gd.features || typeof gd.features !== "object") gd.features = {};
    if (!db.guildSystems[gId] || typeof db.guildSystems[gId] !== "object") db.guildSystems[gId] = {};

    for (const key of KNOWN_FEATURE_KEYS) {
      const perSystem = getPerSystemState(gd, key);
      if (typeof perSystem === "boolean") {
        gd.features[key] = perSystem;
        db.guildSystems[gId][key] = perSystem;
        continue;
      }
      if (typeof gd.features[key] === "boolean") {
        db.guildSystems[gId][key] = gd.features[key];
        applyPerSystemState(gd, key, gd.features[key]);
        continue;
      }
      if (typeof db.guildSystems[gId][key] === "boolean") {
        gd.features[key] = db.guildSystems[gId][key];
        applyPerSystemState(gd, key, db.guildSystems[gId][key]);
      }
    }
  }
  return true;
}

function invalidateFeatureCache(guildId = null, feature = null) {
  const prefix = guildId ? `${guildId}:` : "";
  for (const key of [...featurePanelCache.keys()]) {
    if (!guildId || key.startsWith(prefix)) featurePanelCache.delete(key);
  }
  if (typeof globalThis.invalidateGuildConfigCache === "function" && guildId) globalThis.invalidateGuildConfigCache(guildId);
  return true;
}

async function syncFeaturePanels(guildId, options = {}) {
  invalidateFeatureCache(guildId);
  if (options.interaction && typeof globalThis.refreshPanel === "function") {
    const gd = typeof globalThis.guildData === "function" ? globalThis.guildData(guildId) : null;
    return globalThis.refreshPanel(options.interaction, gd, { guildId, type: options.type || "toggle", ownerId: options.ownerId, reason: options.reason || "feature-sync" });
  }
  return true;
}

function refreshFeatureCollectors(guildId, reason = "feature-state-refresh") {
  if (typeof globalThis.cleanupCollectors === "function") {
    return globalThis.cleanupCollectors({ guildId, reason });
  }
  return 0;
}

async function syncFeatureState(guildId = null, feature = null, options = {}) {
  const reason = options.reason || (feature ? `feature:${feature}` : "feature-sync");
  if (typeof globalThis.saveDB === "function") await Promise.resolve(globalThis.saveDB());
  if (typeof globalThis.syncRuntimeState === "function") globalThis.syncRuntimeState(guildId || null, reason);
  if (guildId && typeof globalThis.refreshPanelState === "function") globalThis.refreshPanelState(guildId);
  if (options.refreshPanels !== false && typeof globalThis.refreshOpenPanels === "function") {
    await globalThis.refreshOpenPanels({ guildId, feature, client: options.client || globalThis.client });
  }
  if (guildId && (feature === "antilink" || feature === "automod") && typeof globalThis.scheduleNativeAutomod === "function") {
    globalThis.scheduleNativeAutomod(guildId);
  }
  return true;
}

const api = {
  featureKey,
  ensureFeatureStores,
  defaultFeatureState,
  getFeatureState,
  getProtectionRuntimeState,
  setFeatureState,
  toggleFeatureState,
  syncGuildFeatureStoresFromGuildData,
  syncFeaturePanels,
  syncFeatureState,
  refreshFeatureCollectors,
  invalidateFeatureCache,
};

globalThis.soezyFeatureStateManager = api;
Object.assign(globalThis, api);
module.exports = api;
})();
