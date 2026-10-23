const { PermissionsBitField } = require("discord.js");
const inviteFilter = require("./inviteFilter");
const duplicateFilter = require("./duplicateFilter");
const scamFilter = require("./scamFilter");
const imageScamFilter = require("./imageScamFilter");
const antiLinkFilter = require("./antiLinkFilter");
const { migrateAntiLinkToAutoMod } = require("../../utils/securityMigrations");
const { resolve: resolvePunishment } = require("../../utils/automodPunishment");
const { isNativeFilterInstalled } = require("../../utils/nativeAutomodState");
const incidentClaims = globalThis.__soezyAutomodIncidentClaims || (globalThis.__soezyAutomodIncidentClaims = new Map());

const FEATURE_KEYS = {
  antilink: "antiLink",
  "anti-link": "antiLink",
  antiLink: "antiLink",
  invite: "invite",
  duplicate: "duplicate",
  duplicates: "duplicate",
  scam: "scams",
  scams: "scams",
  suspicious: "suspiciousLinks",
  suspiciousLinks: "suspiciousLinks",
  "image-scam": "imageScam",
  imagescam: "imageScam",
  imageScam: "imageScam",
};

const DEFAULT_CONFIG = {
  enabled: true,
  invite: { enabled: false },
  duplicate: { enabled: false, minLength: 4, similarity: 0.88, requiredCount: 3, windowMs: 30000, timeoutMs: 600000 },
  scams: { enabled: false, fuzzyThreshold: 0.82, phrases: scamFilter.DEFAULT_SCAM_PHRASES },
  suspiciousLinks: { enabled: false, minDomainAgeDays: 14, maxEmojis: 18, maxMentions: 8 },
  imageScam: { enabled: false, minIndicators: 2, keywords: imageScamFilter.IMAGE_KEYWORDS, maxImages: 3 },
  punishment: "warn",
  logs: null,
  violations: {},
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function unique(values) {
  return [...new Set((values || []).map(String).filter(Boolean))];
}

function resolveFeature(feature) {
  return FEATURE_KEYS[String(feature || "").trim()] || null;
}

function getGuildData(guildId, deps = {}) {
  if (typeof deps.guildData === "function") return deps.guildData(guildId);
  const db = deps.db || globalThis.db;
  if (!db.guilds) db.guilds = {};
  if (!db.guilds[guildId]) db.guilds[guildId] = {};
  return db.guilds[guildId];
}

function ensureAutomodRoots(gd) {
  gd.automod ||= {};
  gd.automodWhitelistRoles = unique([...(gd.automodWhitelistRoles || []), ...(gd.automodImmuneRoles || [])]);
  gd.automodImmuneRoles = gd.automodWhitelistRoles;
  gd.automodWhitelistUsers = unique([...(gd.automodWhitelistUsers || []), ...(gd.automodImmuneUsers || [])]);
  gd.automodImmuneUsers = gd.automodWhitelistUsers;
  gd.automodWhitelistChannels = unique([...(gd.automodWhitelistChannels || []), ...(gd.automodImmuneChannels || [])]);
  gd.automodImmuneChannels = gd.automodWhitelistChannels;
  gd.automod.whitelistRoles = gd.automod.immuneRoles = gd.automodImmuneRoles;
  gd.automod.whitelistUsers = gd.automod.immuneUsers = gd.automodImmuneUsers;
  gd.automod.whitelistChannels = gd.automod.immuneChannels = gd.automodImmuneChannels;
  return gd.automod;
}

function ensureConfig(guildId, deps = {}) {
  const gd = getGuildData(guildId, deps);
  migrateAntiLinkToAutoMod(gd, deps.db?.guildSystems?.[guildId]);
  const automod = ensureAutomodRoots(gd);
  automod.advanced ||= {};

  const defaults = clone(DEFAULT_CONFIG);
  const legacyInviteEnabled = automod.antiInvite?.enabled === true;
  const advancedInviteEnabled = automod.advanced?.invite?.enabled === true;
  automod.advanced = {
    ...defaults,
    ...automod.advanced,
    invite: { ...defaults.invite, ...(automod.advanced.invite || {}), enabled: automod.antiInvite?.enabled === undefined ? advancedInviteEnabled : legacyInviteEnabled },
    duplicate: { ...defaults.duplicate, ...(automod.advanced.duplicate || {}) },
    scams: { ...defaults.scams, ...(automod.advanced.scams || {}) },
    suspiciousLinks: { ...defaults.suspiciousLinks, ...(automod.advanced.suspiciousLinks || {}) },
    imageScam: { ...defaults.imageScam, ...(automod.advanced.imageScam || {}) },
    violations: automod.advanced.violations || {},
  };

  if (!["warn", "timeout", "kick", "ban", "block"].includes(automod.advanced.punishment)) {
    automod.advanced.punishment = "warn";
  }

  return automod.advanced;
}

function syncSavedProtectionPreferences(gd) {
  if (typeof globalThis.syncProtectionPreferenceState === "function") {
    globalThis.syncProtectionPreferenceState(gd, "legacy");
  }
}

function save(deps = {}) {
  if (typeof deps.saveDB === "function") deps.saveDB();
  else if (typeof globalThis.saveDB === "function") globalThis.saveDB();
}

async function recordViolation(message, detection, action, deps = {}) {
  const guildId = message.guildId;
  const userId = message.author.id;

  const cfg = ensureConfig(guildId, deps);
  cfg.violations[userId] ||= {};
  cfg.violations[userId][detection.type] ||= { count: 0 };
  cfg.violations[userId][detection.type].count += 1;
  cfg.violations[userId][detection.type].lastReason = detection.reason;
  cfg.violations[userId][detection.type].lastAction = action;
  cfg.violations[userId][detection.type].lastAt = Date.now();
  save(deps);
  return cfg.violations[userId][detection.type].count;
}

function roleIds(member) {
  return [...(member?.roles?.cache?.keys?.() || [])];
}

function whitelistIds(gd, cfg, kind) {
  if (kind === "role") {
    return unique([
      ...(gd.automodWhitelistRoles || []),
      ...(gd.automodImmuneRoles || []),
      ...(gd.automod?.whitelistRoles || []),
      ...(gd.automod?.immuneRoles || []),
      ...(cfg.whitelistRoles || []),
      ...(cfg.immuneRoles || []),
    ]);
  }
  if (kind === "channel") {
    return unique([
      ...(gd.automodWhitelistChannels || []),
      ...(gd.automodImmuneChannels || []),
      ...(gd.automod?.whitelistChannels || []),
      ...(gd.automod?.immuneChannels || []),
      ...(cfg.whitelistChannels || []),
      ...(cfg.immuneChannels || []),
    ]);
  }
  return unique([
    ...(gd.automodWhitelistUsers || []),
    ...(gd.automodImmuneUsers || []),
    ...(gd.automod?.whitelistUsers || []),
    ...(gd.automod?.immuneUsers || []),
    ...(cfg.whitelistUsers || []),
    ...(cfg.immuneUsers || []),
  ]);
}

function isBypassed(message, cfg, deps = {}) {
  const gd = getGuildData(message.guildId, deps);
  if (message.author?.id === message.client?.user?.id) return true;
  if (typeof deps.isAutomodImmune === "function" && deps.isAutomodImmune(message.member, message.channel, message.guildId)) return true;

  if (whitelistIds(gd, cfg, "user").includes(message.author.id)) return true;
  if (whitelistIds(gd, cfg, "channel").includes(message.channelId)) return true;

  const memberRoles = roleIds(message.member);
  return whitelistIds(gd, cfg, "role").some(id => memberRoles.includes(id));
}

function isFeatureBypassed(message, feature, deps = {}) {
  const gd = getGuildData(message.guildId, deps);
  const featureConfig = gd.automod?.[feature] || gd.automod?.advanced?.[feature] || {};
  if (featureConfig.whitelistUsers?.includes(message.author.id) || featureConfig.immuneUsers?.includes(message.author.id)) return true;
  if (featureConfig.whitelistChannels?.includes(message.channelId) || featureConfig.immuneChannels?.includes(message.channelId)) return true;
  const roles = roleIds(message.member);
  return roles.some(id => featureConfig.whitelistRoles?.includes(id) || featureConfig.immuneRoles?.includes(id));
}

function shouldRun(message, cfg, deps = {}) {
  const gd = getGuildData(message.guildId, deps);
  if (!message.guild || !message.channel || !message.author) return false;
  const systemEnabled = typeof gd.automod?.systemEnabled === "boolean"
    ? gd.automod.systemEnabled
    : gd.automod?.enabled === true;
  if (!systemEnabled) return false;
  if (cfg.enabled === false) return false;
  return !isBypassed(message, cfg, deps);
}

async function deleteMessages(messages, warnOnFailure = false) {
  const seen = new Set();
  const deleted = [];
  let failed = 0;
  for (const message of messages.filter(Boolean)) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    if (message.deletable === false) {
      failed += 1;
      continue;
    }
    await message.delete().then(() => deleted.push(message)).catch(() => { failed += 1; });
  }
  if (warnOnFailure && failed) console.warn(`[AutoMod] Could not delete ${failed} recent message(s) after timeout; check Manage Messages permission.`);
  return deleted;
}

