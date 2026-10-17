"use strict";

const {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
} = require("discord.js");

const MANAGED_PREFIX = "Soezy Native AutoMod:";
const MAX_KEYWORDS = 1000;
const MAX_KEYWORD_LENGTH = 60;

function nativeState(guildData, guildId) {
  const gd = guildData(guildId);
  gd.nativeAutomod ||= { ruleIds: {}, keywords: [], alertChannelId: null };
  gd.nativeAutomod.ruleIds ||= {};
  gd.nativeAutomod.keywords = [...new Set((gd.nativeAutomod.keywords || []).map(value => String(value).trim()).filter(Boolean))];
  return gd.nativeAutomod;
}

function apiError(error) {
  const code = error?.code;
  if (code === 50013 || code === 50001) {
    const where = [error?.method, String(error?.url || "").replace(/^https?:\/\/[^/]+\/api\/v\d+/, "")].filter(Boolean).join(" ");
    console.error(`[NATIVE AUTOMOD] Discord ${code}: ${error?.message || "no message"}${where ? ` @ ${where}` : ""}`);
    return code === 50001
      ? "Discord denied access to this AutoMod operation. This can be a rule availability restriction, even when the bot has Administrator."
      : "Discord denied this AutoMod operation. Check Manage Server permissions and access to the configured alert channel.";
  }
  if (code === 30035) return "This server has reached Discord's AutoMod rule limit.";
  if (code === 50035) return "Discord rejected that AutoMod configuration. Check the keyword, regex pattern, and alert channel.";
  if (code === 429) return "Discord is rate-limiting AutoMod changes. Please try again shortly.";
  if (!code && error?.message) return error.message;
  return `Discord AutoMod request failed${code ? ` (code ${code})` : ""}.`;
}

function requireGuild(guild) {
  if (!guild?.autoModerationRules) throw new Error("This command must be used in a server where Discord AutoMod is available.");
}

function buildActions(alertChannelId) {
  const actions = [{ type: AutoModerationActionType.BlockMessage }];
  if (alertChannelId) actions.push({ type: AutoModerationActionType.SendAlertMessage, metadata: { channel: alertChannelId } });
  return actions;
}

async function getManagedRule(guild, state, key) {
  const id = state.ruleIds[key];
  if (!id) return null;
  const rules = await guild.autoModerationRules.fetch();
  const rule = rules.get(id);
  if (rule && (rule.creatorId !== guild.client.user.id || !rule.name.startsWith(MANAGED_PREFIX))) throw new Error("Saved AutoMod rule is not owned by this bot.");
  return rule || null;
}

async function upsertKeywordRule(guild, state, gd = {}) {
  const parentEnabled = typeof gd.automod?.systemEnabled === "boolean"
    ? gd.automod.systemEnabled
    : gd.automod?.enabled === true;
  if (!parentEnabled) return { operation: "deferred", rule: null };
  const keywords = state.keywords;
  const existing = await getManagedRule(guild, state, "keywords");
  const payload = {
    name: `${MANAGED_PREFIX} Keywords`,
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerType: AutoModerationRuleTriggerType.Keyword,
    triggerMetadata: { keywordFilter: keywords },
    actions: buildActions(state.alertChannelId),
    enabled: true,
    reason: "Soezy native AutoMod keyword configuration",
  };
  if (existing) {
    if (!keywords.length) {
      await existing.delete("Soezy native AutoMod keyword list emptied");
      delete state.ruleIds.keywords;
      return { operation: "deleted", rule: null };
    }
    const rule = await existing.edit(payload);
    return { operation: "updated", rule };
  }
  if (!keywords.length) return { operation: "unchanged", rule: null };
  const rule = await guild.autoModerationRules.create(payload);
  state.ruleIds.keywords = rule.id;
  return { operation: "created", rule };
}

async function setup(guild, deps, alertChannelId = null) {
  requireGuild(guild);
  const state = nativeState(deps.guildData, guild.id);
  if (alertChannelId) state.alertChannelId = String(alertChannelId);
  const gd = deps.guildData(guild.id);
  const parentEnabled = typeof gd.automod?.systemEnabled === "boolean"
    ? gd.automod.systemEnabled
    : gd.automod?.enabled === true;
  if (!parentEnabled) {
    state.syncEnabled = true;
    await setManagedRulesEnabled(guild, deps, false);
    deps.saveDB?.(guild.id);
    return { state, result: { operation: "deferred", rule: null }, filters: 0 };
  }
  const result = await upsertKeywordRule(guild, state, gd);
  const filters = await syncFilters(guild, deps);
  state.syncEnabled = true;
  deps.saveDB?.();
  return { state, result, filters };
}

