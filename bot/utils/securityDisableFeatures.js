"use strict";

function disableFeatureEntries(root) {
  for (const feature of Object.values(root?.features || {})) {
    if (feature && typeof feature === "object" && !Array.isArray(feature)) feature.enabled = false;
  }
}

function disableLinkedState(guild, systems, key) {
  if (guild.features && key in guild.features) guild.features[key] = false;
  if (systems && key in systems) systems[key] = false;
}

function disableAntiNukeFeatures(guild, eventIds = [], systems) {
  const an = guild.antinuke ||= {};
  an.events ||= {};
  for (const key of new Set([...eventIds, ...Object.keys(an.events), ...Object.keys(an.features || {})])) {
    an.events[key] = false;
  }
  disableFeatureEntries(an);
  if (guild.antiRaid) guild.antiRaid.enabled = false;
  if (guild.security?.antiraid) guild.security.antiraid.enabled = false;
  if (an.muteEvasion) an.muteEvasion.enabled = false;
  if (guild.muteEvasion) guild.muteEvasion.enabled = false;
  disableLinkedState(guild, systems, "antiraid");
  disableLinkedState(guild, systems, "muteevasion");
}

function disableAutoModFeatures(guild, systems) {
  const am = guild.automod ||= {};
  disableFeatureEntries(am);
  for (const key of ["antiSpam", "antiMassMention", "antiCaps", "antiInvite", "antiLink"]) {
    if (am[key]) am[key].enabled = false;
  }
  for (const feature of Object.values(am.advanced || {})) {
    if (feature && typeof feature === "object" && typeof feature.enabled === "boolean") feature.enabled = false;
  }
  for (const key of ["antibot", "antilink", "accountAge"]) {
    if (guild[key]) guild[key].enabled = false;
  }
  guild.badWordEnabled = false;
  guild.nsfwProtection = false;
  const security = guild.security ||= {};
  for (const key of ["antiPhishing", "antiCaps", "antiZalgo", "antiDuplicate", "antiEveryoneBP", "webhookGuard"]) {
    if (typeof security[key] === "boolean") security[key] = false;
  }
  if (Number(security.accountAgeDays) > 0) security.savedAccountAgeDays = security.accountAgeDays;
  security.accountAgeDays = 0;
  security.messageLengthEnabled = false;
  for (const key of ["antibot", "antilink", "accountage"]) disableLinkedState(guild, systems, key);
  const native = guild.nativeAutomod?.protections;
  if (native) for (const key of Object.keys(native)) if (typeof native[key] === "boolean") native[key] = false;
  if (guild.nativeAutomod) guild.nativeAutomod.keywordsEnabled = false;
}

function disableWallFeatures(guild) {
  disableFeatureEntries(guild.wallSystem);
  if (guild.autoJail) guild.autoJail.enabled = false;
}

module.exports = { disableAntiNukeFeatures, disableAutoModFeatures, disableWallFeatures };
