"use strict";

const DEFAULT_MAPPING = {
  access: "X ACCESS",
  antinuke: "X NUKE",
  wall: "X WALL",
  antibot: "X BOT",
  automod: "X MOD",
  antiraid: "X RAID",
};

const FEATURE_ALIASES = {
  access: "access",
  antinuke: "antinuke",
  "anti-nuke": "antinuke",
  wall: "wall",
  antibot: "antibot",
  "anti-bot": "antibot",
  automod: "automod",
  "auto-mod": "automod",
  antiraid: "antiraid",
  "anti-raid": "antiraid",
};

function normalizeFeatureKey(featureKey) {
  const raw = String(featureKey || "").trim().toLowerCase();
  if (!raw) return null;
  return FEATURE_ALIASES[raw] || (Object.prototype.hasOwnProperty.call(DEFAULT_MAPPING, raw) ? raw : null);
}

function getRoleNameTemplate(featureKey) {
  const key = normalizeFeatureKey(featureKey);
  return key ? DEFAULT_MAPPING[key] || null : null;
}

function renderRoleNameForGuild(featureKey, guild) {
  const tmpl = getRoleNameTemplate(featureKey);
  return tmpl || null;
}

function ensureFeatureRoleStore(g) {
  if (!g || typeof g !== "object") return null;
  if (!g.featureRoleIds || typeof g.featureRoleIds !== "object" || Array.isArray(g.featureRoleIds)) g.featureRoleIds = {};
  return g.featureRoleIds;
}

function getSavedRoleId(guildData, featureKey) {
  if (!guildData) return null;
  const feature = normalizeFeatureKey(featureKey);
  if (!feature) return null;
  const store = ensureFeatureRoleStore(guildData);
  if (!store) return null;
  const value = store[feature];
  return value && String(value).trim() ? String(value) : null;
}

function setSavedRoleId(guildData, featureKey, roleId) {
  if (!guildData) return null;
  const feature = normalizeFeatureKey(featureKey);
  if (!feature) return null;
  const store = ensureFeatureRoleStore(guildData);
  if (!store) return null;
  store[feature] = roleId && String(roleId).trim() ? String(roleId) : null;
  return store[feature];
}

function setFeatureRoleId(guildData, featureKey, roleId) {
  const feature = normalizeFeatureKey(featureKey);
  const previousId = feature && guildData ? getSavedRoleId(guildData, feature) || resolveLegacyRoleId(guildData, feature) : null;
  const id = setSavedRoleId(guildData, feature, roleId);
  if (!guildData || !feature) return id;
  const root = feature === "wall" ? (guildData.wallSystem ||= {})
    : feature === "antiraid" ? (guildData.antiRaid ||= {})
      : (guildData[feature] ||= {});
  root.whitelistRoleId = id;
  if (feature === "wall") {
    root.immuneRoleId = id;
    if (previousId && previousId !== id) {
      root.whitelistRoleIds = (root.whitelistRoleIds || []).filter(value => String(value) !== String(previousId));
      root.immuneRoleIds = (root.immuneRoleIds || []).filter(value => String(value) !== String(previousId));
    }
  }
  if (feature === "antiraid") {
    guildData.security ||= {};
    guildData.security.antiraid ||= {};
    guildData.security.antiraid.whitelistRoleId = id;
  }
  return id;
}

function resolveLegacyRoleId(guildData, featureKey) {
  const feature = normalizeFeatureKey(featureKey);
  if (!guildData || !feature) return null;
  const legacyMap = {
    antinuke: ["antinuke.whitelistRoleId", "antinuke.immuneRoleId"],
    wall: ["wallSystem.whitelistRoleId", "wallSystem.immuneRoleId"],
    antibot: ["antibot.whitelistRoleId", "antibot.immuneRoleId"],
    automod: ["automod.whitelistRoleId", "automod.immuneRoleId"],
    antiraid: ["security.antiraid.whitelistRoleId", "security.antiraid.immuneRoleId", "antiRaid.whitelistRoleId"],
    access: ["access.whitelistRoleId", "security.whitelistRoleId"],
  };

  for (const path of legacyMap[feature] || []) {
    const ref = path.split(".");
    let value = guildData;
    for (const segment of ref) {
      if (value && typeof value === "object") value = value[segment];
      else { value = undefined; break; }
    }
    const id = value && String(value).trim();
    if (id && /^\d{1,20}$/.test(id)) return id;
  }
  return null;
}

