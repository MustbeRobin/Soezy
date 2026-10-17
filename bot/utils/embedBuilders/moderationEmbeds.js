const { gatherFeatureRoleIds, isFeatureRoleMappedToAnother } = require("./utils/featureRoleMap");

/* ================= MODERATION AND SECURITY EMBED BUILDERS ================= */
function buildModerationResultEmbed({ guild, target, executor, action, reason, duration, dmSent = null, warnings, simulated = false }) {
  const titles = {
    mute: "User Timed Out", unmute: "User Timeout Removed", ban: "User Banned",
    unban: "User Unbanned", kick: "User Kicked", warn: "User Warned",
  };
  const titleEmoji = simulated
    ? { mute: EMOJIS.fmute_title, ban: EMOJIS.fban_title, kick: EMOJIS.fkick_title }[action]
    : { mute: EMOJIS.mute_title, unmute: EMOJIS.unmute_title, ban: EMOJIS.ban_title, unban: EMOJIS.unban_title, kick: EMOJIS.kick_title }[action];
  const user = target.user || target;
  // Keep user-supplied reasons inside the code block and within embed limits.
  const cleanReason = String(!reason || reason === "Reason: ???" ? "No reason provided." : reason)
    .replace(/`/g, "\u02cb").slice(0, 1800);
  const lines = [
    `> **Target : <@${user.id}> (\`${user.id}\`)**`,
    `> **Executor : <@${executor.id}>**`,
  ];
  if (duration) lines.push(`> **Duration : \`${String(duration).replace(/`/g, "")}\`**`);
  lines.push(`> **Server : \`${guild.name}\`**`);
  if (warnings != null) lines.push(`> **Total Warnings : \`${warnings}\`**`);
  lines.push(`> **Reason :**\n\`\`\`\n${cleanReason}\n\`\`\``);
  const dmStatus = dmSent === true
    ? `${EMOJIS.Tick || EMOJIS.moderation_dm_tick} Sent successfully`
    : `${EMOJIS.cross} ${dmSent === false ? "Could not send DM" : "Not sent"}`;
  lines.push(`> **DM Status**: ${dmStatus}`);
  const embed = new EmbedBuilder()
    .setColor(getThemeColor(guild.id))
    .setTitle(`${titleEmoji || EMOJIS.moderation_update || EMOJIS.moderation} ${titles[action]}${simulated ? " (Simulation)" : ""}`)
    .setDescription(lines.join("\n"));
  if (user.displayAvatarURL) embed.setThumbnail(user.displayAvatarURL({ size: 256 }));
  return embed;
}

function buildModerationResultReplyOptions(embed, target) {
  return {
    embeds: [embed],
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
  };
}

function buildModerationDmContainer({ action, guildName, moderatorTag, reason, duration, sourceUrl }) {
  const copy = {
    mute: ["You have been timed out!", EMOJIS.mute_title],
    unmute: ["Your timeout has been removed!", EMOJIS.unmute_title],
    ban: ["You have been banned!", EMOJIS.ban_title],
    unban: ["You have been unbanned!", EMOJIS.unban_title],
    kick: ["You have been kicked!", EMOJIS.kick_title],
  }[action];
  if (!copy) throw new Error(`Unsupported moderation DM action: ${action}`);

  const cleanReason = String(!reason || reason === "Reason: ???" ? "No reason provided." : reason)
    .replace(/```/g, "ˋˋˋ")
    .slice(0, 1500);
  const lines = [
    `## ${copy[1] || EMOJIS.moderation} ${copy[0]}`,
    `> * **Server: \`${String(guildName).replace(/`/g, "")}\`**`,
    `> * **Moderator: \`${String(moderatorTag).replace(/`/g, "")}\`**`,
    `> * **Reason:** \`\`\`${cleanReason}\`\`\``,
  ];
  if (action === "mute" && duration) lines.splice(3, 0, `> * **Duration: \`${String(duration).replace(/`/g, "")}\`**`);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text => text.setContent(lines.join("\n")));
  if ((action === "mute" || action === "unmute") && sourceUrl) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("View Message").setStyle(ButtonStyle.Link).setURL(sourceUrl)
    ));
  }
  return container;
}

/* ================= WHITELIST FUNCTIONS ================= */

function isBadWordImmune(member, channel, guildId) {
  if (!member) return false;
  if (isSecurityWhitelisted(member, guildId, channel)) return true;
  if (isAutomodImmune(member, channel, guildId)) return true;
  const gd = guildData(guildId);
  if (gd.badWordWhitelistUsers?.includes(member.id) || gd.badWordImmuneUsers?.includes(member.id)) return true;
  const badWordRoles = [
    ...(Array.isArray(gd.badWordWhitelistRoles) ? gd.badWordWhitelistRoles : []),
    ...(Array.isArray(gd.badWordImmuneRoles) ? gd.badWordImmuneRoles : []),
  ];
  if (badWordRoles.length) {
    if (member.roles.cache.some(role => badWordRoles.includes(role.id))) return true;
  }
  if (channel && (gd.badWordWhitelistChannels?.includes(channel.id) || gd.badWordImmuneChannels?.includes(channel.id))) return true;
  return false;
}

const isBadWordWhitelisted = isBadWordImmune;