async function setupAll(guild, deps, alertChannelId = null) {
  requireGuild(guild);
  return setup(guild, deps, alertChannelId);
}

async function addKeyword(guild, deps, keyword) {
  requireGuild(guild);
  const value = String(keyword || "").trim();
  if (!value || value.length > MAX_KEYWORD_LENGTH) throw new Error(`Keywords must be between 1 and ${MAX_KEYWORD_LENGTH} characters.`);
  const state = nativeState(deps.guildData, guild.id);
  if (state.keywords.length >= MAX_KEYWORDS && !state.keywords.includes(value)) throw new Error("The managed keyword list is full.");
  if (!state.keywords.includes(value)) state.keywords.push(value);
  const gd = deps.guildData(guild.id);
  if (!((typeof gd.automod?.systemEnabled === "boolean" ? gd.automod.systemEnabled : gd.automod?.enabled) === true)) {
    await setManagedRulesEnabled(guild, deps, false);
    deps.saveDB?.(guild.id);
    return { state, result: { operation: "deferred", rule: null }, added: value };
  }
  const result = await upsertKeywordRule(guild, state, gd);
  deps.saveDB?.();
  return { state, result, added: value };
}

async function removeKeyword(guild, deps, keyword) {
  requireGuild(guild);
  const value = String(keyword || "").trim();
  const state = nativeState(deps.guildData, guild.id);
  state.keywords = state.keywords.filter(item => item !== value);
  const gd = deps.guildData(guild.id);
  if (!((typeof gd.automod?.systemEnabled === "boolean" ? gd.automod.systemEnabled : gd.automod?.enabled) === true)) {
    await setManagedRulesEnabled(guild, deps, false);
    deps.saveDB?.(guild.id);
    return { state, result: { operation: "deferred", rule: null }, removed: value };
  }
  const result = await upsertKeywordRule(guild, state, gd);
  deps.saveDB?.();
  return { state, result, removed: value };
}

async function updateFilterSettings(guild, deps, changes) {
  requireGuild(guild);
  const gd = deps.guildData(guild.id);
  const previous = new Map(Object.keys(changes).map(key => [key, gd[key] === undefined ? undefined : structuredClone(gd[key])]));
  const state = nativeState(deps.guildData, guild.id);
  state.syncEnabled = true;
  Object.assign(gd, changes);
  if (typeof globalThis.syncProtectionPreferenceState === "function") {
    globalThis.syncProtectionPreferenceState(gd, "legacy");
  }
  const parentEnabled = typeof gd.automod?.systemEnabled === "boolean"
    ? gd.automod.systemEnabled
    : gd.automod?.enabled === true;
  if (!parentEnabled) {
    deps.saveDB?.(guild.id);
    return { state, filters: 0, deferred: true };
  }
  try {
    const filters = await syncFilters(guild, deps);
    deps.saveDB?.(guild.id);
    return { state, filters };
  } catch (error) {
    for (const [key, value] of previous) {
      if (value === undefined) delete gd[key];
      else gd[key] = value;
    }
    // Restore any rules already changed before an API failure, then report failure.
    await syncFilters(guild, deps).catch(() => {});
    state.lastError = apiError(error);
    deps.saveDB?.(guild.id);
    throw error;
  }
}

function setWordFilter(guild, deps, filter, options) {
  if (!["badword", "nsfw"].includes(filter)) throw new Error("Unknown word filter.");
  const gd = deps.guildData(guild.id);
  const configKey = filter === "badword" ? "badWordConfig" : "nsfwConfig";
  const enabledKey = filter === "badword" ? "badWordEnabled" : "nsfwProtection";
  const changes = {};
  if (options.enabled !== undefined) changes[enabledKey] = Boolean(options.enabled);
  if (options.action !== undefined) {
    if (!["block", "timeout", "ban", "kick", "warn"].includes(options.action)) throw new Error("Use timeout, kick, ban, warn, or block.");
    changes[configKey] = { ...gd[configKey], action: options.action };
  }
  const next = { ...gd, ...changes };
  if (!gd.nativeAutomod?.syncEnabled && !Object.keys(gd.nativeAutomod?.ruleIds || {}).length && next[configKey]?.action !== "block") {
    Object.assign(gd, changes);
    if (typeof globalThis.syncProtectionPreferenceState === "function") {
      globalThis.syncProtectionPreferenceState(gd, "legacy");
    }
    deps.saveDB?.(guild.id);
    return Promise.resolve({ filters: 0 });
  }
  return updateFilterSettings(guild, deps, changes);
}

