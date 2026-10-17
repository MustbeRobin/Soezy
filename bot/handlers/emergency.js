"use strict";
(() => {
  const { createEmergencyProtection } = require("./utils/emergencyProtection");
  const protection = createEmergencyProtection({
    client,
    config: id => guildData(id).antinuke,
    // AntiNuke is available to every guild; its master switch is checked by the core.
    enabled: id => Boolean(id),
    whitelisted: isAntiNukeWhitelisted,
    antibotWhitelisted: (botId, guildId) => isAntibotWhitelisted(botId, guildId),
    fetchWebhook: id => client.fetchWebhook(id),
    removeIntegration: (guild, integrationId) => client.rest.delete(`/guilds/${guild.id}/integrations/${integrationId}`),
    restore: async (guild, excludedMembers) => {
      const result = await restoreGuildFromSnapshot(guild, {
        channels: true, roles: true, memberRoles: true, perms: true, webhooks: true, settings: true,
        excludedMembers,
      }, null);
      const remapped = nukeSnapshots.get(guild.id)?.restoredChannelIds || {};
      const gd = guildData(guild.id);
      let changed = false;
      const remap = (object, key) => {
        if (object && remapped[object[key]]) { object[key] = remapped[object[key]]; changed = true; }
      };
      remap(gd.logging, "channel");
      for (const key of Object.keys(gd.logging?.channels || {})) remap(gd.logging.channels, key);
      remap(gd.antinuke, "logs");
      if (changed) saveDB(guild.id);
      if (!result.success || result.errors?.length) {
        console.error(`[EMERGENCY ${guild.id}] Recovery incomplete: ${result.reason || result.errors.slice(0, 3).join("; ")}`);
      }
      return result;
    },
    error: (id, error) => console.error(`[EMERGENCY ${id}] ${error.message}`),
  });
  globalThis.soezyEmergency = protection;
  const actions = new Map([
    [AuditLogEvent.MemberBanAdd, ["ban", "antiban"]],
    [AuditLogEvent.MemberBanRemove, ["unban", "antiunban"]],
    [AuditLogEvent.MemberKick, ["kick", "antikick"]],
    [AuditLogEvent.MemberPrune, ["prune", "antikick"]],
    [AuditLogEvent.MemberUpdate, ["memberUpdate", "antimemberupdate"]],
    [AuditLogEvent.MemberMove, ["voiceMove", "antimemberupdate"]],
    [AuditLogEvent.MemberDisconnect, ["voiceDisconnect", "antimemberupdate"]],
    [AuditLogEvent.MessageBulkDelete, ["messageBulkDelete", "antimemberupdate"]],
    [AuditLogEvent.BotAdd, ["botAdd", "antibot"]],
    [AuditLogEvent.ChannelCreate, ["channelCreate", "antichannelcreate"]],
    [AuditLogEvent.ChannelUpdate, ["channelUpdate", "antichannelupdate"]],
    [AuditLogEvent.ChannelDelete, ["channelDelete", "antichanneldelete"]],
    [AuditLogEvent.RoleCreate, ["roleCreate", "antirolecreate"]],
    [AuditLogEvent.RoleDelete, ["roleDelete", "antiroledelete"]],
    [AuditLogEvent.RoleUpdate, ["permschange", "antipermschange"]],
    [AuditLogEvent.ChannelOverwriteCreate, ["permschange", "antipermschange"]],
    [AuditLogEvent.ChannelOverwriteUpdate, ["permschange", "antipermschange"]],
    [AuditLogEvent.ChannelOverwriteDelete, ["permschange", "antipermschange"]],
    [AuditLogEvent.MemberRoleUpdate, ["massroleremove", "antimassroleremove"]],
    [AuditLogEvent.EmojiCreate, ["emojiCreate", "antiemojicreate"]],
    [AuditLogEvent.EmojiDelete, ["emojiDelete", "antiemojidelete"]],
    [AuditLogEvent.EmojiUpdate, ["emojiUpdate", "antiemojiupdate"]],
    [AuditLogEvent.StickerCreate, ["stickerCreate", "antistickercreate"]],
    [AuditLogEvent.StickerDelete, ["stickerDelete", "antistickerdelete"]],
    [AuditLogEvent.StickerUpdate, ["stickerUpdate", "antistickerupdate"]],
    [AuditLogEvent.WebhookCreate, ["webhookCreate", "antiwebhookcreate"]],
    [AuditLogEvent.WebhookDelete, ["webhookDelete", "antiwebhookdelete"]],
    [AuditLogEvent.WebhookUpdate, ["webhookUpdate", "antiwebhookupdate"]],
    [AuditLogEvent.InviteCreate, ["inviteCreate", "antiguildupdate"]],
    [AuditLogEvent.InviteUpdate, ["inviteUpdate", "antiguildupdate"]],
    [AuditLogEvent.InviteDelete, ["inviteDelete", "antiguildupdate"]],
    [AuditLogEvent.IntegrationCreate, ["integrationCreate", "antibot"]],
    [AuditLogEvent.IntegrationUpdate, ["integrationUpdate", "antibot"]],
    [AuditLogEvent.IntegrationDelete, ["integrationDelete", "antibot"]],
    [AuditLogEvent.ThreadCreate, ["threadCreate", "antichannelcreate"]],
    [AuditLogEvent.ThreadUpdate, ["threadUpdate", "antichannelupdate"]],
    [AuditLogEvent.ThreadDelete, ["threadDelete", "antichanneldelete"]],
    [AuditLogEvent.StageInstanceCreate, ["stageCreate", "antichannelupdate"]],
    [AuditLogEvent.StageInstanceUpdate, ["stageUpdate", "antichannelupdate"]],
    [AuditLogEvent.StageInstanceDelete, ["stageDelete", "antichannelupdate"]],
    [AuditLogEvent.GuildScheduledEventCreate, ["scheduledEventCreate", "antiguildupdate"]],
    [AuditLogEvent.GuildScheduledEventUpdate, ["scheduledEventUpdate", "antiguildupdate"]],
    [AuditLogEvent.GuildScheduledEventDelete, ["scheduledEventDelete", "antiguildupdate"]],
    [AuditLogEvent.ApplicationCommandPermissionUpdate, ["applicationPermissionUpdate", "antipermschange"]],
    [AuditLogEvent.SoundboardSoundCreate, ["soundboardCreate", "antistickercreate"]],
    [AuditLogEvent.SoundboardSoundUpdate, ["soundboardUpdate", "antistickerupdate"]],
    [AuditLogEvent.SoundboardSoundDelete, ["soundboardDelete", "antistickerdelete"]],
    [AuditLogEvent.OnboardingPromptCreate, ["guildUpdate", "antiguildupdate"]],
    [AuditLogEvent.OnboardingPromptUpdate, ["guildUpdate", "antiguildupdate"]],
    [AuditLogEvent.OnboardingPromptDelete, ["guildUpdate", "antiguildupdate"]],
    [AuditLogEvent.OnboardingCreate, ["guildUpdate", "antiguildupdate"]],
    [AuditLogEvent.OnboardingUpdate, ["guildUpdate", "antiguildupdate"]],
    [AuditLogEvent.HomeSettingsCreate, ["guildUpdate", "antiguildupdate"]],
    [AuditLogEvent.HomeSettingsUpdate, ["guildUpdate", "antiguildupdate"]],
    [AuditLogEvent.VoiceChannelStatusCreate, ["channelUpdate", "antichannelupdate"]],
    [AuditLogEvent.VoiceChannelStatusDelete, ["channelUpdate", "antichannelupdate"]],
    [AuditLogEvent.GuildUpdate, ["guildUpdate", "antiguildupdate"]],
    [AuditLogEvent.AutoModerationRuleCreate, ["autoModerationRuleCreate", "antiautomodcreate"]],
    [AuditLogEvent.AutoModerationRuleDelete, ["autoModerationRuleDelete", "antiautomoddelete"]],
    [AuditLogEvent.AutoModerationRuleUpdate, ["autoModerationRuleUpdate", "antiautomod"]],
  ]);
  client.on("guildAuditLogEntryCreate", async (entry, guild) => {
    const mapped = actions.get(entry.action);
    const createdAt = Number(entry.createdTimestamp);
    if (!mapped || !entry.id || !Number.isFinite(createdAt) || Date.now() - createdAt > 15000) return;
    let [action, setting] = mapped;
    const changes = entry.changes || [];
    const evidence = { id: entry.id, targetId: entry.targetId || entry.target?.id };
    if (entry.action === AuditLogEvent.RoleUpdate) {
      const permissionChange = changes.find(change => change.key === "permissions");
      setting = permissionChange ? "antipermschange" : "antiroleupdate";
      action = "roleUpdate";
      if (guildData(guild.id).antinuke?.events?.[setting] === false) return;
      if (permissionChange) {
        try {
          const newPermissions = BigInt(permissionChange.new || 0);
          const oldPermissions = BigInt(permissionChange.old || 0);
          const dangerousPermissions = 8n | 32n | 268435456n | 16n | 4n | 2n | 536870912n;
          evidence.force = (newPermissions & dangerousPermissions & ~oldPermissions) !== 0n;
        } catch { evidence.force = false; }
      }
    }
    if (entry.action === AuditLogEvent.GuildUpdate) {
      const highRiskKeys = new Set(["verification_level", "explicit_content_filter", "default_message_notifications", "system_channel_id", "rules_channel_id", "public_updates_channel_id", "safety_alerts_channel_id", "mfa_level", "features"]);
      evidence.force = changes.some(change => highRiskKeys.has(change.key));
    }
    if (entry.action === AuditLogEvent.MemberRoleUpdate) {
      const added = changes.find(change => change.key === "$add");
      const removed = changes.find(change => change.key === "$remove");
      if (!added && !removed) return;
      const idsFrom = change => (Array.isArray(change?.new) ? change.new : change?.new ? [change.new] : []).map(role => String(role.id || role)).filter(id => /^\d{17,20}$/.test(id));
      evidence.addedRoleIds = idsFrom(added);
      evidence.removedRoleIds = idsFrom(removed);
      evidence.roleChangeType = added ? "add" : "remove";
      evidence.weight = Math.max(1, evidence.addedRoleIds.length + evidence.removedRoleIds.length);
      const dangerousPermissions = 8n | 32n | 268435456n | 16n | 4n | 2n | 536870912n;
      evidence.force = evidence.addedRoleIds.some(id => {
        const role = guild.roles.cache.get(id);
        try { return role && (BigInt(role.permissions.bitfield) & dangerousPermissions) !== 0n; }
        catch { return false; }
      });
      action = "massRoleChange";
    }
    if (entry.action === AuditLogEvent.MemberUpdate && !changes.some(change => ["communication_disabled_until", "deaf", "mute"].includes(change.key))) return;
    if ([AuditLogEvent.MemberPrune, AuditLogEvent.MemberMove, AuditLogEvent.MemberDisconnect, AuditLogEvent.MessageBulkDelete].includes(entry.action)) {
      const count = Number(entry.extra?.removed ?? entry.extra?.count) || 1;
      evidence.weight = count;
      if (entry.action === AuditLogEvent.MemberPrune) evidence.force = count >= (guildData(guild.id).antinuke?.maxKicks || 3);
      if ([AuditLogEvent.MemberMove, AuditLogEvent.MemberDisconnect].includes(entry.action)) evidence.force = count >= (guildData(guild.id).antinuke?.maxKicks || 3);
    }
    if (entry.action === AuditLogEvent.ApplicationCommandPermissionUpdate) evidence.force = true;
    if (entry.action === AuditLogEvent.IntegrationCreate) evidence.force = true;
    if (entry.action === AuditLogEvent.InviteCreate) evidence.inviteCode = entry.target?.code || changes.find(change => change.key === "code")?.new || null;
    if (entry.action === AuditLogEvent.AutoModerationRuleCreate) evidence.force = true;
    if (entry.action === AuditLogEvent.AutoModerationRuleUpdate && changes.some(change => change.key === "enabled" && change.new === false)) evidence.force = true;
    if (guildData(guild.id).antinuke?.events?.[setting] !== true) return;
    await protection.recordAction(guild, entry.executorId || entry.executor?.id, action, {
      ...evidence, setting,
    });
  });
  const timer = setInterval(() => protection.prune(), 30000);
  timer.unref?.();
})();