async function deleteRecentUserMessages(message, limit = 10) {
  const messages = message.channel?.messages;
  if (!messages?.fetch || !message.author?.id) return [];

  const history = await messages.fetch({ limit: 100 }).catch(error => {
    console.warn("[AutoMod] Could not fetch recent messages after timeout:", error?.message || error);
    return null;
  });
  if (!history) return [];

  const recent = Array.from(history.values?.() || history)
    .filter(item => item?.author?.id === message.author.id)
    .sort((a, b) => (b.createdTimestamp || 0) - (a.createdTimestamp || 0))
    .slice(0, Math.max(0, Math.min(10, Number(limit) || 10)));
  return deleteMessages(recent, true);
}

function inviteActionForCount(count) {
  if (count <= 1) return "warn";
  if (count === 2) return "timeout";
  if (count === 3) return "kick";
  return "ban";
}

async function applyAction(message, action, reason, timeoutMs = 30 * 60 * 1000) {
  const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) return false;

  if (action === "timeout") {
    if (member.moderatable === false) {
      console.warn(`[AutoMod] Timeout unavailable for ${member.id}: bot cannot moderate this member (permission or role hierarchy).`);
      return false;
    }
    const boundedTimeout = Math.max(60_000, Math.min(28 * 24 * 60 * 60 * 1000, Number(timeoutMs) || 30 * 60 * 1000));
    return member.timeout(boundedTimeout, reason)
      .then(() => true)
      .catch(error => { console.error("[AutoMod] Timeout failed:", error); return false; });
  }
  if (action === "kick") {
    return member.kick(reason)
      .then(() => true)
      .catch(error => { console.error("[AutoMod] Kick failed:", error); return false; });
  }
  if (action === "ban") {
    return member.ban({ reason })
      .then(() => true)
      .catch(error => { console.error("[AutoMod] Ban failed:", error); return false; });
  }
  if (action === "block") return true;
  return false;
}