function isNSFWImmune(member, channel, guildId) {
  if (!member) return false;
  if (isSecurityWhitelisted(member, guildId, channel)) return true;
  if (isAutomodImmune(member, channel, guildId)) return true;
  if (guildData(guildId).nsfwImmuneRoles?.length) {
    if (member.roles.cache.some(role => guildData(guildId).nsfwImmuneRoles.includes(role.id))) return true;
  }
  if (channel && guildData(guildId).nsfwImmuneChannels?.includes(channel.id)) return true;
  return false;
}

const isNSFWWhitelisted = isNSFWImmune;

function isAntilinkImmune(member, channel, guildId) {
  if (!member) return false;
  if (isSecurityWhitelisted(member, guildId, channel)) return true;
  if (isAutomodImmune(member, channel, guildId)) return true;
  const gd = guildData(guildId);
  const sec = gd.security || {};
  const al = guildData(guildId).antilink || {};
  if (al.whitelistUsers?.includes(member.id) || al.immuneUsers?.includes(member.id)) return true;
  const roles = [
    ...(Array.isArray(al.whitelistRoles) ? al.whitelistRoles : []),
    ...(Array.isArray(al.immuneRoles) ? al.immuneRoles : []),
  ];
  if (roles.length) {
    if (member.roles.cache.some(role => roles.includes(role.id))) return true;
  }
  if (channel && (
    al.whitelistChannels?.includes(channel.id) ||
    al.immuneChannels?.includes(channel.id) ||
    gd.whitelistChannels?.includes(channel.id) ||
    gd.immuneChannels?.includes(channel.id) ||
    sec.whitelistChannels?.includes(channel.id) ||
    sec.immuneChannels?.includes(channel.id)
  )) return true;
  return false;
}

const isAntilinkWhitelisted = isAntilinkImmune;

function isAutomodImmune(member, channel, guildId) {
  if (!member) return false;
  if (isSecurityWhitelisted(member, guildId, channel)) return true;
  const gd = guildData(guildId);
  const am = gd.automod || {};
  if (gd.automodWhitelistUsers?.includes(member.id) || gd.automodImmuneUsers?.includes(member.id) || am.whitelistUsers?.includes(member.id)) return true;
  const featureRoleIds = gatherFeatureRoleIds(gd, ["automod"]);
  const roles = [
    ...(Array.isArray(gd.automodWhitelistRoles) ? gd.automodWhitelistRoles : []),
    ...(Array.isArray(gd.automodImmuneRoles) ? gd.automodImmuneRoles : []),
    ...(Array.isArray(am.whitelistRoles) ? am.whitelistRoles : []),
    ...featureRoleIds,
  ];
  if (roles.length) {
    if (member.roles.cache.some(role => roles.includes(role.id))) return true;
  }
  const sec = gd.security || {};
  if (channel && (
    gd.automodWhitelistChannels?.includes(channel.id) ||
    gd.automodImmuneChannels?.includes(channel.id) ||
    am.whitelistChannels?.includes(channel.id) ||
    am.immuneChannels?.includes(channel.id) ||
    gd.whitelistChannels?.includes(channel.id) ||
    gd.immuneChannels?.includes(channel.id) ||
    sec.whitelistChannels?.includes(channel.id) ||
    sec.immuneChannels?.includes(channel.id)
  )) return true;
  return false;
}

const isAutomodWhitelisted = isAutomodImmune;

async function isAntiNukeWhitelisted(userId, guildId) {
  const gd = guildData(guildId);
  const an = gd.antinuke || {};
  const guild = client.guilds.cache.get(guildId);
  const member = guild ? guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null) : null;
  if (member && isSecurityWhitelisted(member, guildId)) return true;
  if (an.whitelist?.includes(userId) || an.whitelistUsers?.includes(userId)) return true;
  const roleIds = [
    ...(Array.isArray(an.whitelistRoles) ? an.whitelistRoles : []),
    ...(an.whitelistRoleId && !isFeatureRoleMappedToAnother(gd, "antinuke", an.whitelistRoleId) ? [an.whitelistRoleId] : []),
    ...gatherFeatureRoleIds(gd, ["antinuke"]),
  ];
  if (roleIds.length) {
    if (guild) {
      if (member?.roles.cache.some(role => roleIds.includes(role.id))) return true;
    }
  }
  return false;
}

/** Check if a member is whitelisted from wall auto-strip (role OR user ID list) */
function isWallWhitelisted(member, guildId) {
  if (!member || !guildId) return false;
  if (isSecurityWhitelisted(member, guildId)) return true;
  const gd = guildData(guildId);
  const ws = gd.wallSystem || {};
  if (!ws) return false;
  if (ws.whitelist?.includes(member.id) || ws.whitelistUsers?.includes(member.id)) return true;
  const featureRoleIds = gatherFeatureRoleIds(gd, ["wall"]);
  const legacyMappedRoleIds = [...(ws.immuneRoleIds || []), ws.immuneRoleId, ws.whitelistRoleId]
    .filter(roleId => roleId && !isFeatureRoleMappedToAnother(gd, "wall", roleId));
  const allImmuneIds = [
    ...legacyMappedRoleIds,
    ...featureRoleIds,
  ];
  if (ws.whitelistRoleId && member.roles.cache.has(ws.whitelistRoleId)) return true;
  if (allImmuneIds.some(rid => member.roles.cache.has(rid))) return true;
  if ((ws.whitelistRoles || []).some(rid => member.roles.cache.has(rid))) return true;
  return false;
}

