/* ================= CENTRAL WALL MANAGER =================
 * Keeps quarantine records, strikes, stats, and role restore behavior in one
 * place so prefix commands, events, and panels do not calculate different
 * answers for the same user.
 */

if (!globalThis.__soezyWallRuntime) {
  globalThis.__soezyWallRuntime = {
    syncedAt: 0,
  };
}

function normalizeWallId(value) {
  const id = String(value || "").replace(/[<@!&>#]/g, "").trim();
  return /^\d{17,20}$/.test(id) ? id : null;
}

function wallTodayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

function ensureWallState(guildId) {
  const gId = normalizeWallId(guildId);
  if (!gId) return null;
  const gd = guildData(gId);
  if (!gd.wallSystem || typeof gd.wallSystem !== "object" || Array.isArray(gd.wallSystem)) gd.wallSystem = {};
  if (!gd.wall || typeof gd.wall !== "object" || Array.isArray(gd.wall)) gd.wall = {};
  const ws = gd.wallSystem;

  const systemEnabled = typeof ws.systemEnabled === "boolean" ? ws.systemEnabled : ws.enabled === true;
  ws.systemEnabled = ws.enabled = systemEnabled;
  if (!ws.quarantined || typeof ws.quarantined !== "object" || Array.isArray(ws.quarantined)) ws.quarantined = {};
  if (!ws.quarantined[gId] || typeof ws.quarantined[gId] !== "object" || Array.isArray(ws.quarantined[gId])) ws.quarantined[gId] = {};

  // Migrate legacy records saved directly under wallSystem.quarantined[userId].
  for (const [key, value] of Object.entries({ ...ws.quarantined })) {
    if (key === gId || !normalizeWallId(key) || !value || typeof value !== "object" || Array.isArray(value)) continue;
    ws.quarantined[gId][key] = { ...value, migratedAt: value.migratedAt || Date.now() };
    delete ws.quarantined[key];
  }

  if (!ws.strikes || typeof ws.strikes !== "object" || Array.isArray(ws.strikes)) ws.strikes = {};
  if (!ws.leaderboard || typeof ws.leaderboard !== "object" || Array.isArray(ws.leaderboard)) ws.leaderboard = {};
  if (!ws.stats || typeof ws.stats !== "object" || Array.isArray(ws.stats)) ws.stats = {};
  if (!Array.isArray(ws.whitelist)) ws.whitelist = [];
  if (!Array.isArray(ws.extraOwners)) ws.extraOwners = [];
  ws.extraOwners = [...new Set(ws.extraOwners.map(normalizeWallId).filter(Boolean))];
  if (!Array.isArray(ws.immuneRoleIds)) ws.immuneRoleIds = [];
  if (ws.immuneRoleId && !ws.immuneRoleIds.includes(ws.immuneRoleId)) ws.immuneRoleIds.unshift(ws.immuneRoleId);
  ws.immuneRoleIds = [...new Set(ws.immuneRoleIds.map(normalizeWallId).filter(Boolean))];
  ws.immuneRoleId = ws.immuneRoleIds[0] || ws.immuneRoleId || null;
  if (!Array.isArray(ws.restoreRoleIds)) ws.restoreRoleIds = ws.restoreRoleId ? [ws.restoreRoleId] : [];
  ws.restoreRoleIds = [...new Set(ws.restoreRoleIds.map(normalizeWallId).filter(Boolean))];
  ws.restoreRoleId = ws.restoreRoleIds[0] || ws.restoreRoleId || null;
  if (!Number.isFinite(Number(ws.strikeLimit)) || Number(ws.strikeLimit) < 1) ws.strikeLimit = 3;
  if (!Number.isFinite(Number(ws.strikeWindowMs)) || Number(ws.strikeWindowMs) < 60000) ws.strikeWindowMs = 24 * 60 * 60 * 1000;
  if (ws.roleId === undefined) ws.roleId = ws.quarantineRoleId || null;
  if (ws.channelId === undefined) ws.channelId = ws.jailChannelId || null;
  if (ws.createdRoleId === undefined) ws.createdRoleId = null;
  if (ws.createdChannelId === undefined) ws.createdChannelId = null;
  if (ws.createdWhitelistRoleId === undefined) ws.createdWhitelistRoleId = null;
  if (!ws.createdByBot || typeof ws.createdByBot !== "object" || Array.isArray(ws.createdByBot)) ws.createdByBot = {};
  ws.roleId = normalizeWallId(ws.roleId || ws.quarantineRoleId) || null;
  ws.channelId = normalizeWallId(ws.channelId || ws.jailChannelId) || null;
  gd.wall.roleId = ws.roleId;
  gd.wall.channelId = ws.channelId;
  gd.wall.enabled = ws.enabled;

  ws.stats.activeQuarantines = Object.keys(ws.quarantined[gId]).length;
  ws.stats.lastUpdated = Date.now();
  return ws;
}

function wallSaveAndSync(guildId, reason = "wall_update") {
  try { if (typeof saveDB === "function") saveDB(); } catch {}
  try { if (typeof refreshGuildConfig === "function") refreshGuildConfig(String(guildId), reason); } catch {}
  try { if (typeof syncRuntimeState === "function") syncRuntimeState(String(guildId), reason); } catch {}
  try { if (typeof refreshPanelState === "function") refreshPanelState(String(guildId)); } catch {}
  globalThis.__soezyWallRuntime.syncedAt = Date.now();
}

function wallStrikeLimit(guildId) {
  const ws = ensureWallState(guildId);
  return Math.max(1, Number(ws?.strikeLimit || ws?.maxStrikes || ws?.bypassStrikeLimit || 3));
}

function wallStrikeWindowMs(guildId) {
  const ws = ensureWallState(guildId);
  return Math.max(60000, Number(ws?.strikeWindowMs || 24 * 60 * 60 * 1000));
}

function wallRoleIsBotCreated(ws, roleId, kind = "role") {
  const id = normalizeWallId(roleId);
  if (!id || !ws) return false;
  const createdKey = kind === "whitelist" ? "createdWhitelistRoleId" : "createdRoleId";
  return ws[createdKey] === id || ws.createdByBot?.[kind === "whitelist" ? "whitelistRoleId" : "roleId"] === id;
}

function wallChannelIsBotCreated(ws, channelId) {
  const id = normalizeWallId(channelId);
  if (!id || !ws) return false;
  return ws.createdChannelId === id || ws.createdByBot?.channelId === id;
}

const WALL_DANGEROUS_PERMISSION_BITS =
  8n | 32n | 268435456n | 16n | 4n | 2n | 536870912n |
  131072n | 134217728n | 1099511627776n;
const wallChannelEnforcementLocks = new Set();

async function wallGuardRolePermissions(oldRole, newRole, options = {}) {
  const guild = newRole?.guild;
  if (!guild || !ensureWallState(guild.id)?.enabled) return false;
  const oldBits = BigInt(oldRole?.permissions?.bitfield || 0);
  const newBits = BigInt(newRole.permissions.bitfield);
  const newlyGrantedDangerous = newBits & WALL_DANGEROUS_PERMISSION_BITS & ~oldBits;
  if (!newlyGrantedDangerous) return false;

  let executorId = null;
  try {
    const auditType = options.auditType || AuditLogEvent.RoleUpdate;
    const logs = await guild.fetchAuditLogs({ type: auditType, limit: 5 });
    const entry = logs.entries.find(item => {
      const age = Date.now() - Number(item.createdTimestamp);
      return item.target?.id === newRole.id &&
        (auditType === AuditLogEvent.RoleCreate || item.changes?.some(change => change.key === "permissions")) &&
        Number.isFinite(Number(item.createdTimestamp)) &&
        age >= 0 && age < 15000;
    });
    executorId = entry?.executor?.id || null;
  } catch (error) {
    console.warn(`[WALL] Could not identify role permission editor guild=${guild.id} role=${newRole.id}: ${error.message}`);
  }

  if (executorId === guild.ownerId || executorId === guild.client?.user?.id) return false;
  if (executorId && typeof isWallWhitelisted === "function") {
    const executor = await guild.members.fetch(executorId).catch(() => null);
    if (executor && isWallWhitelisted(executor, guild.id)) return false;
  }

  const safeBits = newBits & ~newlyGrantedDangerous;
  if (!newRole.editable || newRole.managed) {
    throw new Error(`Cannot remove newly granted dangerous permissions from role ${newRole.id}: the role is managed or above the bot.`);
  }
  await newRole.edit({ permissions: safeBits, reason: "Wall System: remove untrusted dangerous role permissions" });
  return true;
}

async function wallEnforceQuarantineChannelAccess(channel, memberIds = null) {
  const guild = channel?.guild;
  if (!guild || channel.isThread?.()) return false;
  const ws = ensureWallState(guild.id);
  if (!ws?.enabled) return false;
  const roleId = normalizeWallId(ws.quarantineRoleId || ws.roleId);
  if (!roleId || channel.id === ws.jailChannelId || channel.id === ws.appealVoiceChannelId) return false;
  const role = guild.roles.cache.get(roleId);
  if (!role || !channel.permissionOverwrites?.edit) return false;
  const lockKey = `${guild.id}:${channel.id}`;
  if (wallChannelEnforcementLocks.has(lockKey)) return false;
  wallChannelEnforcementLocks.add(lockKey);
  try {
    let changed = false;
    const overwrite = channel.permissionOverwrites.cache.get(roleId);
    if (!overwrite?.deny?.has(PermissionsBitField.Flags.ViewChannel)) {
      await channel.permissionOverwrites.edit(role, { ViewChannel: false }, { reason: "Wall System quarantine channel lockdown" });
      changed = true;
    }

    const records = ws.quarantined?.[guild.id] || {};
    const targets = memberIds ? memberIds.map(String) : Object.keys(records);
    for (const memberId of targets) {
      const entry = records[memberId];
      if (!entry || ws.appeals?.[memberId]?.channelId === channel.id) continue;
      const memberOverwrite = channel.permissionOverwrites.cache.get(memberId);
      if (memberOverwrite?.deny?.has(PermissionsBitField.Flags.ViewChannel)) continue;
      const member = guild.members?.cache?.get(memberId);
      const explicitlyAllowed = memberOverwrite?.allow?.has(PermissionsBitField.Flags.ViewChannel) === true;
      let canViewFromRoles = false;
      if (member?.permissionsIn) {
        try { canViewFromRoles = member.permissionsIn(channel).has(PermissionsBitField.Flags.ViewChannel); }
        catch (error) { console.warn(`[WALL] Could not resolve quarantine permissions guild=${guild.id} member=${memberId} channel=${channel.id}: ${error.message}`); }
      }
      if (!explicitlyAllowed && !canViewFromRoles) continue;

      entry.wallViewChannelAccessRestores ||= {};
      if (entry.wallViewChannelAccessRestores[channel.id] === undefined) {
        entry.wallViewChannelAccessRestores[channel.id] = explicitlyAllowed ? "allow" : "inherit";
      }
      await channel.permissionOverwrites.edit(memberId, { ViewChannel: false }, { reason: "Wall System quarantine channel lockdown" });
      changed = true;
    }
    if (changed && typeof saveDB === "function") saveDB();
    return changed;
  } finally {
    wallChannelEnforcementLocks.delete(lockKey);
  }
}

async function wallEnforceQuarantinedMemberAccess(guild, memberId, member = null) {
  const errors = [];
  if (member && typeof guild?.members?.cache?.set === "function") guild.members.cache.set(memberId, member);
  for (const channel of guild?.channels?.cache?.values?.() || []) {
    try { await wallEnforceQuarantineChannelAccess(channel, [memberId]); }
    catch (error) { errors.push({ channelId: channel.id, error }); }
  }
  return errors;
}

async function wallRestoreMemberChannelAccess(guild, memberId, entry) {
  const restores = entry.wallViewChannelAccessRestores || {};
  const restoreEntries = Array.isArray(restores)
    ? restores.map(channelId => [channelId, "allow"])
    : Object.entries(restores);
  for (const [channelId, originalAccess] of restoreEntries) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.permissionOverwrites?.edit) continue;
    const overwrite = channel.permissionOverwrites.cache.get(memberId);
    if (overwrite?.deny?.has(PermissionsBitField.Flags.ViewChannel)) {
      await channel.permissionOverwrites.edit(memberId, { ViewChannel: originalAccess === "allow" ? true : null }, { reason: "Wall System quarantine released" });
    }
    if (Array.isArray(restores)) entry.wallViewChannelAccessRestores = restores.filter(id => id !== channelId);
    else delete entry.wallViewChannelAccessRestores[channelId];
    if (typeof saveDB === "function") saveDB();
  }
}