function actionDescription(action, count, detection) {
  if (action === "timeout_failed") return "Timeout failed. Check that I have Moderate Members permission and my highest role is above the member's roles.";
  if (action === "kick_failed") return "Kick failed. Check my Kick Members permission and role hierarchy.";
  if (action === "ban_failed") return "Ban failed. Check my Ban Members permission and role hierarchy.";
  if (detection.type === "invite") {
    if (action === "warn") return `Warning issued. Offense ${count}/4.`;
    if (action === "timeout") return "Timed out for 30 minutes. Offense 2/4.";
    if (action === "kick") return "Kicked from the server. Offense 3/4.";
    return "Banned from the server. Offense 4/4.";
  }
  if (action === "timeout") return `Timed out for ${Math.round((detection.timeoutMs || 30 * 60 * 1000) / 60000)} minutes.`;
  if (action === "kick") return "Kicked from the server.";
  if (action === "ban") return "Banned from the server.";
  if (action === "block") return "Message blocked.";
  return "Warning issued.";
}

function claimIncident(message, detection) {
  const now = Date.now();
  if (incidentClaims.size > 10_000) {
    for (const [key, expiresAt] of incidentClaims) if (expiresAt <= now) incidentClaims.delete(key);
    while (incidentClaims.size > 10_000) incidentClaims.delete(incidentClaims.keys().next().value);
  }
  const incidentId = detection.incidentId || message.id || `${detection.type}:${now}`;
  const key = `${message.guildId}:${message.author.id}:${detection.type}:${incidentId}`;
  if ((incidentClaims.get(key) || 0) > now) return false;
  incidentClaims.delete(key);
  incidentClaims.set(key, now + Math.max(30_000, Number(detection.dedupeMs) || 60_000));
  return true;
}