/** Check if a user can use jail/unjail commands (admin OR has jailer role) */
function isJailerAuthorized(msg, guildId) {
  if (canManageWall(msg.guild, msg.author.id)) return true;
  if (isAuthorized(msg, guildId)) return true;
  const jailerRoleId = guildData(guildId).wallSystem?.jailerRoleId;
  if (jailerRoleId && msg.member.roles.cache.has(jailerRoleId)) return true;
  return false;
}

function isAntibotWhitelisted(botId, guildId) {
  const guild = client.guilds.cache.get(guildId);
  const member = guild?.members.cache.get(botId);
  const gd = guildData(guildId);
  const ab = gd.antibot || {};
  if (member && isSecurityWhitelisted(member, guildId)) return true;
  if (ab.whitelist?.includes(botId) || ab.whitelistUsers?.includes(botId)) return true;
  if (member && Array.isArray(ab.whitelistRoles) && member.roles?.cache?.some(role => ab.whitelistRoles.includes(role.id))) return true;
  const featureRoleIds = gatherFeatureRoleIds(gd, ["antibot"]);
  if (featureRoleIds.length && member?.roles?.cache?.some(role => featureRoleIds.includes(role.id))) return true;
  return false;
}

function isAntiRaidWhitelisted(member, guildId) {
  if (!member || !guildId) return false;
  if (isSecurityWhitelisted(member, guildId)) return true;
  const gd = guildData(guildId);
  const ar = gd.antiRaid || gd.security?.antiraid || {};
  if ([...(ar.whitelistUsers || []), ...(ar.whitelist || [])].includes(member.id)) return true;
  const roles = [...(ar.whitelistRoles || []), ...gatherFeatureRoleIds(gd, ["antiraid"])];
  return roles.some(roleId => member.roles?.cache?.has(roleId));
}

function isSecurityWhitelisted(member, guildId, channel = null) {
  if (!member || !guildId) return false;
  const gd = guildData(guildId);
  if (typeof syncGuildWhitelist === "function") syncGuildWhitelist(gd);
  const sec = gd.security || {};
  const users = [
    ...(Array.isArray(gd.whitelistUsers) ? gd.whitelistUsers : []),
    ...(Array.isArray(gd.immuneUsers) ? gd.immuneUsers : []),
    ...(Array.isArray(sec.whitelistUsers) ? sec.whitelistUsers : []),
  ];
  const roles = [
    ...(Array.isArray(gd.whitelistRoles) ? gd.whitelistRoles : []),
    ...(Array.isArray(gd.immuneRoles) ? gd.immuneRoles : []),
    ...(Array.isArray(sec.whitelistRoles) ? sec.whitelistRoles : []),
  ];
  if (users.includes(member.id)) return true;
  if (roles.length > 0 && member.roles?.cache?.some(role => roles.includes(role.id))) return true;
  return Boolean(channel && [
    ...(Array.isArray(gd.whitelistChannels) ? gd.whitelistChannels : []),
    ...(Array.isArray(gd.immuneChannels) ? gd.immuneChannels : []),
    ...(Array.isArray(sec.whitelistChannels) ? sec.whitelistChannels : []),
    ...(Array.isArray(sec.immuneChannels) ? sec.immuneChannels : []),
  ].includes(channel.id));
}

/* ================= MOD LOGS ================= */

async function sendModLog(guild, action, moderator, target, reason, additionalFields = [], guildId) {
  if (!guildId) guildId = guild.id;
  const eventType = {
    mute: "memberMute", unmute: "memberUnmute", kick: "memberKick",
    ban: "memberBan", unban: "memberUnban", warn: "memberWarn",
  }[action] || action;

  const fields = [
    { name: "Moderator", value: `${moderator?.displayName || moderator?.globalName || moderator?.username || moderator?.tag || "Unknown"} (\`${moderator?.id || "unknown"}\`)` },
    { name: "Target", value: target || "Unknown" },
    { name: "Reason", value: reason || "No reason provided" },
    ...additionalFields.map(field => ({
      name: field.name || field.label || "Details",
      value: field.value ?? "-",
    })),
  ];
  await sendConfiguredLogging(guild, eventType, {
    guild,
    title: `${action.charAt(0).toUpperCase()}${action.slice(1)} Action`,
    actor: moderator,
    fields,
    icon: EMOJIS[action] || EMOJIS.soezy_info,
  });
}

/* ================= LOGGING FUNCTIONS ================= */

// Maps each event type to its log-channel category key
const LOG_EVENT_CATEGORY = {
  messageDelete: "message", messageEdit: "message",
  memberBan: "moderation", memberUnban: "moderation",
  memberKick: "moderation", memberMute: "moderation",
  memberUnmute: "moderation", memberWarn: "moderation",
  memberJoin: "joinLeave", memberLeave: "joinLeave",
  memberUpdate: "admin",
  inviteCreate: "invite", inviteDelete: "invite",
  voiceJoin: "voice", voiceLeave: "voice", voiceMove: "voice",
  roleCreate: "action", roleDelete: "action", roleUpdate: "action",
  channelCreate: "action", channelDelete: "action", channelUpdate: "action",
  emojiCreate: "action", emojiDelete: "action", emojiUpdate: "action",
  stickerCreate: "action", stickerDelete: "action", stickerUpdate: "action",
  webhookCreate: "action", webhookDelete: "action", webhookUpdate: "action",
  autoModerationRuleCreate: "action", autoModerationRuleDelete: "action", autoModerationRuleUpdate: "action", autoModerationActionExecution: "moderation",
  nicknameChange: "admin", guildUpdate: "admin",
};