function setMentions(guild, deps, options) {
  const gd = deps.guildData(guild.id);
  const config = { ...gd.automod?.antiMassMention };
  if (options.enabled !== undefined) config.enabled = Boolean(options.enabled);
  if (options.limit !== undefined) {
    const limit = Number(options.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Mention limit must be a whole number from 1 to 50.");
    config.maxMentions = limit;
  }
  return updateFilterSettings(guild, deps, { automod: { ...gd.automod, antiMassMention: config } });
}

function setCaps(guild, deps, options) {
  const gd = deps.guildData(guild.id);
  const config = { ...gd.automod?.antiCaps };
  if (options.enabled !== undefined) config.enabled = Boolean(options.enabled);
  if (options.minLength !== undefined) {
    const value = Number(options.minLength);
    if (!Number.isInteger(value) || value < 1 || value > 4000) throw new Error("Minimum caps length must be a whole number from 1 to 4000.");
    config.minLength = value;
  }
  if (options.percentage !== undefined) {
    const value = Number(options.percentage);
    if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error("Caps percentage must be a whole number from 1 to 100.");
    config.percentage = value;
  }
  return updateFilterSettings(guild, deps, { automod: { ...gd.automod, antiCaps: config } });
}

function setMessageLimit(guild, deps, value, channelId = null) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 0 || limit > 4000) throw new Error("Use a whole number from 1 to 4000, or 0 to remove the limit.");
  const security = { ...deps.guildData(guild.id).security };
  if (channelId) {
    security.channelMaxLength = { ...security.channelMaxLength };
    if (limit) security.channelMaxLength[channelId] = limit;
    else delete security.channelMaxLength[channelId];
  } else security.messageLimit = limit;
  return updateFilterSettings(guild, deps, { security });
}

async function listRules(guild, deps) {
  requireGuild(guild);
  const state = nativeState(deps.guildData, guild.id);
  const rules = await guild.autoModerationRules.fetch();
  return { state, rules: [...rules.values()].filter(rule => rule.creatorId === guild.client.user.id && rule.name.startsWith(MANAGED_PREFIX)) };
}

async function setRuleEnabled(guild, deps, ruleId, enabled) {
  requireGuild(guild);
  const gd = deps.guildData(guild.id);
  const parentEnabled = typeof gd.automod?.systemEnabled === "boolean"
    ? gd.automod.systemEnabled
    : gd.automod?.enabled === true;
  if (enabled && !parentEnabled) throw new Error("AutoMod is disabled for this server. Enable the parent system before enabling a managed rule.");
  const state = nativeState(deps.guildData, guild.id);
  const id = String(ruleId || "");
  const rule = await guild.autoModerationRules.fetch(id).catch(() => null);
  if (!rule) {
    for (const [key, value] of Object.entries(state.ruleIds)) if (value === id) delete state.ruleIds[key];
    deps.saveDB?.();
    throw new Error("That managed rule no longer exists in Discord. Its saved reference was removed.");
  }
  if (rule.creatorId !== guild.client.user.id || !rule.name.startsWith(MANAGED_PREFIX)) {
    throw new Error("That rule is not managed by Soezy Native AutoMod. Use `/automod rules` to get a managed rule ID.");
  }
  if (rule.name.startsWith(`${MANAGED_PREFIX} Filter `) || rule.triggerType === AutoModerationRuleTriggerType.MentionSpam) {
    throw new Error("Use the feature's own command or configuration panel to change this rule (antilink, antimention, badword, nsfw, or security).");
  }
  const updated = await rule.edit({ enabled: Boolean(enabled), reason: `Soezy native AutoMod rule ${enabled ? "enabled" : "disabled"}` });
  deps.saveDB?.();
  return updated;
}