async function sendNotice(message, detection, action, count, deps = {}) {
  if (action === "block") return;
  const description =
    `${message.author}, your message was removed by AutoMod.\n` +
    `Reason: **${detection.reason}**\n` +
    `Action: **${actionDescription(action, count, detection)}**`;

  const componentsAllowed = typeof deps.createWarningContainer === "function" && deps.MessageFlags;
  const payload = componentsAllowed
    ? { components: [deps.createWarningContainer(detection.title || "AutoMod", description)], flags: deps.MessageFlags.IsComponentsV2 }
    : typeof deps.createWarningEmbed === "function"
      ? { embeds: [deps.createWarningEmbed(detection.title || "AutoMod", description)] }
      : { content: `**${detection.title || "AutoMod"}**\n${description}` };

  const sent = await message.channel.send(payload).catch(() => null);
  if (sent) setTimeout(() => sent.delete().catch(() => {}), 8000);
}

async function sendLog(message, detection, action, count, deps = {}) {
  const gd = getGuildData(message.guildId, deps);
  const cfg = ensureConfig(message.guildId, deps);
  const logId =
    cfg.logs ||
    gd.automod?.logs ||
    gd.automod?.logChannel ||
    gd.logging?.channels?.moderation ||
    gd.logging?.channel ||
    gd.modLogChannel;
  if (!logId) return;

  const channel = message.guild.channels.cache.get(logId) || await message.guild.channels.fetch(logId).catch(() => null);
  if (!channel?.send) return;

  const indicators = (detection.indicators || []).length
    ? detection.indicators.map(item => `- ${item}`).join("\n")
    : "- None";
  const fields = [
    { name: "User", value: `${message.author.displayName || message.author.globalName || message.author.username || message.author.tag} (\`${message.author.id}\`)` },
    { name: "Channel", value: `${message.channel} (\`${message.channel.id}\`)` },
    { name: "Reason", value: detection.reason || "Unknown" },
    { name: "Action", value: action },
    { name: "Offenses", value: count },
    { name: "Indicators", value: indicators },
  ];
  const logSender = typeof deps.sendLoggingContainer === "function"
    ? deps.sendLoggingContainer
    : sendLoggingContainer;
  await logSender(channel, "automod", {
    guild: message.guild,
    title: detection.title || "Advanced AutoMod",
    actor: message.author,
    fields,
  });
}