const LOG_EVENT_TITLES = {
  messageDelete: "Message Deleted", messageEdit: "Message Edited",
  memberJoin: "Member Joined", memberLeave: "Member Left",
  memberUpdate: "Member Updated",
  memberBan: "Member Banned", memberUnban: "Member Unbanned",
  memberKick: "Member Kicked", memberMute: "Member Muted",
  memberUnmute: "Member Unmuted", memberWarn: "Member Warned",
  roleCreate: "Role Created", roleDelete: "Role Deleted", roleUpdate: "Role Updated",
  channelCreate: "Channel Created", channelDelete: "Channel Deleted", channelUpdate: "Channel Updated",
  emojiCreate: "Emoji Created", emojiDelete: "Emoji Deleted", emojiUpdate: "Emoji Updated",
  stickerCreate: "Sticker Created", stickerDelete: "Sticker Deleted", stickerUpdate: "Sticker Updated",
  webhookCreate: "Webhook Created", webhookDelete: "Webhook Deleted", webhookUpdate: "Webhook Updated",
  autoModerationRuleCreate: "AutoMod Rule Created", autoModerationRuleDelete: "AutoMod Rule Deleted",
  autoModerationRuleUpdate: "AutoMod Rule Updated", autoModerationActionExecution: "AutoMod Action Executed",
  voiceJoin: "Voice Joined", voiceLeave: "Voice Left", voiceMove: "Voice Moved",
  inviteCreate: "Invite Created", inviteDelete: "Invite Deleted",
  nicknameChange: "Nickname Changed", guildUpdate: "Server Updated",
};

async function sendLogEvent(guild, eventType, data = {}) {
  const allFields = Array.isArray(data.fields) ? data.fields.slice() : [];
  const options = {
    ...data,
    title: data.title || LOG_EVENT_TITLES[eventType] || eventType,
    fields: allFields,
    actor: data.actor || data.user || data.member || data.moderator || data.executor,
    guild,
    guildId: guild.id,
    media: data.attachments,
    components: [],
  };
  if (data.primaryName && !options.actor) {
    options.fields.unshift({
      name: data.primaryLabel || "User",
      value: data.primaryName,
    });
  }
  if (data.description) {
    options.fields.push({
      name: eventType === "messageDelete" ? "Message" : "Content",
      value: data.description,
    });
  }
  if (eventType === "messageEdit" && (data.editBefore !== undefined || data.editAfter !== undefined)) {
    options.fields.push(
      { name: "Before Edit", value: String(data.editBefore || "Empty").slice(0, 900) },
      { name: "After Edit", value: String(data.editAfter || "Empty").slice(0, 900) }
    );
  }
  if (eventType === "messageEdit" && data.jumpUrl && typeof ButtonBuilder !== "undefined") {
    options.components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Jump to Message").setStyle(ButtonStyle.Link).setURL(data.jumpUrl)
    ));
  }
  await sendConfiguredLogging(guild, eventType, options);
}

/* ================= ANTINUKE FUNCTIONS ================= */

