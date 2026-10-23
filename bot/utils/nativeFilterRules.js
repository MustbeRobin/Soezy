"use strict";

const { AutoModerationRuleTriggerType: Trigger } = require("discord.js");
const { DEFAULT_SCAM_PHRASES } = require("../handlers/automod/scamFilter");
const unique = (...lists) => [...new Set(lists.flatMap(list => Array.isArray(list) ? list : []))];

function lengthPattern(limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 4000) throw new Error("Message limit must be a whole number from 1 to 4000 (0 disables it).");
  return `(?s)^.{${limit + 1},}$`;
}

function capsPattern(minLength = 10, percentage = 70) {
  const min = Math.max(1, Math.min(4000, Number(minLength) || 10));
  const threshold = Math.max(1, Math.min(100, Number(percentage) || 70));
  const uppercaseCount = Math.ceil(min * threshold / 100);
  return `(?-i)(?:[^a-z]*[A-Z]){${uppercaseCount},}`;
}

function buildFilterRules(gd, channels, words = {}) {
  const sec = gd.security || {};
  const am = gd.automod || {};
  const systemEnabled = typeof am.systemEnabled === "boolean" ? am.systemEnabled : am.enabled === true;
  if (!systemEnabled) return [];
  const featureEnabled = (key, legacyValue) => typeof am.features?.[key]?.enabled === "boolean"
    ? am.features[key].enabled
    : legacyValue === true;
  const punishment = (key, ...legacyConfigs) => am.punishments?.[key]
    || legacyConfigs.find(config => config?.action)?.action
    || am.punishment;
  const filterRoles = unique(gd.automodWhitelistRoles, gd.automodImmuneRoles, am.whitelistRoles);
  const filterChannels = unique(gd.automodWhitelistChannels, gd.automodImmuneChannels, am.whitelistChannels, am.immuneChannels);
  const exemptions = feature => unique(filterChannels, feature?.whitelistChannels, feature?.immuneChannels);
  const protections = gd.nativeAutomod?.protections || {};
  const blockBadWords = featureEnabled("badWords", gd.badWordEnabled)
    && words.badWordEnabled !== false
    && punishment("badwords", gd.badWordConfig) === "block";
  const blockNsfw = featureEnabled("nsfw", gd.nsfwProtection)
    && punishment("nsfw", gd.nsfwConfig) === "block";
  const badWordRoles = unique(filterRoles, gd.badWordWhitelistRoles, gd.badWordImmuneRoles);
  const badWordChannels = unique(gd.badWordWhitelistChannels, gd.badWordImmuneChannels);
  const nsfwRoles = unique(filterRoles, gd.nsfwWhitelistRoles, gd.nsfwImmuneRoles);
  const nsfwChannels = unique(gd.nsfwWhitelistChannels, gd.nsfwImmuneChannels);
  const wordRoles = unique(blockBadWords ? badWordRoles : [], blockNsfw ? nsfwRoles : []);
  const wordChannels = unique(blockBadWords ? badWordChannels : [], blockNsfw ? nsfwChannels : []);
  const rules = [];
  const commonRoles = unique(gd.whitelistRoles, gd.immuneRoles, sec.whitelistRoles, sec.immuneRoles);
  const commonChannels = unique(gd.whitelistChannels, gd.immuneChannels, sec.whitelistChannels, sec.immuneChannels);
  function add(key, name, metadata, roles = [], exemptChannels = [], triggerType = Trigger.Keyword) {
    const exemptRoles = unique(commonRoles, roles);
    exemptChannels = unique(commonChannels, exemptChannels);
    if (exemptRoles.length > 20 || exemptChannels.length > 50) throw new Error(`${name}: Discord allows at most 20 exempt roles and 50 exempt channels.`);
    rules.push({ key, name, triggerType, triggerMetadata: metadata, exemptRoles, exemptChannels });
  }
  function wordRule(key, name, values, roles, exemptChannels, substring = false) {
    const keywords = unique(values).map(String).filter(Boolean).map(word => substring ? `*${word}*` : word);
    if (keywords.some(word => word.length > 60) || keywords.length > 1000) throw new Error(`${name}: Discord allows 1000 keywords, each at most 60 characters. Shorten the word list before syncing.`);
    if (keywords.length) add(key, name, { keywordFilter: keywords }, roles, exemptChannels);
  }
  // Discord exposes a single Spam trigger slot. Use it for both native spam
  // and duplicate blocking, and persist both feature keys against that rule.
  const spamEnabled = featureEnabled("antiSpam", am.antiSpam?.enabled);
  const duplicateEnabled = featureEnabled("duplicate", am.advanced?.duplicate?.enabled);
  if (spamEnabled || duplicateEnabled) {
    const spamRoles = unique(filterRoles, am.antiSpam?.whitelistRoles, am.advanced?.duplicate?.whitelistRoles);
    const spamChannels = unique(
      filterChannels,
      am.antiSpam?.whitelistChannels,
      am.antiSpam?.immuneChannels,
      am.advanced?.duplicate?.whitelistChannels,
      am.advanced?.duplicate?.immuneChannels
    );
    const key = spamEnabled && duplicateEnabled ? "spam+duplicate" : spamEnabled ? "spam" : "duplicate";
    const name = spamEnabled && duplicateEnabled ? "Spam and Duplicate Messages" : spamEnabled ? "Discord Spam" : "Duplicate Messages";
    add(key, name, undefined, spamRoles, spamChannels, Trigger.Spam);
  }
  // Presets and profile keywords must not preempt the configured timeout/ban handlers.
  const presets = [blockBadWords && 1, blockNsfw && 2, blockBadWords && 3].filter(Boolean);
  if (protections.presets && presets.length) add("presets", "Discord Word Presets", { presets }, wordRoles, wordChannels, Trigger.KeywordPreset);
  if (featureEnabled("antiCaps", am.antiCaps?.enabled)) {
    add("caps", "Anti-Caps", { regexPatterns: [capsPattern(am.antiCaps.minLength ?? sec.antiCapsMinLen, am.antiCaps.percentage ?? sec.antiCapsThresh)] }, filterRoles, exemptions(am.antiCaps));
  }
  if (featureEnabled("antiZalgo", sec.antiZalgo)) {
    add("zalgo", "Anti-Zalgo", { regexPatterns: ["\\p{M}{3,}"] }, filterRoles, commonChannels);
  }
  if (featureEnabled("antiEveryoneBP", sec.antiEveryoneBP)) {
    add("everyone", "Everyone and Here", { regexPatterns: ["@[\\p{Cf}\\p{Zs}\\u180e]*(?:every\\s*one|here)\\b"] }, filterRoles, exemptions(am.antiMassMention));
  }
  if (featureEnabled("scams", am.advanced?.scams?.enabled)
    && punishment("scams", am.scams, am.advanced?.scams) === "block") {
    const phrases = unique(am.scams?.phrases || DEFAULT_SCAM_PHRASES).map(String).filter(Boolean);
    wordRule("scam-phrases", "Scam Phrases", phrases, filterRoles, exemptions(am.scams));
  }
  if (protections.profiles) {
    const keywords = unique(blockBadWords ? unique(words.badWords, gd.customBadWords) : [], blockNsfw ? unique(words.nsfwWords, gd.customNsfwWords) : []).map(String).filter(Boolean);
    if (keywords.length > 1000 || keywords.some(word => word.length > 60)) throw new Error("Profile keyword list exceeds Discord's limits.");
    if (keywords.length) add("profiles", "Member Profiles", { keywordFilter: keywords }, wordRoles, wordChannels, Trigger.MemberProfile);
  }
  if (blockBadWords) wordRule("badwords", "Bad Words", unique(words.badWords, gd.customBadWords), badWordRoles, badWordChannels);
  if (blockNsfw) wordRule("nsfw", "NSFW Words", unique(words.nsfwWords, gd.customNsfwWords), nsfwRoles, nsfwChannels, true);
  // Anti-Link is domain-aware and enforced by the shared AutoMod message handler.
  // Discord-native message-wide allow-lists cannot preserve per-domain exceptions safely.
  if (featureEnabled("antiMassMention", am.antiMassMention?.enabled)) {
    const limit = Number(am.antiMassMention.maxMentions ?? 5);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Anti-Mention limit must be between 1 and 50.");
    add("mentions", "Anti-Mention", { mentionTotalLimit: limit }, unique(gd.automodWhitelistRoles, gd.automodImmuneRoles, am.whitelistRoles), unique(gd.automodWhitelistChannels, gd.automodImmuneChannels, am.whitelistChannels, am.immuneChannels, am.antiMassMention.whitelistChannels, am.antiMassMention.immuneChannels), Trigger.MentionSpam);
  }
  if ((featureEnabled("antiInvite", am.antiInvite?.enabled) || featureEnabled("invite", am.advanced?.invite?.enabled))
    && punishment("invite", am.antiInvite, am.advanced?.invite) === "block") {
    add("automod-invites", "AutoMod Discord Invites", { regexPatterns: ["(?i)(discord\\.gg/|discord(?:app)?\\.com/invite/)"] }, filterRoles, exemptions(am.antiInvite));
  }
  // A native allow-list skips the entire message, so preserve domain-aware
  // exceptions in the bot handler instead of weakening their semantics.
  if (featureEnabled("antiLink", am.antiLink?.enabled)
    && punishment("antilink", am.antiLink, gd.antilink) === "block"
    && !am.antiLink.allowedDomains?.length
    && !am.antiLink.whitelistUsers?.length) {
    add("automod-links", "AutoMod Links", { regexPatterns: ["(?i)(https?://|www\\.)[^\\s<>()]+|\\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,63}(?:/[^\\s<>()]*)?"] }, unique(filterRoles, am.antiLink.whitelistRoles), exemptions(am.antiLink));
  }
  const channelLimits = sec.messageLengthEnabled === false ? [] : Object.entries(sec.channelMaxLength || {}).filter(([, limit]) => Number(limit) > 0);
  if (sec.messageLengthEnabled !== false && Number(sec.messageLimit) > 0) add("length", "Message Length", { regexPatterns: [lengthPattern(Number(sec.messageLimit))] }, [], channelLimits.map(([id]) => id));
  const groups = new Map();
  for (const [id, limit] of channelLimits) {
    const group = groups.get(Number(limit)) || [];
    group.push(id);
    groups.set(Number(limit), group);
  }
  for (const [limit, ids] of groups) add(`length${limit}`, `Message Length ${limit}`, { regexPatterns: [lengthPattern(limit)] }, [], channels.filter(id => !ids.includes(id)));
  return rules;
}

module.exports = { buildFilterRules, lengthPattern, capsPattern };
