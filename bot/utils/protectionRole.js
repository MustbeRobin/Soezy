"use strict";

const { PermissionsBitField } = require("discord.js");
const roleMap = require("./featureRoleMap");
const jobs = new Map();

function ensureProtectionRole(guild, feature, deps = {}) {
  const key = roleMap.normalizeFeatureKey(feature);
  if (!guild?.id || !key || !roleMap.getRoleNameTemplate(key)) throw new Error("Unknown protection role.");
  const jobKey = `${guild.id}:${key}`;
  if (jobs.has(jobKey)) return jobs.get(jobKey);
  const job = provision(guild, key, deps).finally(() => jobs.delete(jobKey));
  jobs.set(jobKey, job);
  return job;
}

function roleClaimedByAnotherFeature(data, feature, roleId) {
  const store = roleMap.ensureFeatureRoleStore(data) || {};
  for (const [other, savedId] of Object.entries(store)) {
    if (other !== feature && String(savedId || "") === String(roleId)) return true;
  }
  return false;
}

async function fetchRole(guild, roleId) {
  if (!roleId) return null;
  const cached = guild.roles.cache.get(roleId);
  if (cached) return cached;
  return guild.roles.fetch(roleId).catch(error => {
    if (error?.code === 10011) return null;
    throw error;
  });
}

async function provision(guild, feature, deps) {
  const getGuildData = deps.guildData || globalThis.guildData;
  const saveDB = deps.saveDB || globalThis.saveDB;
  if (typeof getGuildData !== "function" || typeof saveDB !== "function") throw new Error("Protection role storage is unavailable.");

  const data = getGuildData(guild.id);
  const featureState = feature === "wall" ? (data.wallSystem ||= {}) : (data[feature] ||= {});
  let createdRole = false;
  const savedId = roleMap.getSavedRoleId(data, feature) || roleMap.resolveLegacyRoleId(data, feature);
  let role = savedId && !roleClaimedByAnotherFeature(data, feature, savedId)
    ? await fetchRole(guild, savedId)
    : null;

  const name = roleMap.getRoleNameTemplate(feature);
  if (!role) {
    const allRoles = guild.roles.cache.size ? guild.roles.cache : await guild.roles.fetch();
    role = [...allRoles.values()].find(candidate =>
      candidate.name === name && !roleClaimedByAnotherFeature(data, feature, candidate.id)
    ) || null;
  }

  if (!role) {
    const me = guild.members.me || await guild.members.fetchMe();
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
      throw new Error(`I need Manage Roles permission to create the ${name} whitelist role.`);
    }
    try {
      role = await guild.roles.create({
        name,
        permissions: [],
        reason: `${feature} whitelist role automatic setup`,
      });
      createdRole = true;
    } catch (error) {
      if ([50013, 50001].includes(error?.code)) {
        throw new Error(`I cannot create the ${name} role. Check Manage Roles and place my highest role above the new role.`);
      }
      throw error;
    }
  }

  roleMap.setFeatureRoleId(data, feature, role.id);
  if (feature === "wall") {
    featureState.immuneRoleId = role.id;
    if (createdRole) {
      featureState.createdWhitelistRoleId = role.id;
      featureState.createdByBot ||= {};
      featureState.createdByBot.whitelistRoleId = role.id;
    }
  } else if (feature === "antiraid") {
    data.security ||= {};
    data.security.antiraid ||= {};
    data.security.antiraid.whitelistRoleId = role.id;
    data.antiRaid ||= {};
    data.antiRaid.whitelistRoleId = role.id;
  }
  saveDB(guild.id);
  return role;
}

module.exports = { ensureProtectionRole, roleClaimedByAnotherFeature };