async function handleAntiNukeAction(guild, userId, actionType) {
  if (globalThis.soezyEmergency?.auditDriven) return false;
  const guildId = guild.id;
  if (!guildData(guildId).antinuke.enabled) return false;

  const key = `${guild.id}-${userId}-${actionType}`;
  const now = Date.now();

  if (!antiNukeActions.has(key)) antiNukeActions.set(key, []);
  const actions = antiNukeActions.get(key);
  actions.push(now);

  const timeWindow = guildData(guildId).antinuke.timeWindow || 10000;
  const recentActions = actions.filter(time => now - time < timeWindow);
  antiNukeActions.set(key, recentActions);

  let maxActions;
  switch (actionType) {
    case "ban": maxActions = guildData(guildId).antinuke.maxBans || 3; break;
    case "kick": maxActions = guildData(guildId).antinuke.maxKicks || 3; break;
    case "channelDelete": maxActions = guildData(guildId).antinuke.maxChannelDelete || 3; break;
    case "channelCreate": maxActions = guildData(guildId).antinuke.maxChannelDelete || 3; break;
    case "roleDelete": maxActions = guildData(guildId).antinuke.maxRoleDelete || 3; break;
    case "roleCreate": maxActions = guildData(guildId).antinuke.maxRoleDelete || 3; break;
    case "massroleremove": maxActions = guildData(guildId).antinuke.maxRoleDelete || 3; break;
    case "permschange": maxActions = guildData(guildId).antinuke.maxChannelDelete || 3; break;
    default: maxActions = 3;
  }

  if (recentActions.length >= maxActions) {
    // Clear immediately so subsequent events in the same window don't
    // re-trigger punishment or queue multiple restore calls.
    antiNukeActions.delete(key);
    // Never punish the guild owner (Discord rejects it) or the bot itself.
    // Do this BEFORE the fetch so we never make a doomed API call and the
    // antinuke log is never sent with a false-positive "punishment applied".
    if (userId === guild.ownerId || userId === client.user.id) return false;
    try {
      const member = await guild.members.fetch(userId);
      const punishment = "ban";
      await member.ban({ reason: `Anti-Nuke: Excessive ${actionType} actions` });

      if (guildData(guildId).antinuke.logs) {
        const logChannel = guild.channels.cache.get(guildData(guildId).antinuke.logs);
        if (logChannel) {
          await sendLoggingContainer(logChannel, "antinuke", {
            guild,
            title: "Anti-Nuke Triggered",
            icon: EMOJIS.hmm,
            fields: [
              { name: "User", value: `<@${userId}> (\`${userId}\`)` },
              { name: "Action Type", value: actionType },
              { name: "Punishment", value: punishment },
              { name: "Actions in Window", value: `${recentActions.length}/${maxActions}` },
            ],
          }).catch(() => {});
        }
      }

      //  Auto-restore: if a snapshot exists, recreate deleted channels/roles 
      if (nukeSnapshots.has(guildId) && guildData(guildId).antinuke.autoRestore !== false) {
        // Wait briefly so all delete events settle before we restore
        setTimeout(async () => {
          try {
            // Only restore the type that was nuked
            const isChannelNuke = actionType === "channelDelete" || actionType === "channelCreate";
            const isRoleNuke = actionType === "roleDelete" || actionType === "roleCreate";
            const restoreOpts = {
              channels: isChannelNuke || (!isChannelNuke && !isRoleNuke),
              roles: isRoleNuke || (!isChannelNuke && !isRoleNuke),
              // After roles are recreated, also re-assign them to members
              memberRoles: isRoleNuke || (!isChannelNuke && !isRoleNuke),
            };
            // Run restore first (it re-fetches channels internally), then look up
            // the log channel AFTER so any deleted channels are back in cache.
            await restoreGuildFromSnapshot(guild, restoreOpts, null);
            const logChId = guildData(guildId).antinuke.logs;
            if (logChId) {
              await guild.channels.fetch().catch(() => { });
              const restoreLogCh = guild.channels.cache.get(logChId) || null;
              if (restoreLogCh) {
                const snap = nukeSnapshots.get(guildId);
                const age = snap ? Math.round((Date.now() - snap.takenAt) / 60000) : 0;
                await sendLoggingContainer(restoreLogCh, "antinuke-restore", {
                  guild,
                  title: "Anti-Nuke Auto-Restore Complete",
                  icon: EMOJIS.hmm,
                  fields: [
                    { name: "Triggered By", value: `\`${actionType}\` from <@${userId}> (\`${userId}\`)` },
                    { name: "Snapshot Age", value: `${age} min` },
                  ],
                }).catch(() => {});
              }
            }
          } catch { }
        }, 3000);
      }

      return true;
    } catch (err) {
      console.error("Anti-nuke punishment failed:", err);
    }
  }

  return false;
}

/* ================= ANTINUKE SNAPSHOT & RESTORE ================= */

/**
 * Capture the current state of all channels and roles in a guild.
 * Stored in-memory; refreshed every 30 min and on demand.
 */
async function takeGuildSnapshot(guild) {
  if (globalThis.soezyEmergency?.active(guild.id)) return false;
  try {
    await guild.channels.fetch();
    await guild.roles.fetch();

    const channels = guild.channels.cache.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      position: c.position,
      topic: c.topic || null,
      nsfw: c.nsfw || false,
      rateLimitPerUser: c.rateLimitPerUser || 0,
      parentId: c.parentId || null,
      bitrate: c.bitrate || null,
      userLimit: c.userLimit || null,
      permissionOverwrites: [...(c.permissionOverwrites?.cache?.values() || [])].map(ow => ({
        id: ow.id,
        type: ow.type,
        allow: ow.allow.bitfield.toString(),
        deny: ow.deny.bitfield.toString(),
      })),
    }));

    const roles = guild.roles.cache
      .filter(r => !r.managed && r.id !== guild.id) // skip @everyone & bot-managed roles
      .map(r => ({
        id: r.id,
        name: r.name,
        color: r.color,
        hoist: r.hoist,
        mentionable: r.mentionable,
        permissions: r.permissions.bitfield.toString(),
        position: r.position,
      }));

    //  Member roles snapshot 
    const allMembers = await guild.members.fetch().catch(() => new Map());
    const memberRoles = {};
    allMembers.forEach(m => {
      const nonDefault = m.roles.cache.filter(r => r.id !== guild.id).map(r => r.id);
      if (nonDefault.length > 0) memberRoles[m.id] = nonDefault;
    });

    //  Webhooks snapshot 
    const liveWebhooks = await guild.fetchWebhooks().catch(() => new Map());
    const webhookSnap = [...liveWebhooks.values()].map(wh => ({
      id: wh.id,
      name: wh.name,
      channelId: wh.channelId,
      avatarURL: wh.avatarURL() || null,
      token: wh.token || null,
    }));

    //  Server settings snapshot 
    const settings = {
      name: guild.name,
      verificationLevel: guild.verificationLevel,
      defaultMessageNotifications: guild.defaultMessageNotifications,
      explicitContentFilter: guild.explicitContentFilter,
      systemChannelId: guild.systemChannelId || null,
      afkChannelId: guild.afkChannelId || null,
      afkTimeout: guild.afkTimeout,
      rulesChannelId: guild.rulesChannelId || null,
      publicUpdatesChannelId: guild.publicUpdatesChannelId || null,
      safetyAlertsChannelId: guild.safetyAlertsChannelId || null,
      preferredLocale: guild.preferredLocale,
      iconURL: guild.iconURL({ dynamic: true }) || null,
    };

    if (globalThis.soezyEmergency?.active(guild.id)) return false;
    nukeSnapshots.set(guild.id, { channels, roles, memberRoles, webhooks: webhookSnap, settings, takenAt: Date.now() });
    return true;
  } catch (err) {
    console.error(`[AntiNuke Snapshot] Failed for ${guild.id}:`, err);
    return false;
  }
}