const wallInfrastructureJobs = new Map();
async function wallEnsureInfrastructure(guild, options = {}) {
  if (wallInfrastructureJobs.has(guild.id)) return wallInfrastructureJobs.get(guild.id);
  const job = wallProvisionInfrastructure(guild, options).finally(() => wallInfrastructureJobs.delete(guild.id));
  wallInfrastructureJobs.set(guild.id, job);
  return job;
}

// Preserve resources after a partial setup so a retry can finish without deleting channels.
async function wallProvisionInfrastructure(guild, options = {}) {
  try {
    return await wallProvisionInfrastructureInner(guild, options);
  } catch (error) {
    const ws = guild?.id && ensureWallState(guild.id);
    if (ws) {
      ws.systemEnabled = ws.enabled = false;
      guildData(guild.id).wall.enabled = false;
      wallSaveAndSync(guild.id, "wall_setup_incomplete");
    }
    throw error;
  }
}

async function wallProvisionInfrastructureInner(guild, options = {}) {
  const guildId = guild?.id || options.guildId;
  const ws = ensureWallState(guildId);
  const gd = guildId ? guildData(guildId) : null;
  if (!guild || !ws || !gd) return { ok: false, missing: ["Guild"], created: [], errors: ["Guild state unavailable."] };

  const created = [];
  const errors = [];
  const botId = guild.client?.user?.id || (typeof client !== "undefined" ? client?.user?.id : null);
  await guild.roles.fetch();
  await guild.channels.fetch();
  let category = ws.categoryId ? guild.channels.cache.get(ws.categoryId) : null;
  if (category && category.type !== ChannelType.GuildCategory) throw new Error("The configured Wall category is not a category.");
  if (!category) {
    category = await guild.channels.create({
      name: "Soezy Wall", type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        ...(botId ? [{ id: botId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels] }] : []),
      ], reason: "Wall automatic setup",
    });
    ws.categoryId = category.id;
    ws.createdByBot.categoryId = category.id;
    saveDB();
    created.push(`Wall category: ${category}`);
  }

  let whitelistRole = null;
  try {
    whitelistRole = await require("./utils/protectionRole").ensureProtectionRole(guild, "wall", { guildData, saveDB });
    ws.whitelistRoleId = ws.immuneRoleId = whitelistRole.id;
    ws.immuneRoleIds = [...new Set([...(ws.immuneRoleIds || []), whitelistRole.id])];
    ws.whitelistRoleIds = ws.immuneRoleIds;
  } catch (error) {
    errors.push(`Whitelist role: ${error.message}`);
  }

  let wallRole = ws.quarantineRoleId ? guild.roles.cache.get(ws.quarantineRoleId) : null;
  if (!wallRole) {
    wallRole = await guild.roles.create({
      name: options.roleName || "Wall Quarantine",
      color: 0xE74C3C,
      permissions: [],
      reason: options.reason || `Wall system enabled by ${options.actorTag || options.actorId || "admin"}`,
    }).catch(err => {
      errors.push(`Wall role: ${err.message}`);
      return null;
    });
    if (wallRole) {
      ws.quarantineRoleId = wallRole.id;
      ws.roleId = wallRole.id;
      ws.createdRoleId = wallRole.id;
      ws.createdByBot.roleId = wallRole.id;
      created.push(`Wall role: ${wallRole}`);
      saveDB();
    }
  } else {
    ws.quarantineRoleId = wallRole.id;
    ws.roleId = wallRole.id;
  }

  let wallChannel = ws.jailChannelId ? guild.channels.cache.get(ws.jailChannelId) : null;
  if (!wallChannel && wallRole) {
    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: wallRole.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
    ];
    if (botId) {
      overwrites.push({
        id: botId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.ManageMessages,
          PermissionsBitField.Flags.ManageChannels,
        ],
      });
    }
    wallChannel = await guild.channels.create({
      name: options.channelName || "wall-jail",
      parent: category.id,
      type: ChannelType.GuildText,
      topic: "Wall quarantine channel. Members with the wall role can only use this channel.",
      permissionOverwrites: overwrites,
      reason: options.reason || `Wall system enabled by ${options.actorTag || options.actorId || "admin"}`,
    }).catch(err => {
      errors.push(`Wall channel: ${err.message}`);
      return null;
    });
    if (wallChannel) {
      ws.jailChannelId = wallChannel.id;
      ws.channelId = wallChannel.id;
      ws.createdChannelId = wallChannel.id;
      ws.createdByBot.channelId = wallChannel.id;
      created.push(`Wall channel: ${wallChannel}`);
      saveDB();
    }
  } else if (wallChannel) {
    ws.jailChannelId = wallChannel.id;
    ws.channelId = wallChannel.id;
  }

  const lockdownErrors = [];
  let logChannel = ws.logChannel ? guild.channels.cache.get(ws.logChannel) : null;
  if (!logChannel) {
    logChannel = await guild.channels.create({
      name: "wall-logs", type: ChannelType.GuildText, parent: category.id,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        ...(botId ? [{ id: botId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.EmbedLinks, PermissionsBitField.Flags.ReadMessageHistory] }] : []),
      ], reason: "Wall automatic setup",
    });
    ws.logChannel = logChannel.id;
    ws.createdByBot.logChannelId = logChannel.id;
    saveDB();
    created.push(`Wall logs: ${logChannel}`);
  }
  if (logChannel.parentId !== category.id) await logChannel.setParent(category.id, { lockPermissions: false, reason: "Wall category setup" });
  if (wallChannel && wallChannel.parentId !== category.id) {
    await wallChannel.setParent(category.id, { lockPermissions: false, reason: "Wall category setup" });
  }
  if (wallRole && wallChannel) {
    ws.enabled = true;
    for (const [, ch] of guild.channels.cache) {
      try {
        await wallEnforceQuarantineChannelAccess(ch);
      } catch (error) {
        lockdownErrors.push(`Channel ${ch.id}: ${error.message}`);
      }
    }
  }

  ws.enabled = !!(wallRole && wallChannel && whitelistRole && lockdownErrors.length === 0);
  ws.systemEnabled = ws.enabled;
  ws.roleId = wallRole?.id || null;
  ws.channelId = wallChannel?.id || null;
  gd.wall.roleId = ws.roleId;
  gd.wall.channelId = ws.channelId;
  gd.wall.enabled = ws.enabled;

  const missing = [];
  if (wallRole && wallChannel && typeof wallEnsureAppealPanel === "function") {
    try { await wallEnsureAppealPanel(guild, wallChannel, wallRole); }
    catch (error) { errors.push(`Appeal setup: ${error.message}`); missing.push("Appeal channel permissions"); ws.systemEnabled = ws.enabled = false; gd.wall.enabled = false; }
  }
  if (!wallRole) missing.push("Role");
  if (!whitelistRole) missing.push("Whitelist role");
  if (!wallChannel) missing.push("Channel");
  if (lockdownErrors.length) {
    missing.push("Channel permissions");
    errors.push(...lockdownErrors);
  }
  wallSaveAndSync(guildId, ws.enabled ? "wall_enable_infrastructure" : "wall_enable_failed");
  return { ok: ws.enabled, created, errors, missing, role: wallRole, channel: wallChannel, whitelistRole };
}

