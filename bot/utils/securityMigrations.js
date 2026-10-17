"use strict";

function unique(...lists) {
  return [...new Set(lists.flatMap(values => Array.isArray(values) ? values : []).map(value => String(value || "").trim()).filter(Boolean))];
}

function migrateAntiLinkToAutoMod(guild, guildSystems = null) {
  if (!guild || typeof guild !== "object") return false;
  const legacy = guild.antilink && typeof guild.antilink === "object" ? guild.antilink : {};
  const automod = guild.automod && typeof guild.automod === "object" ? guild.automod : (guild.automod = {});
  const current = automod.antiLink && typeof automod.antiLink === "object" ? automod.antiLink : {};
  const savedFeatureFlag = guildSystems?.antilink ?? guild.features?.antilink;
  const enabled = typeof current.enabled === "boolean"
    ? current.enabled
    : typeof savedFeatureFlag === "boolean"
      ? savedFeatureFlag
      : legacy.enabled === true;

  const migrated = {
    ...legacy,
    ...current,
    enabled,
    allowedDomains: unique(current.allowedDomains, current.whitelistDomains, current.whitelist, legacy.allowedDomains, legacy.whitelist),
    whitelistUsers: unique(current.whitelistUsers, current.immuneUsers, legacy.whitelistUsers, legacy.immuneUsers),
    whitelistRoles: unique(current.whitelistRoles, current.immuneRoles, legacy.whitelistRoles, legacy.immuneRoles),
    whitelistChannels: unique(current.whitelistChannels, current.immuneChannels, legacy.whitelistChannels, legacy.immuneChannels),
  };
  automod.antiLink = migrated;

  const verified =
    automod.antiLink.enabled === enabled &&
    ["allowedDomains", "whitelistUsers", "whitelistRoles", "whitelistChannels"].every(key =>
      JSON.stringify(automod.antiLink[key]) === JSON.stringify(unique(
        current[key], key === "allowedDomains" ? current.whitelistDomains : null,
        key === "allowedDomains" ? current.whitelist : null,
        legacy[key], key === "allowedDomains" ? legacy.whitelist : null,
        key === "whitelistUsers" ? current.immuneUsers : null,
        key === "whitelistUsers" ? legacy.immuneUsers : null,
        key === "whitelistRoles" ? current.immuneRoles : null,
        key === "whitelistRoles" ? legacy.immuneRoles : null,
        key === "whitelistChannels" ? current.immuneChannels : null,
        key === "whitelistChannels" ? legacy.immuneChannels : null,
      )));
  if (!verified) return false;

  delete guild.antilink;
  if (guild.features) delete guild.features.antilink;
  if (guildSystems) delete guildSystems.antilink;
  return true;
}

function migrateMuteEvasionToAntiNuke(guild, guildSystems = null) {
  if (!guild || typeof guild !== "object") return false;
  const legacy = guild.muteEvasion && typeof guild.muteEvasion === "object" ? guild.muteEvasion : {};
  const antinuke = guild.antinuke && typeof guild.antinuke === "object" ? guild.antinuke : (guild.antinuke = {});
  const current = antinuke.muteEvasion && typeof antinuke.muteEvasion === "object" ? antinuke.muteEvasion : {};
  const savedFeatureFlag = guildSystems?.muteevasion ?? guild.features?.muteevasion;
  const enabled = typeof current.enabled === "boolean"
    ? current.enabled
    : typeof savedFeatureFlag === "boolean"
      ? savedFeatureFlag
      : legacy.enabled === true;
  const mutedUsers = {
    ...(legacy.mutedUsers && typeof legacy.mutedUsers === "object" ? legacy.mutedUsers : {}),
    ...(current.mutedUsers && typeof current.mutedUsers === "object" ? current.mutedUsers : {}),
  };
  antinuke.muteEvasion = {
    ...legacy,
    ...current,
    enabled,
    logs: current.logs ?? legacy.logs ?? null,
    mutedUsers,
  };
  const verified = antinuke.muteEvasion.enabled === enabled &&
    antinuke.muteEvasion.logs === (current.logs ?? legacy.logs ?? null) &&
    Object.keys(mutedUsers).every(id => antinuke.muteEvasion.mutedUsers[id] === mutedUsers[id]);
  if (!verified) return false;

  delete guild.muteEvasion;
  if (guild.features) delete guild.features.muteevasion;
  if (guildSystems) delete guildSystems.muteevasion;
  return true;
}

module.exports = { migrateAntiLinkToAutoMod, migrateMuteEvasionToAntiNuke };