/**
 * Compare the stored snapshot to the current guild state and recreate
 * anything that is missing (deleted channels / deleted roles).
 * Also restores member roles, permission overwrites, webhooks, and server settings.
 * @param {import('discord.js').Guild} guild
 * @param {{ channels?: boolean, roles?: boolean, memberRoles?: boolean, perms?: boolean, webhooks?: boolean, settings?: boolean }} options
 * @param {import('discord.js').TextChannel|null} logChannel  – antinuke log channel
 */
async function restoreGuildFromSnapshot(guild, options = { channels: true, roles: true }, logChannel = null) {
  const snapshot = nukeSnapshots.get(guild.id);
  if (!snapshot) return { success: false, reason: "No snapshot found for this server. Run `antinuke snapshot` first." };

  const results = { channelsRestored: 0, rolesRestored: 0, membersRestored: 0, permsFixed: 0, webhooksRestored: 0, webhooksRemoved: 0, settingsRestored: false, errors: [] };
  const roleMap = snapshot.restoredRoleIds || (snapshot.restoredRoleIds = {});
  const channelMap = snapshot.restoredChannelIds || (snapshot.restoredChannelIds = {});
  const roleId = id => roleMap[id] || id;
  const channelId = id => channelMap[id] || id;
  const buildOverwrites = entries => entries.map(ow => {
    const id = ow.type === 0 ? roleId(ow.id) : ow.id;
    if (ow.type === 0 && !guild.roles.cache.has(id)) throw new Error(`Cannot safely restore permissions: role ${ow.id} is missing`);
    return { id, type: ow.type, allow: BigInt(ow.allow), deny: BigInt(ow.deny) };
  });

  //  1. Restore deleted roles 
  if (options.roles) {
    const currentRoleIds = new Set(guild.roles.cache.keys());
    for (const snap of snapshot.roles) {
      if (currentRoleIds.has(roleId(snap.id))) {
        const existing = guild.roles.cache.get(roleId(snap.id));
        if (existing?.editable) {
          const patch = {};
          if (snap.name !== undefined && existing.name !== snap.name) patch.name = snap.name;
          if (snap.color !== undefined && existing.color !== snap.color) patch.color = snap.color;
          if (snap.hoist !== undefined && existing.hoist !== snap.hoist) patch.hoist = snap.hoist;
          if (snap.mentionable !== undefined && existing.mentionable !== snap.mentionable) patch.mentionable = snap.mentionable;
          if (options.perms && snap.permissions !== undefined && existing.permissions.bitfield !== BigInt(snap.permissions)) patch.permissions = BigInt(snap.permissions);
          if (snap.position !== undefined && existing.position !== snap.position) patch.position = snap.position;
          if (Object.keys(patch).length) {
            patch.reason = "AntiNuke Restore: role settings";
            await existing.edit(patch)
              .then(() => { results.rolesRestored++; })
              .catch(err => results.errors.push(`Role settings ${snap.name}: ${err.message}`));
          }
        }
        continue;
      }
      try {
        const created = await guild.roles.create({
          name: snap.name,
          color: snap.color,
          hoist: snap.hoist,
          mentionable: snap.mentionable,
          permissions: BigInt(snap.permissions),
          position: snap.position,
          reason: "AntiNuke Restore: role deleted during nuke",
        });
        roleMap[snap.id] = created.id;
        currentRoleIds.add(created.id);
        results.rolesRestored++;
      } catch (err) {
        results.errors.push(`Role "${snap.name}": ${err.message}`);
      }
    }
  }

  //  2. Restore deleted channels 
  if (options.channels) {
    const currentChannelIds = new Set(guild.channels.cache.keys());

    // First pass – recreate categories (so children can nest under them)
    for (const snap of snapshot.channels) {
      if (snap.type !== ChannelType.GuildCategory) continue;
      if (currentChannelIds.has(channelId(snap.id))) continue;
      try {
        const created = await guild.channels.create({
          name: snap.name,
          type: ChannelType.GuildCategory,
          position: snap.position,
          permissionOverwrites: buildOverwrites(snap.permissionOverwrites),
          reason: "AntiNuke Restore: category deleted during nuke",
        });
        channelMap[snap.id] = created.id;
        currentChannelIds.add(created.id);
        results.channelsRestored++;
      } catch (err) {
        results.errors.push(`Category "#${snap.name}": ${err.message}`);
      }
    }

    // Re-fetch so we can find newly created categories by name
    await guild.channels.fetch().catch(() => { });

    // Second pass – recreate text, voice, forum, etc.
    for (const snap of snapshot.channels) {
      if (snap.type === ChannelType.GuildCategory) continue;
      if (currentChannelIds.has(channelId(snap.id))) continue;
      try {
        const createOpts = {
          name: snap.name,
          type: snap.type,
          position: snap.position,
          permissionOverwrites: buildOverwrites(snap.permissionOverwrites),
          reason: "AntiNuke Restore: channel deleted during nuke",
        };
        if (snap.topic) createOpts.topic = snap.topic;
        if (snap.nsfw) createOpts.nsfw = snap.nsfw;
        if (snap.rateLimitPerUser) createOpts.rateLimitPerUser = snap.rateLimitPerUser;
        if (snap.type === ChannelType.GuildVoice || snap.type === ChannelType.GuildStageVoice) {
          if (snap.bitrate) createOpts.bitrate = snap.bitrate;
          if (snap.userLimit) createOpts.userLimit = snap.userLimit;
        }
        // Use the exact remapped parent, never a same-name unrelated category.
        if (snap.parentId) {
          if (guild.channels.cache.has(channelId(snap.parentId))) {
            createOpts.parent = channelId(snap.parentId);
          } else {
            throw new Error(`Parent category ${snap.parentId} could not be restored`);
          }
        }
        const created = await guild.channels.create(createOpts);
        channelMap[snap.id] = created.id;
        currentChannelIds.add(created.id);
        results.channelsRestored++;
      } catch (err) {
        results.errors.push(`Channel "#${snap.name}": ${err.message}`);
      }
    }

    for (const snap of snapshot.channels) {
      const channel = guild.channels.cache.get(channelId(snap.id));
      if (!channel?.editable) continue;
      const patch = {};
      if (snap.name !== undefined && channel.name !== snap.name) patch.name = snap.name;
      if (snap.topic !== undefined && "topic" in channel && channel.topic !== snap.topic) patch.topic = snap.topic;
      if (snap.nsfw !== undefined && "nsfw" in channel && channel.nsfw !== snap.nsfw) patch.nsfw = snap.nsfw;
      if (snap.rateLimitPerUser !== undefined && "rateLimitPerUser" in channel && channel.rateLimitPerUser !== snap.rateLimitPerUser) patch.rateLimitPerUser = snap.rateLimitPerUser;
      if (snap.position !== undefined && channel.position !== snap.position) patch.position = snap.position;
      if (snap.parentId !== undefined) {
        const desiredParent = snap.parentId ? channelId(snap.parentId) : null;
        if (channel.parentId !== desiredParent) patch.parent = desiredParent;
      }
      if ("bitrate" in channel && snap.bitrate && channel.bitrate !== snap.bitrate) patch.bitrate = snap.bitrate;
      if ("userLimit" in channel && snap.userLimit !== null && channel.userLimit !== snap.userLimit) patch.userLimit = snap.userLimit;
      if (Object.keys(patch).length) {
        patch.reason = "AntiNuke Restore: channel settings";
        await channel.edit(patch)
          .catch(err => results.errors.push(`Channel settings #${snap.name}: ${err.message}`));
      }
    }
  }

  //  3. Restore member roles 
  if (options.memberRoles && snapshot.memberRoles) {
    await guild.members.fetch().catch(() => { });
    for (const [memberId, roleIds] of Object.entries(snapshot.memberRoles)) {
      if (options.excludedMembers?.has(memberId)) continue;
      try {
        const member = guild.members.cache.get(memberId);
        if (!member) continue;
        const toAdd = roleIds.map(roleId).filter(rid => guild.roles.cache.has(rid) && !member.roles.cache.has(rid));
        if (toAdd.length > 0) {
          await member.roles.add(toAdd, "AntiNuke Restore: member roles");
          results.membersRestored++;
        }
      } catch (err) {
        results.errors.push(`Member ${memberId} roles: ${err.message}`);
      }
    }
  }

  //  4. Fix permission overwrites on existing channels 
  if (options.perms && snapshot.channels) {
    for (const snap of snapshot.channels) {
      const ch = guild.channels.cache.get(channelId(snap.id));
      if (!ch || !snap.permissionOverwrites) continue;
      try {
        await ch.permissionOverwrites.set(
          buildOverwrites(snap.permissionOverwrites),
          "AntiNuke Restore: permission overwrites"
        );
        results.permsFixed++;
      } catch (err) {
        results.errors.push(`Perms "#${snap.name}": ${err.message}`);
      }
    }
  }

  //  5. Webhook restore 
  if (options.webhooks && snapshot.webhooks) {
    try {
      const liveHooks = await guild.fetchWebhooks().catch(() => new Map());
      // Delete any webhook that wasn't in the snapshot (spam webhooks)
      for (const [, wh] of liveHooks) {
        const wasLegit = snapshot.webhooks.find(s => s.id === wh.id);
        if (!wasLegit) {
          await wh.delete("AntiNuke Restore: spam webhook removed").catch(() => { });
          results.webhooksRemoved++;
        }
      }
      // Recreate missing legit webhooks
      for (const snap of snapshot.webhooks) {
        if (liveHooks.has(snap.id)) continue;
        const ch = guild.channels.cache.get(snap.channelId);
        if (!ch?.isTextBased()) continue;
        try {
          const opts = { name: snap.name, reason: "AntiNuke Restore: webhook recreated" };
          if (snap.avatarURL) opts.avatar = snap.avatarURL;
          await ch.createWebhook(opts);
          results.webhooksRestored++;
        } catch (err) {
          results.errors.push(`Webhook "${snap.name}": ${err.message}`);
        }
      }
    } catch (err) {
      results.errors.push(`Webhooks: ${err.message}`);
    }
  }

  //  6. Server settings restore 
  if (options.settings && snapshot.settings) {
    try {
      const s = snapshot.settings;
      const patch = {};
      if (s.name && guild.name !== s.name) patch.name = s.name;
      if (s.verificationLevel !== undefined) patch.verificationLevel = s.verificationLevel;
      if (s.defaultMessageNotifications !== undefined) patch.defaultMessageNotifications = s.defaultMessageNotifications;
      if (s.explicitContentFilter !== undefined) patch.explicitContentFilter = s.explicitContentFilter;
      if (s.systemChannelId !== undefined && guild.systemChannelId !== channelId(s.systemChannelId)) patch.systemChannel = s.systemChannelId ? channelId(s.systemChannelId) : null;
      if (s.afkChannelId !== undefined && guild.afkChannelId !== channelId(s.afkChannelId)) patch.afkChannel = s.afkChannelId ? channelId(s.afkChannelId) : null;
      if (s.afkTimeout !== undefined && guild.afkTimeout !== s.afkTimeout) patch.afkTimeout = s.afkTimeout;
      if (s.rulesChannelId !== undefined && guild.rulesChannelId !== channelId(s.rulesChannelId)) patch.rulesChannel = s.rulesChannelId ? channelId(s.rulesChannelId) : null;
      if (s.publicUpdatesChannelId !== undefined && guild.publicUpdatesChannelId !== channelId(s.publicUpdatesChannelId)) patch.publicUpdatesChannel = s.publicUpdatesChannelId ? channelId(s.publicUpdatesChannelId) : null;
      if (s.safetyAlertsChannelId !== undefined && guild.safetyAlertsChannelId !== channelId(s.safetyAlertsChannelId)) patch.safetyAlertsChannel = s.safetyAlertsChannelId ? channelId(s.safetyAlertsChannelId) : null;
      if (s.preferredLocale !== undefined && guild.preferredLocale !== s.preferredLocale) patch.preferredLocale = s.preferredLocale;
      if (Object.keys(patch).length > 0) {
        patch.reason = "AntiNuke Restore: server settings";
        await guild.edit(patch);
        results.settingsRestored = true;
      }
    } catch (err) {
      results.errors.push(`Server settings: ${err.message}`);
    }
  }

  if (logChannel) {
    const age = Math.round((Date.now() - snapshot.takenAt) / 60000);
    const bottomFields = [
      results.channelsRestored ? { label: 'Channels Restored', value: `\`${results.channelsRestored}\`` } : null,
      results.rolesRestored ? { label: 'Roles Restored', value: `\`${results.rolesRestored}\`` } : null,
      results.membersRestored ? { label: 'Members Re-roled', value: `\`${results.membersRestored}\`` } : null,
      results.permsFixed ? { label: 'Channel Perms Fixed', value: `\`${results.permsFixed}\`` } : null,
      results.webhooksRemoved ? { label: 'Spam Webhooks Removed', value: `\`${results.webhooksRemoved}\`` } : null,
      results.webhooksRestored ? { label: 'Webhooks Recreated', value: `\`${results.webhooksRestored}\`` } : null,
      results.settingsRestored ? { label: 'Server Settings', value: 'Restored' } : null,
      results.errors.length ? { label: `Errors (${results.errors.length})`, value: results.errors.slice(0, 5).map(e => `> ${e}`).join('\n') } : null,
      { label: 'Snapshot Age', value: `${age} min` },
    ].filter(Boolean);
    await sendLoggingContainer(logChannel, "antinuke-restore", {
      guild: logChannel.guild,
      title: "Anti-Nuke Restore Complete",
      icon: EMOJIS.hmm,
      fields: bottomFields.map(field => ({ name: field.label, value: field.value })),
    }).catch(() => {});
  }

  return { success: true, ...results };
}