async function setManagedRulesEnabled(guild, deps, enabled, filter = null) {
  requireGuild(guild);
  const rules = await guild.autoModerationRules.fetch();
  const managed = [...rules.values()].filter(rule =>
    rule.creatorId === guild.client.user.id &&
    rule.name.startsWith(MANAGED_PREFIX) &&
    (!filter || filter(rule))
  );
  for (const rule of managed) {
    if (rule.enabled !== Boolean(enabled)) {
      await rule.edit({ enabled: Boolean(enabled), reason: `Soezy AutoMod ${enabled ? "enabled" : "disabled"}` });
    }
  }
  deps.saveDB?.(guild.id);
  return managed.length;
}

async function reset(guild, deps) {
  requireGuild(guild);
  const state = nativeState(deps.guildData, guild.id);
  const rules = await guild.autoModerationRules.fetch();
  for (const rule of rules.values()) {
    if (rule.creatorId === guild.client.user.id && rule.name.startsWith(MANAGED_PREFIX)) await rule.delete("Soezy native AutoMod reset");
  }
  state.ruleIds = {};
  state.keywords = [];
  state.alertChannelId = null;
  state.syncEnabled = false;
  state.protections = {};
  deps.saveDB?.();
}

const syncQueues = new Map();
function syncFilters(guild, deps) {
  const previous = syncQueues.get(guild.id) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => reconcileFilters(guild, deps));
  syncQueues.set(guild.id, next);
  next.finally(() => { if (syncQueues.get(guild.id) === next) syncQueues.delete(guild.id); }).catch(() => {});
  return next;
}

async function reconcileFilters(guild, deps) {
  requireGuild(guild);
  const state = nativeState(deps.guildData, guild.id);
  const gd = deps.guildData(guild.id);
  const parentEnabled = typeof gd.automod?.systemEnabled === "boolean"
    ? gd.automod.systemEnabled
    : gd.automod?.enabled === true;
  if (!parentEnabled) {
    const disabled = await setManagedRulesEnabled(guild, deps, false);
    state.warnings = [];
    return disabled;
  }
  await upsertKeywordRule(guild, state, gd);
  const { buildFilterRules } = require("./nativeFilterRules");
  const channels = await guild.channels.fetch();
  let plans = compactCompatibleRegexRules(buildFilterRules(deps.guildData(guild.id), [...channels.values()].filter(channel => channel && !channel.isThread?.()).map(channel => channel.id), deps.words));
  const rules = await guild.autoModerationRules.fetch();
  const prefix = `${MANAGED_PREFIX} Filter `;
  const owned = [...rules.values()].filter(rule => rule.creatorId === guild.client.user.id && rule.name.startsWith(prefix));
  // Reuse our older mention-spam rule rather than trying to occupy the sole slot twice.
  const legacyMentions = [...rules.values()].find(rule => rule.creatorId === guild.client.user.id && rule.name.startsWith(MANAGED_PREFIX) && rule.triggerType === AutoModerationRuleTriggerType.MentionSpam && !owned.includes(rule));
  if (legacyMentions) owned.push(legacyMentions);
  const other = [...rules.values()].filter(rule => !owned.includes(rule));
  const warnings = [];
  for (const [type, max] of [[AutoModerationRuleTriggerType.Keyword, 6], [AutoModerationRuleTriggerType.MentionSpam, 1], [AutoModerationRuleTriggerType.Spam, 1], [AutoModerationRuleTriggerType.KeywordPreset, 1], [AutoModerationRuleTriggerType.MemberProfile, 1]]) {
    if (max === 1 && other.some(rule => rule.triggerType === type) && plans.some(plan => plan.triggerType === type)) {
      const existing = other.find(rule => rule.triggerType === type);
      warnings.push(`${AutoModerationRuleTriggerType[type]} was not changed: an existing server rule (${existing.id}) occupies its only slot. Review it in Server Settings > AutoMod; the other available protections were installed.`);
      plans = plans.filter(plan => plan.triggerType !== type);
    }
    const available = max - other.filter(rule => rule.triggerType === type).length;
    const matchingPlans = plans.filter(plan => plan.triggerType === type);
    if (matchingPlans.length > available) {
      const kept = new Set(matchingPlans.slice(0, Math.max(0, available)));
      const skipped = matchingPlans.filter(plan => !kept.has(plan));
      plans = plans.filter(plan => plan.triggerType !== type || kept.has(plan));
      const labels = skipped.map(plan => plan.name).join(", ");
      warnings.push(`${labels} not installed because all available Discord ${AutoModerationRuleTriggerType[type]} rule slots are in use. Other available AutoMod protections were installed; bot-side detection remains active.`);
    }
  }
  for (const rule of owned) {
    const keepLegacy = rule === legacyMentions && plans.some(plan => plan.triggerType === AutoModerationRuleTriggerType.MentionSpam);
    if (!keepLegacy && !plans.some(plan => `${prefix}${plan.name}` === rule.name)) {
      await rule.delete("Soezy filter disabled or reconfigured");
      for (const [key, id] of Object.entries(state.ruleIds)) if (id === rule.id) delete state.ruleIds[key];
    }
  }
  let installed = 0;
  state.unavailableRules = {};
  for (const plan of plans) {
    const existing = owned.find(rule => rule.name === `${prefix}${plan.name}`) || (plan.triggerType === AutoModerationRuleTriggerType.MentionSpam ? legacyMentions : null);
    const payload = { name: `${prefix}${plan.name}`, eventType: AutoModerationRuleEventType.MessageSend, triggerType: plan.triggerType, triggerMetadata: plan.triggerMetadata, exemptRoles: plan.exemptRoles, exemptChannels: plan.exemptChannels, actions: buildActions(state.alertChannelId), enabled: true, reason: "Sync Soezy filters to Discord blocking rules" };
    if (plan.triggerType === AutoModerationRuleTriggerType.MemberProfile) {
      payload.eventType = AutoModerationRuleEventType.MemberUpdate;
      payload.actions = [{ type: AutoModerationActionType.BlockMemberInteraction }];
    }
    // Deleted channels may remain in saved bypass lists after server changes.
    payload.exemptChannels = payload.exemptChannels.filter(id => channels.has(id));
    let rule;
    try {
      rule = existing ? await existing.edit(payload) : await guild.autoModerationRules.create(payload);
    } catch (error) {
      // Profile blocking is not available to every server/application. Do not
      // roll back supported message protections when this optional rule fails.
      if (plan.triggerType === AutoModerationRuleTriggerType.MemberProfile && [50001, 50013].includes(Number(error.code))) {
        state.unavailableRules[plan.key] = Number(error.code);
        warnings.push("Member Profile protection is unavailable through the bot API. Enable it manually in Server Settings > Safety Setup > AutoMod > Members > Block Words in Member Profile Names. Other AutoMod protections remain active.");
        deps.saveDB?.();
        continue;
      }
      throw error;
    }
    installed++;
    for (const [key, id] of Object.entries(state.ruleIds)) {
      if (id === rule.id && (key.startsWith("filter_") || key === "mentions")) delete state.ruleIds[key];
    }
    for (const key of plan.key.split("+")) state.ruleIds[`filter_${key}`] = rule.id;
    deps.saveDB?.();
  }
  delete state.lastError;
  state.warnings = warnings;
  deps.saveDB?.();
  return installed;
}