async function wallDisableCleanup(guild, options = {}) {
  const guildId = guild?.id || options.guildId;
  const ws = ensureWallState(guildId);
  const gd = guildId ? guildData(guildId) : null;
  if (!guild || !ws || !gd) return { deleted: [], kept: [], errors: ["Guild state unavailable."] };
  // Disabling stops new enforcement; resources and existing jail records stay intact.
  ws.enabled = false;
  ws.systemEnabled = false;
  gd.wall ||= {};
  gd.wall.enabled = false;
  wallSaveAndSync(guildId, "wall_disable");
  return { deleted: [], kept: ["All Wall channels, roles, settings and quarantine records"], errors: [] };
}

const wallConfigurationJobs = new Map();
async function configureWallSystem(guild, enabled, actor) {
  const previous = wallConfigurationJobs.get(guild.id) || Promise.resolve();
  const job = previous.catch(() => {}).then(() => applyWallSystem(guild, enabled, actor));
  wallConfigurationJobs.set(guild.id, job);
  try { return await job; }
  finally { if (wallConfigurationJobs.get(guild.id) === job) wallConfigurationJobs.delete(guild.id); }
}

async function applyWallSystem(guild, enabled, actor) {
  if (enabled) {
    const result = await wallEnsureInfrastructure(guild, { actorId: actor?.id, actorTag: actor?.tag });
    if (!result.ok) throw new Error(result.errors?.join("\n") || "I need Manage Roles and Manage Channels to set up Wall.");
  } else {
    const result = await wallDisableCleanup(guild);
    if (result.errors.length) throw new Error(result.errors.join("\n"));
  }
  if (typeof setFeatureState === "function") {
    setFeatureState(guild.id, "wall", enabled, { client: guild.client, refreshPanels: false });
  } else {
    ensureWallState(guild.id).enabled = enabled;
  }
  wallSaveAndSync(guild.id, enabled ? "wall_enable" : "wall_disable");
}