function resolveFeatureRole(guildIdOrData, featureKey, options = {}) {
  const logger = options.logger || console;
  const guildData = typeof guildIdOrData === "string" || typeof guildIdOrData === "number"
    ? (globalThis.guildData ? globalThis.guildData(String(guildIdOrData)) : (globalThis.db?.guilds || {})[String(guildIdOrData)])
    : guildIdOrData;
  const feature = normalizeFeatureKey(featureKey);
  if (!guildData || !feature) return null;

  const saved = getSavedRoleId(guildData, feature);
  if (saved) {
    const order = ["antinuke", "wall", "automod", "antibot", "antiraid", "access"];
    const owner = order.find(candidate => getSavedRoleId(guildData, candidate) === saved);
    if (owner && owner !== feature) return null;
    return saved;
  }

  const legacy = resolveLegacyRoleId(guildData, feature);
  if (legacy) {
    const order = ["antinuke", "wall", "automod", "antibot", "antiraid", "access"];
    const owner = order.find(candidate =>
      getSavedRoleId(guildData, candidate) === legacy || resolveLegacyRoleId(guildData, candidate) === legacy
    );
    if (owner && owner !== feature) return null;
    setSavedRoleId(guildData, feature, legacy);
    return legacy;
  }

  if (options.createIfMissing === true && typeof guildData.guildId === "string") {
    logger.warn(`[FeatureRoleMap] Missing persisted role ID for feature '${feature}' (${guildData.guildId || "unknown"})`);
  }
  return null;
}

function isFeatureRoleMappedToAnother(guildData, featureKey, roleId) {
  const feature = normalizeFeatureKey(featureKey);
  const id = String(roleId || "");
  if (!feature || !id) return false;
  const order = ["antinuke", "wall", "automod", "antibot", "antiraid", "access"];
  const owner = order.find(candidate =>
    getSavedRoleId(guildData, candidate) === id || resolveLegacyRoleId(guildData, candidate) === id
  );
  return Boolean(owner && owner !== feature);
}

function gatherFeatureRoleIds(guildData, featureKeys) {
  const features = Array.isArray(featureKeys) ? featureKeys : [featureKeys];
  const ids = [];
  for (const key of features) {
    const id = resolveFeatureRole(guildData, key);
    if (id) ids.push(String(id));
  }
  return [...new Set(ids)];
}

function validateMapping(logger = console) {
  const keys = Object.keys(DEFAULT_MAPPING);
  const dup = keys.length !== new Set(keys).size;
  if (dup) logger.warn("[FeatureRoleMap] Duplicate feature keys in default mapping.");
  for (const k of keys) {
    if (!DEFAULT_MAPPING[k] || typeof DEFAULT_MAPPING[k] !== "string") {
      logger.warn(`[FeatureRoleMap] Invalid mapping for ${k}`);
    }
  }
  return true;
}

module.exports = {
  DEFAULT_MAPPING,
  FEATURE_ALIASES,
  normalizeFeatureKey,
  getRoleNameTemplate,
  renderRoleNameForGuild,
  ensureFeatureRoleStore,
  getSavedRoleId,
  setSavedRoleId,
  setFeatureRoleId,
  resolveLegacyRoleId,
  resolveFeatureRole,
  isFeatureRoleMappedToAnother,
  gatherFeatureRoleIds,
  validateMapping,
};