async function handleDetection(message, detection, deps = {}) {
  if (!claimIncident(message, detection)) return true;
  const cfg = ensureConfig(message.guildId, deps);
  const messages = detection.messages?.length ? detection.messages : [message];
  const deleted = detection.delete ? await deleteMessages(messages) : [];

  if (deleted.length && typeof deps.sendPurgeLog === "function") {
    await deps.sendPurgeLog(message.guild, deleted, `Advanced AutoMod - ${detection.reason}`, null, message.channel).catch(() => {});
  }

  const category = { scam: "scams", "image-scam": "imageScam" }[detection.type] || detection.type;
  const configuredAction = resolvePunishment(getGuildData(message.guildId, deps).automod, category);
  let action = configuredAction || detection.action || cfg.punishment || "warn";
  if (action === "mute") action = "timeout";
  if (action === "delete") action = "block";
  let violationCount = await recordViolation(message, detection, action, deps);
  if (detection.type === "invite" && !configuredAction) action = inviteActionForCount(violationCount);

  const actionApplied = action === "warn" || action === "block"
    ? true
    : await applyAction(message, action, `Advanced AutoMod: ${detection.reason}`, detection.timeoutMs || 30 * 60 * 1000);
  const reportedAction = actionApplied ? action : `${action}_failed`;

  if (action === "timeout" && actionApplied) {
    const recentDeleted = await deleteRecentUserMessages(message, 10);
    if (recentDeleted.length && typeof deps.sendPurgeLog === "function") {
      await deps.sendPurgeLog(message.guild, recentDeleted, `AutoMod - ${detection.reason} (recent messages after timeout)`, null, message.channel).catch(() => {});
    }
  }

  if (typeof deps.sendAutoModNotice === "function") {
    await deps.sendAutoModNotice(message, detection, reportedAction, violationCount);
  } else {
    await sendNotice(message, detection, reportedAction, violationCount, deps);
  }
  await sendLog(message, detection, reportedAction, violationCount, deps);
  return true;
}

async function handleMessage(message, deps = {}) {
  const cfg = ensureConfig(message.guildId, deps);
  if (!shouldRun(message, cfg, deps)) return false;

  const antiLink = getGuildData(message.guildId, deps).automod?.antiLink;
  if (antiLink?.enabled === true && !isFeatureBypassed(message, "antiLink", deps)) {
      const detection = antiLinkFilter.check(message, antiLink);
      if (detection) return handleDetection(message, detection, deps);
  }

  if (cfg.invite?.enabled === true && !isFeatureBypassed(message, "antiInvite", deps)) {
    const detection = inviteFilter.check(message, cfg);
    if (detection) return handleDetection(message, detection, deps);
  }

  if (cfg.duplicate?.enabled === true && !isNativeFilterInstalled(getGuildData(message.guildId, deps), "duplicate") && !isFeatureBypassed(message, "duplicate", deps)) {
    const detection = duplicateFilter.check(message, cfg);
    if (detection) return handleDetection(message, detection, deps);
  }

  if ((cfg.scams?.enabled === true && !isFeatureBypassed(message, "scams", deps)) || (cfg.suspiciousLinks?.enabled === true && !isFeatureBypassed(message, "suspiciousLinks", deps))) {
    const detection = await scamFilter.check(message, cfg);
    if (detection && (detection.type === "scam"
      ? cfg.scams?.enabled === true && !isFeatureBypassed(message, "scams", deps)
      : cfg.suspiciousLinks?.enabled === true && !isFeatureBypassed(message, "suspiciousLinks", deps))) {
      return handleDetection(message, detection, deps);
    }
  }

  if (cfg.imageScam?.enabled === true && !isFeatureBypassed(message, "imageScam", deps)) {
    const detection = await imageScamFilter.check(message, cfg);
    if (detection) return handleDetection(message, detection, deps);
  }

  return false;
}

async function setFeature(guildId, feature, enabled, deps = {}) {
  const key = resolveFeature(feature);
  if (!key) throw new Error(`Unknown automod feature: ${feature}`);
  const gd = getGuildData(guildId, deps);
  const cfg = ensureConfig(guildId, deps);
  if (key === "invite") {
    gd.automod.antiInvite ||= {};
    gd.automod.antiInvite.enabled = Boolean(enabled);
    cfg.invite.enabled = Boolean(enabled);
  }
  if (key === "antiLink") {
    gd.automod.antiLink ||= { enabled: false, allowedDomains: [], whitelistUsers: [], whitelistRoles: [], whitelistChannels: [] };
    gd.automod.antiLink.enabled = Boolean(enabled);
    gd.antilink ||= {};
    gd.antilink.enabled = Boolean(enabled);
    syncSavedProtectionPreferences(gd);
    save(deps);
    return cfg;
  }
  cfg[key] ||= {};
  cfg[key].enabled = Boolean(enabled);
  syncSavedProtectionPreferences(gd);
  save(deps);
  return cfg;
}