function buildWallConfigContainer(guildId, sessionId, user) {
  const ws = ensureWallState(guildId);
  const channel = id => id ? `<#${id}>` : "`Not set`";
  const role = id => id ? `<@&${id}>` : "`Not set`";
  const immuneIds = [...new Set([...(ws.immuneRoleIds || []), ws.immuneRoleId, ws.whitelistRoleId].filter(Boolean))];
  const extraOwners = (guildData(guildId).extraOwners || []).map(id => `<@${id}>`).join(", ") || "`Not set`";
  const options = [
    ["logs", "Set Log Channel", "Set the Wall action log channel"],
    ["appeals", "Appeal Settings", "Admin ping role and shared voice channel"],
    ["autochannel", "Set Auto-Jail Channel", "Set the channel monitored by Auto-Jail"],
    ["jailchannel", "Set Message Channel", "Set the channel visible to jailed members"],
    ["setjailer", "Set Jailer Role", "Role allowed to use jail and unjail"],
    ["setwl", "Set Whitelist Role", "Set the primary Wall whitelist role"],
    ["addimmune", "Add Whitelist Role", "Add another role that bypasses Wall"],
    ["rmimmune", "Remove Whitelist Role", "Remove a role from the Wall whitelist"],
    ["list", "View Quarantined", "List all quarantined users"],
  ];
  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.thinking} **Wall Configuration**`))
    .addTextDisplayComponents(t => t.setContent([
      "***__Wall Features Information__***",
      `> **Status** → \`${ws.enabled ? "Enabled" : "Disabled"}\` ${ws.enabled ? EMOJIS.moderation_dm_tick : EMOJIS.scross}`,
      `> **Category** → ${channel(ws.categoryId)}`,
      `> **Log Channel** → ${channel(ws.logChannel)}`,
      `> **Jail Channel** → ${channel(ws.jailChannelId || ws.channelId)}`,
      `> **Auto-Jail Channel** → ${channel(guildData(guildId).autoJail?.channelId)}`,
      `> **Whitelist Roles** → ${immuneIds.length ? immuneIds.map(role).join(", ") : "`Not set`"}`,
      `> **Quarantine Role** → ${role(ws.quarantineRoleId || ws.roleId)}`,
      `> **Jailer Role** → ${role(ws.jailerRoleId)}`,
      `> **Whitelisted Users** → \`${(ws.whitelist || []).length}\``,
      `> **Currently Quarantined** → \`${Object.keys(wallGetQuarantined(guildId)).length}\``,
      `> **Recorded Strikes** → \`${Number(ws.stats?.totalStrikes || 0)}\``,
      `> **Extra Owners** → ${extraOwners}`,
    ].join("\n")))
    .addSeparatorComponents(s => s.setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wscfg_enable_${sessionId}`).setLabel("Enable").setEmoji(EMOJIS.moderation_dm_tick).setStyle(ButtonStyle.Secondary).setDisabled(Boolean(ws.enabled)),
      new ButtonBuilder().setCustomId(`wscfg_disable_${sessionId}`).setLabel("Disable").setEmoji(EMOJIS.scross).setStyle(ButtonStyle.Secondary).setDisabled(!ws.enabled),
      new ButtonBuilder().setCustomId(`wscfg_owners_${sessionId}`).setLabel("Extra Owners").setStyle(ButtonStyle.Secondary),
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId(`wscfg_select_${sessionId}`).setPlaceholder("Wall settings...")
        .addOptions(options.map(([key, label, description]) => ({ label, description, value: `wscfg_${key}_${sessionId}` }))),
    ))
    .addTextDisplayComponents(t => t.setContent(`-# Requested by ${user?.username || "admin"}`));
}