function compactCompatibleRegexRules(plans) {
  const groups = new Map();
  for (const plan of plans) {
    if (plan.triggerType !== AutoModerationRuleTriggerType.Keyword || !Array.isArray(plan.triggerMetadata?.regexPatterns)) continue;
    const roles = [...(plan.exemptRoles || [])].sort();
    const channels = [...(plan.exemptChannels || [])].sort();
    const signature = JSON.stringify([roles, channels]);
    const group = groups.get(signature) || [];
    group.push(plan);
    groups.set(signature, group);
  }

  const replacements = new Map();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const patterns = [...new Set(group.flatMap(plan => plan.triggerMetadata.regexPatterns))];
    if (patterns.length > 10) continue;
    const keys = group.map(plan => plan.key).sort();
    const combined = {
      ...group[0],
      key: keys.join("+"),
      name: keys.includes("automod-invites") && keys.includes("automod-links")
        ? "AutoMod Links and Invites"
        : `AutoMod Regex Group ${keys[0]}`,
      triggerMetadata: { regexPatterns: patterns },
    };
    replacements.set(group[0], combined);
    for (const plan of group.slice(1)) replacements.set(plan, null);
  }
  return plans.map(plan => replacements.has(plan) ? replacements.get(plan) : plan).filter(Boolean);
}

module.exports = { setup, setupAll, addKeyword, removeKeyword, setWordFilter, setMentions, setCaps, setMessageLimit, listRules, setRuleEnabled, setManagedRulesEnabled, reset, syncFilters, apiError, compactCompatibleRegexRules, MANAGED_PREFIX };
