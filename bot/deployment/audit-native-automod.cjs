require("dotenv").config();

const { Client } = require("discord.js");
const { connectRedis, closeRedis, getRedisConfig } = require("../utils/redis");
const { decode } = require("../utils/redisDatabase");

async function main() {
  const guildId = String(process.argv[2] || "1364922776007479306");
  const memberQuery = String(process.argv[3] || "").trim();
  const redis = await connectRedis();
  const db = decode(await redis.hGetAll(`${getRedisConfig().keyPrefix}:data`));
  const data = db.guilds?.[guildId] || {};
  const client = new Client({ intents: [] });

  try {
    client.rest.setToken(require("../config.json").token);
    client.user = { id: "1456175060128632996" };
    const guild = await client.guilds.fetch(guildId);
    await guild.roles.fetch();
    const members = memberQuery ? await guild.members.search({ query: memberQuery, limit: 10 }) : null;
    const rules = await guild.autoModerationRules.fetch();
    const owned = [...rules.values()].filter(rule => rule.creatorId === client.user.id);
    console.log(JSON.stringify({
      guildId,
      guildOwnerId: guild.ownerId,
      config: {
        automodEnabled: data.automod?.enabled,
        punishment: data.automod?.punishment,
        punishments: data.automod?.punishments,
        antiSpam: data.automod?.antiSpam?.enabled,
        antiCaps: data.automod?.antiCaps?.enabled,
        duplicate: data.automod?.advanced?.duplicate?.enabled,
        nativeSyncEnabled: data.nativeAutomod?.syncEnabled,
        nativeRuleIds: data.nativeAutomod?.ruleIds,
        nativeWarnings: data.nativeAutomod?.warnings,
        nativeLastError: data.nativeAutomod?.lastError,
      },
      rules: [...rules.values()].map(rule => ({
        id: rule.id,
        name: rule.name,
        triggerType: rule.triggerType,
        enabled: rule.enabled,
        actionTypes: rule.actions.map(action => action.type),
        exemptRoleIds: [...rule.exemptRoles.keys()],
        exemptRoleNames: [...rule.exemptRoles.keys()].map(id => guild.roles.cache.get(id)?.name || "deleted role"),
        exemptChannelCount: rule.exemptChannels.size,
        creator: rule.creatorId === client.user.id ? "Soezy" : "external",
      })).filter(rule => rule.creator === "Soezy" || /spam/i.test(rule.name)),
      ownedRuleCount: owned.length,
      matchingMembers: members ? [...members.values()].map(member => ({
        id: member.id,
        username: member.user.username,
        roles: member.roles.cache.filter(role => role.id !== guild.id).map(role => role.name),
        isOwner: member.id === guild.ownerId,
        hasAdministrator: member.permissions.has("Administrator"),
        hasManageGuild: member.permissions.has("ManageGuild"),
      })) : undefined,
    }, null, 2));
  } finally {
    client.destroy();
    await closeRedis();
  }
}

main().catch(async error => {
  console.error(JSON.stringify({ code: error.code, message: error.message }));
  await closeRedis().catch(() => {});
  process.exitCode = 1;
});