function wallNormalizeStrikeEvents(entry = {}) {
  const raw = []
    .concat(Array.isArray(entry.strikeEvents) ? entry.strikeEvents : [])
    .concat(Array.isArray(entry.strikes) ? entry.strikes : []);
  const seen = new Set();
  const events = [];
  for (const item of raw) {
    const at = typeof item === "number" ? item : Number(item?.at || item?.timestamp || item?.createdAt || 0);
    if (!Number.isFinite(at) || at <= 0) continue;
    const key = `${at}:${item?.messageId || ""}:${item?.channelId || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({
      at,
      channelId: item?.channelId || null,
      messageId: item?.messageId || null,
      reason: item?.reason || "jail_bypass",
      action: item?.action || null,
    });
  }
  return events.sort((a, b) => a.at - b.at);
}

function wallEnsureEntry(guildId, userId, seed = {}) {
  const gId = normalizeWallId(guildId);
  const uId = normalizeWallId(userId);
  const ws = ensureWallState(gId);
  if (!ws || !uId) return null;
  if (!ws.quarantined[gId][uId] || typeof ws.quarantined[gId][uId] !== "object") {
    ws.quarantined[gId][uId] = {
      savedRoles: [],
      reason: seed.reason || "Quarantined",
      moderatorId: seed.moderatorId || null,
      timestamp: seed.timestamp || Date.now(),
      strikes: [],
      strikeEvents: [],
    };
  }
  const entry = ws.quarantined[gId][uId];
  if (!Array.isArray(entry.savedRoles)) entry.savedRoles = [];
  if (!entry.timestamp) entry.timestamp = Date.now();
  if (!entry.reason && seed.reason) entry.reason = seed.reason;
  if (!entry.moderatorId && seed.moderatorId) entry.moderatorId = seed.moderatorId;
  const normalized = wallNormalizeStrikeEvents(entry);
  entry.strikes = normalized;
  entry.strikeEvents = normalized;
  entry.attempts = normalized.length || Number(entry.attempts || 0);
  return entry;
}

function wallGetQuarantined(guildId) {
  const gId = normalizeWallId(guildId);
  const ws = ensureWallState(gId);
  return ws?.quarantined?.[gId] || {};
}

function getWallStrikeCount(guildId, userId, options = {}) {
  const entry = wallEnsureEntry(guildId, userId);
  if (!entry) return 0;
  const now = options.now || Date.now();
  const cutoff = now - wallStrikeWindowMs(guildId);
  const liveEvents = wallNormalizeStrikeEvents(entry).filter(event => event.at >= cutoff);
  const legacyCount = entry.attemptDay === wallTodayKey(now) ? Number(entry.attempts || 0) : 0;
  return Math.max(liveEvents.length, Number.isFinite(legacyCount) ? legacyCount : 0);
}

function recordWallStrike(guildId, userId, meta = {}) {
  const gId = normalizeWallId(guildId);
  const uId = normalizeWallId(userId);
  const entry = wallEnsureEntry(gId, uId);
  const ws = ensureWallState(gId);
  if (!entry || !ws) return { count: 0, limit: wallStrikeLimit(gId), punished: false };

  const now = Date.now();
  const cutoff = now - wallStrikeWindowMs(gId);
  const event = {
    at: now,
    channelId: meta.channelId || null,
    messageId: meta.messageId || null,
    reason: meta.reason || "jail_bypass",
    action: meta.action || null,
  };
  const events = wallNormalizeStrikeEvents(entry).filter(item => item.at >= cutoff);
  events.push(event);
  entry.strikes = events;
  entry.strikeEvents = events;
  entry.attemptDay = wallTodayKey(now);
  entry.attempts = events.length;
  entry.lastStrikeAt = now;

  if (!ws.strikes[uId] || typeof ws.strikes[uId] !== "object") ws.strikes[uId] = { total: 0, events: [] };
  ws.strikes[uId].events = wallNormalizeStrikeEvents({ strikeEvents: ws.strikes[uId].events }).concat([event]).slice(-200);
  ws.strikes[uId].total = Number(ws.strikes[uId].total || 0) + 1;
  ws.strikes[uId].lastStrikeAt = now;

  if (!ws.leaderboard[uId] || typeof ws.leaderboard[uId] !== "object") ws.leaderboard[uId] = { strikes: 0 };
  ws.leaderboard[uId].strikes = Number(ws.leaderboard[uId].strikes || 0) + 1;
  ws.leaderboard[uId].lastStrikeAt = now;
  ws.stats.totalStrikes = Number(ws.stats.totalStrikes || 0) + 1;
  ws.stats.activeQuarantines = Object.keys(ws.quarantined[gId] || {}).length;
  wallSaveAndSync(gId, "wall_strike");
  return { count: events.length, limit: wallStrikeLimit(gId), punished: events.length >= wallStrikeLimit(gId), entry };
}

function resetWallStrikes(guildId, userId) {
  const entry = wallEnsureEntry(guildId, userId);
  if (!entry) return false;
  entry.strikes = [];
  entry.strikeEvents = [];
  entry.attempts = 0;
  entry.attemptDay = wallTodayKey();
  entry.lastStrikeAt = null;
  wallSaveAndSync(guildId, "wall_strikes_reset");
  return true;
}

function wallUpsertQuarantineRecord(guildId, userId, data = {}) {
  const gId = normalizeWallId(guildId);
  const uId = normalizeWallId(userId);
  const ws = ensureWallState(gId);
  if (!ws || !uId) return null;
  const existing = ws.quarantined[gId][uId] || {};
  const entry = {
    ...existing,
    savedRoles: Array.isArray(data.savedRoles) ? [...new Set(data.savedRoles.map(normalizeWallId).filter(Boolean))] : (Array.isArray(existing.savedRoles) ? existing.savedRoles : []),
    reason: data.reason || existing.reason || "Quarantined",
    moderatorId: data.moderatorId || existing.moderatorId || null,
    timestamp: data.timestamp || existing.timestamp || Date.now(),
    source: data.source || existing.source || "manual",
    autoAction: data.autoAction ?? existing.autoAction ?? false,
    strikes: data.resetStrikes === false ? wallNormalizeStrikeEvents(existing) : [],
    strikeEvents: data.resetStrikes === false ? wallNormalizeStrikeEvents(existing) : [],
    attempts: data.resetStrikes === false ? Number(existing.attempts || 0) : 0,
    attemptDay: wallTodayKey(),
  };
  ws.quarantined[gId][uId] = entry;
  ws.stats.totalQuarantines = Number(ws.stats.totalQuarantines || 0) + (existing.timestamp ? 0 : 1);
  ws.stats.activeQuarantines = Object.keys(ws.quarantined[gId]).length;
  wallSaveAndSync(gId, "wall_quarantine_record");
  return entry;
}

async function wallQuarantineMember(member, options = {}) {
  const guild = member?.guild;
  const guildId = guild?.id || options.guildId;
  const ws = ensureWallState(guildId);
  if (!guild || !ws) throw new Error("Wall state is unavailable.");
  const qRoleId = normalizeWallId(options.quarantineRoleId || ws.quarantineRoleId || ws.roleId);
  if (!qRoleId) throw new Error("Quarantine role is not configured.");
  const qRole = guild.roles.cache.get(qRoleId);
  if (!qRole) throw new Error("Quarantine role is missing from the server.");

  const gId = normalizeWallId(guildId);
  const existing = ws.quarantined?.[gId]?.[member.id];
  if (existing && member.roles.cache.has(qRoleId)) {
    return {
      entry: existing,
      savedRoles: Array.isArray(existing.savedRoles) ? existing.savedRoles : [],
      quarantineRoleId: qRoleId,
      alreadyQuarantined: true,
    };
  }

  const savedRoles = member.roles.cache
    .filter(role => role.id !== guild.id && role.id !== qRoleId)
    .map(role => role.id);
  await member.roles.set([qRole], options.auditReason || `Wall quarantine: ${options.reason || "No reason provided"}`);
  const entry = wallUpsertQuarantineRecord(guildId, member.id, {
    savedRoles,
    reason: options.reason || "Quarantined",
    moderatorId: options.moderatorId || null,
    timestamp: Date.now(),
    source: options.source || "manual",
    autoAction: options.autoAction === true,
    resetStrikes: options.resetStrikes !== false,
  });
  const accessErrors = await wallEnforceQuarantinedMemberAccess(guild, member.id, member);
  if (accessErrors.length) {
    throw new Error(`Quarantine role applied, but ${accessErrors.length} channel permission update(s) failed: ${accessErrors.map(item => item.channelId).join(", ")}`);
  }
  if (options.source !== "auto_jail" && typeof wallNotifyAutoJailAppeal === "function") {
    await wallNotifyAutoJailAppeal(member).catch(error => console.warn(`[WALL] Appeal notification failed: ${error.message}`));
  }
  return { entry, savedRoles, quarantineRoleId: qRoleId };
}

async function wallReleaseMember(member, options = {}) {
  const guild = member?.guild;
  const guildId = guild?.id || options.guildId;
  const ws = ensureWallState(guildId);
  const gId = normalizeWallId(guildId);
  if (!guild || !ws || !gId) throw new Error("Wall state is unavailable.");
  const entry = ws.quarantined?.[gId]?.[member.id];
  if (!entry) throw new Error("Member is not quarantined.");

  const qRoleId = normalizeWallId(ws.quarantineRoleId || ws.roleId);
  const configuredRestore = []
    .concat(ws.restoreRoleId ? [ws.restoreRoleId] : [])
    .concat(Array.isArray(ws.restoreRoleIds) ? ws.restoreRoleIds : [])
    .map(normalizeWallId)
    .filter(Boolean);
  const rolesToRestore = [...new Set([...(entry.savedRoles || []), ...configuredRestore])]
    .filter(id => id !== guild.id && id !== qRoleId && guild.roles.cache.has(id));
  await member.roles.set(rolesToRestore, options.auditReason || "Released from wall quarantine");
  await wallRestoreMemberChannelAccess(guild, member.id, entry);

  delete ws.quarantined[gId][member.id];
  ws.stats.activeQuarantines = Object.keys(ws.quarantined[gId]).length;
  ws.stats.totalReleases = Number(ws.stats.totalReleases || 0) + 1;
  wallSaveAndSync(gId, "wall_release");
  return { entry, rolesToRestore };
}

async function wallApplyStrikePunishment(member, options = {}) {
  const ws = ensureWallState(member?.guild?.id || options.guildId);
  const entry = wallEnsureEntry(member?.guild?.id || options.guildId, member?.id);
  if (!member || !ws || !entry) return { stripped: false, removedRoles: 0 };
  const hadSavedRoles = Array.isArray(entry.savedRoles) && entry.savedRoles.length > 0;
  entry.savedRoles = [];
  const powerPerms = [
    PermissionsBitField.Flags.Administrator,
    PermissionsBitField.Flags.ManageGuild,
    PermissionsBitField.Flags.ManageRoles,
    PermissionsBitField.Flags.BanMembers,
    PermissionsBitField.Flags.KickMembers,
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ManageMessages,
    PermissionsBitField.Flags.ManageWebhooks,
  ];
  let removedRoles = 0;
  for (const [, role] of member.roles.cache) {
    if (role.id === member.guild.id || role.id === ws.quarantineRoleId) continue;
    if (powerPerms.some(perm => role.permissions.has(perm))) {
      const removed = await member.roles.remove(role, options.auditReason || "Wall strike limit reached").then(() => true).catch(() => false);
      if (removed) removedRoles++;
    }
  }
  entry.lastPunishmentAt = Date.now();
  entry.punishment = "roles_stripped";
  wallSaveAndSync(member.guild.id, "wall_strike_punishment");
  return { stripped: hadSavedRoles, removedRoles };
}

function wallGetLeaderboard(guildId, limit = 10) {
  const ws = ensureWallState(guildId);
  if (!ws) return [];
  const totals = new Map();
  for (const [userId, data] of Object.entries(ws.leaderboard || {})) {
    totals.set(userId, {
      userId,
      strikes: Number(data?.strikes || 0),
      lastStrikeAt: data?.lastStrikeAt || 0,
    });
  }
  for (const [userId, entry] of Object.entries(wallGetQuarantined(guildId))) {
    const current = totals.get(userId) || { userId, strikes: 0, lastStrikeAt: 0 };
    current.activeStrikes = getWallStrikeCount(guildId, userId);
    current.strikes = Math.max(current.strikes, current.activeStrikes);
    current.lastStrikeAt = Math.max(current.lastStrikeAt || 0, entry.lastStrikeAt || 0);
    totals.set(userId, current);
  }
  return [...totals.values()]
    .sort((a, b) => (b.strikes - a.strikes) || ((b.lastStrikeAt || 0) - (a.lastStrikeAt || 0)))
    .slice(0, limit);
}

Object.assign(globalThis, {
  soezyWallManager: {
    ensureWallState,
    wallGetQuarantined,
    wallEnsureEntry,
    getWallStrikeCount,
    recordWallStrike,
    resetWallStrikes,
    wallUpsertQuarantineRecord,
    wallQuarantineMember,
    wallReleaseMember,
    wallApplyStrikePunishment,
    wallGetLeaderboard,
    wallStrikeLimit,
    wallEnsureInfrastructure,
    wallDisableCleanup,
    wallSaveAndSync,
    wallGuardRolePermissions,
    wallEnforceQuarantineChannelAccess,
    wallEnforceQuarantinedMemberAccess,
    wallRestoreMemberChannelAccess,
  },
  ensureWallState,
  wallGetQuarantined,
  wallEnsureEntry,
  getWallStrikeCount,
  recordWallStrike,
  resetWallStrikes,
  wallUpsertQuarantineRecord,
  wallQuarantineMember,
  wallReleaseMember,
  wallApplyStrikePunishment,
  wallGetLeaderboard,
  wallStrikeLimit,
  wallEnsureInfrastructure,
  wallDisableCleanup,
  wallSaveAndSync,
  wallGuardRolePermissions,
  wallEnforceQuarantineChannelAccess,
  wallEnforceQuarantinedMemberAccess,
  wallRestoreMemberChannelAccess,
});