/* ================= WARNING SYSTEM ================= */

function addWarning(guildId, userId, moderatorId, reason) {
  if (!guildData(guildId).warnings[guildId]) guildData(guildId).warnings[guildId] = {};
  if (!guildData(guildId).warnings[guildId][userId]) guildData(guildId).warnings[guildId][userId] = [];

  const warning = {
    id: Date.now().toString(),
    moderator: moderatorId,
    reason: reason,
    timestamp: Date.now()
  };

  guildData(guildId).warnings[guildId][userId].push(warning);
  saveDB();
  return warning;
}

function removeWarning(guildId, userId, warnId) {
  if (!guildData(guildId).warnings[guildId]?.[userId]) return false;

  const index = guildData(guildId).warnings[guildId][userId].findIndex(w => w.id === warnId);
  if (index === -1) return false;

  guildData(guildId).warnings[guildId][userId].splice(index, 1);
  saveDB();
  return true;
}

function getWarnings(guildId, userId) {
  return guildData(guildId).warnings[guildId]?.[userId] || [];
}

function clearWarnings(guildId, userId) {
  if (!guildData(guildId).warnings[guildId]?.[userId]) return 0;
  const count = guildData(guildId).warnings[guildId][userId].length;
  guildData(guildId).warnings[guildId][userId] = [];
  saveDB();
  return count;
}