async function toggleFeature(guildId, feature, deps = {}) {
  const key = resolveFeature(feature);
  if (!key) throw new Error(`Unknown automod feature: ${feature}`);
  if (key === "antiLink") {
    const gd = getGuildData(guildId, deps);
    return setFeature(guildId, key, gd.automod?.antiLink?.enabled !== true, deps);
  }
  const cfg = ensureConfig(guildId, deps);
  return setFeature(guildId, key, !(cfg[key]?.enabled !== false), deps);
}

async function setPunishment(guildId, punishment, deps = {}) {
  const action = String(punishment || "").toLowerCase();
  if (!["warn", "timeout", "kick", "ban", "block"].includes(action)) throw new Error("Invalid punishment");
  const gd = getGuildData(guildId, deps);
  gd.automod ||= {};
  gd.automod.punishment = action;
  const cfg = ensureConfig(guildId, deps);
  cfg.punishment = action;
  save(deps);
  return cfg;
}

async function setLogChannel(guildId, channelId, deps = {}) {
  const cfg = ensureConfig(guildId, deps);
  cfg.logs = channelId || null;
  const gd = getGuildData(guildId, deps);
  gd.nativeAutomod ||= { ruleIds: {}, keywords: [], alertChannelId: null };
  gd.nativeAutomod.alertChannelId = channelId || null;
  save(deps);
  return cfg;
}

async function setAllowedDomain(guildId, domain, deps = {}) {
  const normalized = antiLinkFilter.normalizeDomain(domain);
  if (!normalized) throw new Error("Enter a valid domain, such as `example.com`.");
  const cfg = ensureConfig(guildId, deps);
  const linkConfig = getGuildData(guildId, deps).automod.antiLink;
  const domains = unique(linkConfig.allowedDomains || []);
  if (!domains.includes(normalized)) domains.push(normalized);
  linkConfig.allowedDomains = domains;
  save(deps);
  return linkConfig;
}

async function removeAllowedDomain(guildId, domain, deps = {}) {
  const normalized = antiLinkFilter.normalizeDomain(domain);
  if (!normalized) throw new Error("Enter a valid domain, such as `example.com`.");
  const cfg = ensureConfig(guildId, deps);
  const linkConfig = getGuildData(guildId, deps).automod.antiLink;
  linkConfig.allowedDomains = unique(linkConfig.allowedDomains || []).filter(item => item !== normalized);
  save(deps);
  return linkConfig;
}

async function addWhitelistRole(guildId, roleId, deps = {}) {
  const gd = getGuildData(guildId, deps);
  ensureConfig(guildId, deps);
  gd.automodWhitelistRoles = gd.automodImmuneRoles = unique([...(gd.automodImmuneRoles || []), roleId]);
  gd.automod.whitelistRoles = gd.automod.immuneRoles = gd.automodImmuneRoles;
  save(deps);
  return gd.automodImmuneRoles;
}

async function addWhitelistChannel(guildId, channelId, deps = {}) {
  const gd = getGuildData(guildId, deps);
  ensureConfig(guildId, deps);
  gd.automodWhitelistChannels = gd.automodImmuneChannels = unique([...(gd.automodImmuneChannels || []), channelId]);
  gd.automod.whitelistChannels = gd.automod.immuneChannels = gd.automodImmuneChannels;
  save(deps);
  return gd.automodImmuneChannels;
}

module.exports = {
  DEFAULT_CONFIG,
  FEATURE_KEYS,
  addWhitelistChannel,
  addWhitelistRole,
  ensureConfig,
  applyAction,
  handleDetection,
  handleMessage,
  resolveFeature,
  setFeature,
  setAllowedDomain,
  removeAllowedDomain,
  setLogChannel,
  setPunishment,
  toggleFeature,
};
