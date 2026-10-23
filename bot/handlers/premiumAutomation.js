"use strict";

(() => {
  if (globalThis.__soezyPremiumAutomationLoaded) return;
  globalThis.__soezyPremiumAutomationLoaded = true;

  const { AuditLogEvent, PermissionsBitField, ChannelType } = require("discord.js");
  const PLAN_RANK = { plus: 1, pro: 2, ultra: 3 };
  const MIN_PLAN = {
    raidmode: "plus", webhookguard: "plus", botguard: "plus", joinshield: "plus", actionlog: "plus",
    workflow: "plus", autorole: "plus", autoping: "plus", autoreplypro: "plus", welcome: "plus",
    roleguard: "pro", trustscore: "pro", alertrole: "pro", autothread: "pro", cleanup: "pro",
    restore: "ultra", panic: "ultra",
  };
  const RISK_WEIGHTS = {
    [AuditLogEvent.RoleCreate]: 12,
    [AuditLogEvent.RoleDelete]: 25,
    [AuditLogEvent.RoleUpdate]: 20,
    [AuditLogEvent.ChannelDelete]: 25,
    [AuditLogEvent.ChannelUpdate]: 12,
    [AuditLogEvent.WebhookCreate]: 18,
    [AuditLogEvent.BotAdd]: 18,
    [AuditLogEvent.MemberBanAdd]: 12,
    [AuditLogEvent.MemberKick]: 8,
    [AuditLogEvent.AutoModerationRuleDelete]: 15,
    [AuditLogEvent.GuildUpdate]: 15,
  };
  const RISK_NAMES = new Map(Object.entries({
    [AuditLogEvent.RoleCreate]: "role-create",
    [AuditLogEvent.RoleDelete]: "role-delete",
    [AuditLogEvent.RoleUpdate]: "role-update",
    [AuditLogEvent.ChannelDelete]: "channel-delete",
    [AuditLogEvent.ChannelUpdate]: "channel-update",
    [AuditLogEvent.WebhookCreate]: "webhook-create",
    [AuditLogEvent.BotAdd]: "bot-add",
    [AuditLogEvent.MemberBanAdd]: "member-ban",
    [AuditLogEvent.MemberKick]: "member-kick",
    [AuditLogEvent.AutoModerationRuleDelete]: "automod-rule-delete",
    [AuditLogEvent.GuildUpdate]: "server-settings",
  }).map(([action, name]) => [Number(action), name]));
  const recentAlerts = new Map();
  const recentAutoReplies = new Map();
  const restoreConfirmations = new Map();
  const cleanupInFlight = new Set();

  function ensureStore(guildId) {
    const gd = guildData(guildId);
    gd.premiumTools ||= {};
    gd.premiumTools.workflows ||= [];
    gd.premiumTools.autoroleConditions ||= [];
    gd.premiumTools.autoPings ||= [];
    gd.premiumTools.autoReplies ||= [];
    gd.premiumTools.security ||= {};
    gd.premiumTools.cleanup ||= [];
    return gd.premiumTools;
  }

  function planFor(msg) {
    if (typeof getPlanKey !== "function") return { key: "", rank: 0 };
    const userPlan = getPlanKey(msg.author.id, msg.guild.id);
    const serverPlan = getPlanKey(null, msg.guild.id);
    const key = (PLAN_RANK[serverPlan] || 0) > (PLAN_RANK[userPlan] || 0) ? serverPlan : userPlan;
    return { key: PLAN_RANK[key] ? key : "", rank: PLAN_RANK[key] || 0 };
  }

  function authorized(msg) {
    return (typeof isAuthorized === "function" && isAuthorized(msg, msg.guild.id)) ||
      (typeof canManageSecurityFeature === "function" && canManageSecurityFeature(msg.guild, msg.author.id, "premium"));
  }

  function isTrustedPremiumOwner(msg) {
    return msg.guild?.ownerId === msg.author.id ||
      config.ownerIds?.map(String).includes(String(msg.author.id)) ||
      db.devUsers?.map(String).includes(String(msg.author.id)) ||
      (typeof canManageSecurityFeature === "function" && canManageSecurityFeature(msg.guild, msg.author.id, "premium"));
  }

  function entitled(msg, feature, minPlan = MIN_PLAN[feature] || "plus") {
    const isBotOwner = config.ownerIds?.includes(msg.author.id) || db.devUsers?.includes(msg.author.id);
    if (isBotOwner) return true;
    if (typeof hasAnyPremium !== "function" || !hasAnyPremium(msg.author.id, msg.guild.id)) return false;
    return planFor(msg).rank >= (PLAN_RANK[minPlan] || 1);
  }

  function roleLimit(msg) {
    return planFor(msg).key === "ultra" ? Infinity : planFor(msg).key === "pro" ? 20 : 3;
  }

  function workflowLimit(msg) {
    return planFor(msg).key === "ultra" ? Infinity : planFor(msg).key === "pro" ? 15 : 5;
  }

  function pingLimit(msg) {
    return planFor(msg).key === "ultra" ? Infinity : planFor(msg).key === "pro" ? 5 : 1;
  }

  function replyLimit(msg) {
    return planFor(msg).key === "ultra" ? Infinity : planFor(msg).key === "pro" ? 20 : 5;
  }

  function safeText(value, max = 1000) {
    return String(value || "").replace(/@everyone/gi, "@ everyone").replace(/@here/gi, "@ here").slice(0, max);
  }

  function reply(msg, kind, title, body) {
    const builder = kind === "error" ? createErrorContainer : kind === "success" ? createSuccessContainer : createInfoContainer;
    return msg.reply({
      components: [builder(title, body)],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  }

  function flag(msg, value) {
    return ["on", "enable", "enabled", "true"].includes(String(value || "").toLowerCase()) ? true
      : ["off", "disable", "disabled", "false"].includes(String(value || "").toLowerCase()) ? false : null;
  }

  function canManageBotRole(guild, role) {
    const me = guild.members.me;
    return !!(role && !role.managed && role.id !== guild.id && role.editable && me?.permissions.has(PermissionsBitField.Flags.ManageRoles));
  }

  function canAutomateRole(guild, role) {
    if (!canManageBotRole(guild, role)) return false;
    const dangerous = [
      PermissionsBitField.Flags.Administrator,
      PermissionsBitField.Flags.ManageGuild,
      PermissionsBitField.Flags.ManageRoles,
      PermissionsBitField.Flags.ManageChannels,
      PermissionsBitField.Flags.BanMembers,
      PermissionsBitField.Flags.KickMembers,
      PermissionsBitField.Flags.ManageWebhooks,
    ];
    return !role.permissions.any(dangerous);
  }

  function renderTemplate(text, guild, user = null) {
    return safeText(text)
      .replaceAll("{server}", guild.name)
      .replaceAll("{user}", user ? `<@${user.id}>` : "")
      .replaceAll("{username}", user?.username || "")
      .replaceAll("{membercount}", String(guild.memberCount || 0));
  }

  async function runWelcomeTest(msg) {
    const gd = guildData(msg.guild.id);
    const w = gd.welcome || {};
    const requester = msg.member || await msg.guild.members.fetch(msg.author.id).catch(() => null);
    const userAvatar = requester?.displayAvatarURL?.({ forceStatic: false, size: 256 }) || msg.author.displayAvatarURL({ forceStatic: false, size: 256 });
    const botAvatar = typeof getBotAvatar === "function" ? getBotAvatar(msg.guild.id, 256) : client.user?.displayAvatarURL({ extension: "png", size: 256 }) || "";
    const replace = raw => String(raw || "")
      .replace(/{user}/g, msg.author.toString())
      .replace(/{username}/g, msg.author.username)
      .replace(/{tag}/g, msg.author.tag || msg.author.username)
      .replace(/{server}/g, msg.guild.name)
      .replace(/{membercount}/g, String(msg.guild.memberCount || 0))
      .replace(/{userid}/g, msg.author.id)
      .replace(/{user_avatar}/g, userAvatar)
      .replace(/{server_icon}/g, msg.guild.iconURL({ forceStatic: false }) || "")
      .replace(/{server_avatar}/g, msg.guild.iconURL({ forceStatic: false }) || "")
      .replace(/{bot_avatar}/g, botAvatar);
    const text = replace(w.message || "Welcome {user} to {server}!");
    if (w.embedEnabled === false) {
      return msg.reply({ content: `${text}\n-# Preview only — no welcome message was sent to the server.`, allowedMentions: { users: [msg.author.id] } });
    }
    const embed = createEmbed({
      author: w.authorText ? replace(w.authorText) : undefined,
      authorIcon: w.authorIcon ? replace(w.authorIcon) : undefined,
      description: text,
      thumbnail: w.thumbnail ? replace(w.thumbnail) : undefined,
      color: w.color ?? getThemeColor(msg.guild.id),
      footer: w.footer ? { text: replace(w.footer), iconURL: w.footerIcon ? replace(w.footerIcon) : undefined } : undefined,
      image: w.image ? replace(w.image) : undefined,
      fields: w.fields?.length ? w.fields.map(f => ({ name: replace(f.name), value: replace(f.value) })) : undefined,
      timestamp: false,
    });
    return msg.reply({
      content: `${w.title ? replace(w.title) : `${EMOJIS.happy} Welcome ${msg.author}`}\n-# Preview only — no welcome message was sent to the server.`,
      embeds: [embed],
      allowedMentions: { users: [msg.author.id] },
    });
  }

  async function configureSecurity(msg, key, action, extra) {
    const gd = guildData(msg.guild.id);
    const tools = ensureStore(msg.guild.id);
    if (!action || action === "status") {
      const states = {
        raidmode: `**Raid mode:** ${gd.antiRaid?.enabled ? "ON" : "OFF"} · ${gd.antiRaid?.threshold || 10} joins / ${Math.round((gd.antiRaid?.interval || 10000) / 1000)}s · ${gd.antiRaid?.action || "kick"}`,
        roleguard: `**Role Guard:** ${tools.security.roleGuard ? "ON" : "OFF"}`,
        webhookguard: `**Webhook Guard:** ${gd.security?.webhookGuard ? "ON" : "OFF"}`,
        botguard: `**Bot Guard:** ${gd.antibot?.enabled ? "ON" : "OFF"} · ${gd.antibot?.action || "kick"}`,
        joinshield: `**Join Shield:** ${gd.accountAge?.enabled ? "ON" : "OFF"} · ${gd.accountAge?.minDays || 7} day minimum · ${gd.accountAge?.action || "kick"}`,
        alertrole: `**Alert role:** ${tools.security.alertRoleId ? `<@&${tools.security.alertRoleId}>` : "not set"}`,
      };
      return reply(msg, "info", "Premium Security Settings", states[key] || "No status available.");
    }
    const enable = flag(msg, action);
    if (key === "raidmode") {
      if (enable === null) return reply(msg, "error", "Usage", `\`${getPrefix(msg.guild.id)}premium raidmode on [joins] [seconds] [kick|ban]\` or \`${getPrefix(msg.guild.id)}premium raidmode off\``);
      gd.antiRaid ||= { threshold: 10, interval: 10000, action: "kick", joins: [] };
      const previouslyEnabled = gd.antiRaid.enabled === true;
      gd.antiRaid.enabled = enable;
      if (enable) {
        const threshold = Number(extra[0] || gd.antiRaid.threshold || 10);
        const seconds = Number(extra[1] || Math.round((gd.antiRaid.interval || 10000) / 1000));
        const actionType = String(extra[2] || gd.antiRaid.action || "kick").toLowerCase();
        if (!Number.isInteger(threshold) || threshold < 2 || threshold > 100 || !Number.isInteger(seconds) || seconds < 5 || seconds > 60 || !["kick", "ban"].includes(actionType)) {
          gd.antiRaid.enabled = previouslyEnabled;
          return reply(msg, "error", "Invalid Raid Settings", "Use 2–100 joins, a 5–60 second window, and `kick` or `ban`. No setting was enabled.");
        }
        gd.antiRaid.threshold = threshold;
        gd.antiRaid.interval = seconds * 1000;
        gd.antiRaid.action = actionType;
        gd.antiRaid.joins = [];
        gd.antiRaid.logs ||= gd.antinuke?.logs || gd.security?.logs || msg.guild.systemChannelId || null;
        if (typeof setFeatureState === "function") setFeatureState(msg.guild.id, "antinuke", true, { client, refreshPanels: false });
        if (typeof setFeatureState === "function") setFeatureState(msg.guild.id, "antiraid", true, { client, refreshPanels: false });
      } else if (typeof setFeatureState === "function") {
        setFeatureState(msg.guild.id, "antiraid", false, { client, refreshPanels: false });
      }
      saveDB(msg.guild.id);
      return reply(msg, "success", `Raid Mode ${enable ? "Enabled" : "Disabled"}`, enable
        ? `Raid mode now reacts to **${gd.antiRaid.threshold} joins in ${gd.antiRaid.interval / 1000}s** with **${gd.antiRaid.action}**. It only applies to members who are not on the Anti-Raid whitelist.`
        : "The join-burst response is off. Other Anti-Nuke protection settings are unchanged.");
    }
    if (["roleguard", "webhookguard", "botguard", "joinshield"].includes(key)) {
      if (enable === null) return reply(msg, "error", "Usage", `Use \`${getPrefix(msg.guild.id)}premium ${key} on\`, \`${getPrefix(msg.guild.id)}premium ${key} off\`, or \`${getPrefix(msg.guild.id)}premium ${key} status\`.`);
      const value = String(extra[0] || "").toLowerCase();
      if (key === "roleguard") {
        gd.antinuke ||= {};
        gd.antinuke.events ||= {};
        for (const eventName of ["antirolecreate", "antiroledelete", "antipermschange", "antiroleupdate", "antimassroleremove"]) gd.antinuke.events[eventName] = enable;
        if (enable) {
          gd.antinuke.logs ||= gd.security?.logs || msg.guild.systemChannelId || null;
          if (typeof setFeatureState === "function") setFeatureState(msg.guild.id, "antinuke", true, { client, refreshPanels: false });
          tools.security.roleGuard = true;
        } else tools.security.roleGuard = false;
      } else if (key === "webhookguard") {
        gd.security ||= {};
        gd.security.webhookGuard = enable;
        gd.antinuke ||= {};
        gd.antinuke.events ||= {};
        for (const eventName of ["antiwebhookcreate", "antiwebhookdelete", "antiwebhookupdate"]) gd.antinuke.events[eventName] = enable;
        if (enable && typeof setFeatureState === "function") {
          gd.antinuke.logs ||= gd.security?.logs || msg.guild.systemChannelId || null;
          setFeatureState(msg.guild.id, "automod", true, { client, refreshPanels: false });
          setFeatureState(msg.guild.id, "antinuke", true, { client, refreshPanels: false });
        }
      } else if (key === "botguard") {
        const selected = ["kick", "ban"].includes(value) ? value : gd.antibot?.action || "kick";
        gd.antibot ||= {};
        gd.antibot.action = selected;
        if (typeof setFeatureState === "function") {
          if (enable) {
            gd.antibot.joinLogs ||= gd.security?.logs || msg.guild.systemChannelId || null;
            setFeatureState(msg.guild.id, "automod", true, { client, refreshPanels: false });
          }
          setFeatureState(msg.guild.id, "antibot", enable, { client, refreshPanels: false });
        } else gd.antibot.enabled = enable;
      } else if (key === "joinshield") {
        const days = Number(extra[0] || gd.accountAge?.minDays || 7);
        const punishment = String(extra[1] || gd.accountAge?.action || "kick").toLowerCase();
        if (enable && (!Number.isInteger(days) || days < 1 || days > 365 || !["kick", "ban"].includes(punishment))) {
          return reply(msg, "error", "Invalid Join Shield Settings", "Use an account age from 1–365 days and punishment `kick` or `ban`.");
        }
        gd.accountAge ||= {};
        gd.accountAge.minDays = days;
        gd.accountAge.action = punishment;
        if (typeof setFeatureState === "function") {
          if (enable) {
            gd.accountAge.logs ||= gd.security?.logs || msg.guild.systemChannelId || null;
            setFeatureState(msg.guild.id, "automod", true, { client, refreshPanels: false });
          }
          setFeatureState(msg.guild.id, "accountage", enable, { client, refreshPanels: false });
        } else gd.accountAge.enabled = enable;
      }
      saveDB(msg.guild.id);
      return reply(msg, "success", `${key[0].toUpperCase()}${key.slice(1)} ${enable ? "Enabled" : "Disabled"}`,
        key === "webhookguard" ? `${enable ? "Webhook-change detection and Anti-Nuke webhook event handling are on." : "Webhook-change detection is off."} Burst containment still depends on the configured Anti-Nuke thresholds.`
          : key === "roleguard" ? `${enable ? "Role creation, deletion, dangerous permission grants, role edits, and mass role changes are monitored." : "Role Guard event checks are off."} Dangerous changes follow the server’s Anti-Nuke thresholds and whitelist.`
            : key === "botguard" ? `${enable ? `Unauthorized bot joins are ${gd.antibot.action}ed.` : "Anti-Bot is off."} Configure allowed bot users with the existing Anti-Bot whitelist.`
              : `${enable ? `Accounts younger than ${gd.accountAge.minDays} days are ${gd.accountAge.action}ed.` : "The account-age join check is off."} Existing AutoMod filters remain as configured.`);
    }
    if (key === "alertrole") {
      if (["off", "remove", "clear"].includes(String(action).toLowerCase())) {
        tools.security.alertRoleId = null;
        saveDB(msg.guild.id);
        return reply(msg, "success", "Security Alert Role Removed", "Security audit alerts will no longer notify a role.");
      }
      const role = msg.mentions.roles.first() || await resolveRole(msg, action);
      if (!role || role.id === msg.guild.id || role.managed) return reply(msg, "error", "Role Needed", `Usage: \`${getPrefix(msg.guild.id)}premium alertrole set @role\``);
      tools.security.alertRoleId = role.id;
      saveDB(msg.guild.id);
      const canPing = role.mentionable || msg.guild.members.me?.permissions.has(PermissionsBitField.Flags.MentionEveryone);
      return reply(msg, "success", "Security Alert Role Set", `<@&${role.id}> will be included in security incident alerts${canPing ? " and can be pinged" : "; make the role mentionable or grant the bot Mention Everyone to allow pings"}.`);
    }
    return false;
  }

  async function actionLog(msg, count = 12) {
    const limit = Math.max(1, Math.min(20, Number(count) || 12));
    if (!msg.member?.permissions?.has(PermissionsBitField.Flags.ViewAuditLog)) {
      return reply(msg, "error", "Your Audit Log Permission Is Needed", "Discord requires **View Audit Log** to read your server action timeline.");
    }
    if (!msg.guild.members.me?.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) {
      return reply(msg, "error", "Audit Log Permission Needed", "Give the bot **View Audit Log** to read this server’s action timeline.");
    }
    try {
      const logs = await msg.guild.fetchAuditLogs({ limit });
      const now = Date.now();
      const lines = [...logs.entries.values()].slice(0, limit).map(entry => {
        const name = RISK_NAMES.get(entry.action) || `audit-event-${entry.action}`;
        const age = Math.max(0, Math.floor((now - entry.createdTimestamp) / 1000));
        const target = entry.target?.tag || entry.target?.name || entry.target?.id || "unknown target";
        return `• <t:${Math.floor(entry.createdTimestamp / 1000)}:R> **${name}** — ${entry.executor ? `<@${entry.executor.id}>` : "unknown actor"} → ${safeText(target, 70)} (\`${age}s\` ago)`;
      });
      return reply(msg, "info", `Security Action Log · ${lines.length}`, lines.join("\n").slice(0, 3500) || "No recent audit entries were returned by Discord.");
    } catch (error) {
      return reply(msg, "error", "Audit Log Unavailable", `Discord did not return audit entries: ${safeText(error.message, 180)}. Check the bot permission and try again.`);
    }
  }

  async function trustScore(msg, args) {
    const action = String(args[0] || "").toLowerCase();
    const tools = ensureStore(msg.guild.id);
    const weights = tools.trustWeights ||= {};
    if (action === "set") {
      const key = String(args[1] || "").toLowerCase();
      const weight = Number(args[2]);
      if (!Object.values(RISK_NAMES).includes(key) || !Number.isInteger(weight) || weight < 1 || weight > 100) {
        return reply(msg, "error", "Usage", `\`${getPrefix(msg.guild.id)}premium trustscore set <${[...RISK_NAMES.values()].join("|")}> <1-100>\``);
      }
      weights[key] = weight;
      saveDB(msg.guild.id);
      return reply(msg, "success", "Trust Score Weight Saved", `The 24-hour risk weight for **${key}** is now **${weight}** points.`);
    }
    const member = msg.mentions.members.first() || (args[0] ? await resolveMember(msg, args[0]) : null);
    if (!member) return reply(msg, "error", "Member Needed", `Usage: \`${getPrefix(msg.guild.id)}premium trustscore @member\` or \`${getPrefix(msg.guild.id)}premium trustscore set <action> <1-100>\`.`);
    if (!msg.member?.permissions?.has(PermissionsBitField.Flags.ViewAuditLog)) return reply(msg, "error", "Your Audit Log Permission Is Needed", "Discord requires **View Audit Log** to calculate activity risk.");
    if (!msg.guild.members.me?.permissions.has(PermissionsBitField.Flags.ViewAuditLog)) return reply(msg, "error", "Audit Log Permission Needed", "Give the bot **View Audit Log** to calculate activity risk.");
    if (member.id === msg.guild.ownerId) return reply(msg, "info", "Trust Score", `**${member.user.tag}** · **100 / 100** trusted\nThe server owner is exempt from activity risk scoring.`);
    try {
      const logs = await msg.guild.fetchAuditLogs({ limit: 100 });
      const recent = [...logs.entries.values()].filter(entry => entry.executorId === member.id && Date.now() - entry.createdTimestamp <= 86400000 && RISK_NAMES.has(entry.action));
      const breakdown = new Map();
      let risk = 0;
      for (const entry of recent) {
        const name = RISK_NAMES.get(entry.action);
        const weight = Number(weights[name] || RISK_WEIGHTS[entry.action] || 5);
        risk += weight;
        breakdown.set(name, (breakdown.get(name) || 0) + 1);
      }
      const trust = Math.max(0, 100 - Math.min(100, risk));
      const details = [...breakdown].map(([name, n]) => `• ${name}: ${n} × ${weights[name] || "default"}`).join("\n") || "No matching security-sensitive audit actions in the last 24 hours.";
      return reply(msg, "info", `Trust Score · ${member.user.tag}`, `**${trust} / 100** trust · ${risk} risk points\nBased only on the latest 100 audit entries from the past 24 hours.\n\n${details}`);
    } catch (error) {
      return reply(msg, "error", "Trust Score Unavailable", `Could not read audit history: ${safeText(error.message, 180)}.`);
    }
  }

  async function restoreCommand(msg, args) {
    const action = String(args[0] || "status").toLowerCase();
    const snap = typeof nukeSnapshots !== "undefined" ? nukeSnapshots.get(msg.guild.id) : null;
    if (action === "snapshot") {
      const ok = await takeGuildSnapshot(msg.guild);
      return reply(msg, ok ? "success" : "error", ok ? "Snapshot Captured" : "Snapshot Failed", ok ? "The current supported server state is saved in the bot’s in-memory recovery snapshot." : "A snapshot could not be captured. Check the bot’s role, channel, member, and webhook permissions.");
    }
    if (!snap) return reply(msg, "error", "No Recovery Snapshot", `Run \`${getPrefix(msg.guild.id)}premium restore snapshot\` before a destructive event, or use the existing Anti-Nuke snapshot schedule.`);
    if (action !== "confirm") {
      const ageMin = Math.max(0, Math.floor((Date.now() - snap.takenAt) / 60000));
      const code = Math.random().toString(36).slice(2, 7).toUpperCase();
      restoreConfirmations.set(`${msg.guild.id}:${msg.author.id}`, { code, expiresAt: Date.now() + 5 * 60_000 });
      return reply(msg, "info", "Restore Preview · Confirmation Required", `Snapshot age: **${ageMin} minutes** · ${snap.channels?.length || 0} channels · ${snap.roles?.length || 0} roles.\n\nRestore may recreate deleted roles/channels, adjust permissions, reassign member roles, remove webhooks not present in the snapshot, and restore supported guild settings. Type \`${getPrefix(msg.guild.id)}premium restore confirm ${code}\` within 5 minutes to proceed.`);
    }
    const pending = restoreConfirmations.get(`${msg.guild.id}:${msg.author.id}`);
    if (!pending || pending.expiresAt < Date.now() || String(args[1] || "").toUpperCase() !== pending.code) return reply(msg, "error", "Confirmation Invalid", `Run \`${getPrefix(msg.guild.id)}premium restore\` again to review the current snapshot and get a fresh confirmation code.`);
    restoreConfirmations.delete(`${msg.guild.id}:${msg.author.id}`);
    const result = await restoreGuildFromSnapshot(msg.guild, { channels: true, roles: true, memberRoles: true, perms: true, webhooks: true, settings: true }, null);
    if (!result.success) return reply(msg, "error", "Restore Failed", result.reason || "No restore was completed.");
    saveDB(msg.guild.id);
    return reply(msg, result.errors?.length ? "info" : "success", result.errors?.length ? "Restore Partially Completed" : "Restore Completed",
      `Channels recreated: **${result.channelsRestored}** · roles restored: **${result.rolesRestored}** · member role sets updated: **${result.membersRestored}** · webhooks removed/restored: **${result.webhooksRemoved}/${result.webhooksRestored}** · settings restored: **${result.settingsRestored ? "yes" : "no"}**${result.errors?.length ? `\n\nErrors (${result.errors.length}): ${result.errors.slice(0, 3).map(e => safeText(e, 150)).join("; ")}` : ""}`);
  }

  async function panicCommand(msg, args) {
    const action = String(args[0] || "status").toLowerCase();
    const gd = guildData(msg.guild.id);
    gd.premiumTools ||= {};
    gd.premiumTools.security ||= {};
    if (action === "status") return reply(msg, "info", "Panic Mode", `Emergency lockdown is **${gd.premiumTools.security.panicActive ? "ON" : "OFF"}**. It changes the server verification level; it does not ban members or delete content.`);
    const enable = flag(msg, action);
    if (enable === null) return reply(msg, "error", "Usage", `Use \`${getPrefix(msg.guild.id)}premium panic on\`, \`${getPrefix(msg.guild.id)}premium panic off\`, or \`${getPrefix(msg.guild.id)}premium panic status\`.`);
    try {
      if (enable) {
        if (!gd.premiumTools.security.panicActive) gd.premiumTools.security.previousVerificationLevel = msg.guild.verificationLevel;
        await msg.guild.setVerificationLevel(4, `Premium Panic activated by ${msg.author.tag}`);
        gd.security ||= {};
        gd.security.lockdown = true;
        gd.premiumTools.security.panicActive = true;
      } else {
        const previous = Number.isInteger(gd.premiumTools.security.previousVerificationLevel) ? gd.premiumTools.security.previousVerificationLevel : 0;
        await msg.guild.setVerificationLevel(previous, `Premium Panic lifted by ${msg.author.tag}`);
        gd.security ||= {};
        gd.security.lockdown = false;
        gd.premiumTools.security.panicActive = false;
      }
      saveDB(msg.guild.id);
      return reply(msg, "success", `Panic Mode ${enable ? "Enabled" : "Disabled"}`, enable
        ? `Highest verification is enabled to slow new joins. Existing member access and content were not changed. Use \`${getPrefix(msg.guild.id)}premium panic off\` to restore the previous verification level.`
        : "The server’s previous verification level has been restored.");
    } catch (error) {
      return reply(msg, "error", "Panic Mode Failed", safeText(error.message, 240));
    }
  }

  async function workflowCommand(msg, args) {
    const tools = ensureStore(msg.guild.id);
    const action = String(args[0] || "").toLowerCase();
    const list = tools.workflows;
    const find = id => list.find(item => item.id.toLowerCase() === String(id || "").toLowerCase());
    if (action === "list") {
      return reply(msg, "info", `Workflows · ${list.length}`, list.map(item => `• \`${item.id}\` · ${item.enabled ? "active" : "paused"} · ${item.event}${item.match ? ` (${safeText(item.match, 36)})` : ""} → ${item.action.type}`).join("\n") || "No workflows saved yet.");
    }
    if (action === "create") {
      const parts = args.slice(1).join(" ").split("|").map(v => v.trim());
      if (parts.length < 3) return reply(msg, "error", "Usage", `\`${getPrefix(msg.guild.id)}premium workflow create <join|leave|boost|message keyword> | <send #channel|role @role|reply> | <text>\``);
      const eventParts = parts[0].toLowerCase().split(/\s+/);
      let event = eventParts[0];
      if (event === "member_join") event = "join";
      if (event === "member_leave") event = "leave";
      if (event === "message") event = "message";
      if (!["join", "leave", "boost", "message"].includes(event)) return reply(msg, "error", "Invalid Event", "Supported triggers: `join`, `leave`, `boost`, or `message <keyword>`.");
      const match = event === "message" ? eventParts.slice(1).join(" ").trim().toLowerCase() : "";
      if (event === "message" && !match) return reply(msg, "error", "Keyword Needed", "Add a message keyword after `message` so the workflow does not run on every message.");
      const body = safeText(parts[2], 1200);
      const actionText = parts[1].toLowerCase();
      let workflowAction;
      if (actionText.startsWith("send ")) {
        const channel = msg.mentions.channels.first() || await resolveChannel(msg, parts[1].slice(5).trim());
        if (!channel?.isTextBased?.()) return reply(msg, "error", "Text Channel Needed", "Select an accessible text channel after `send`.");
        workflowAction = { type: "send", channelId: channel.id, text: body };
      } else if (actionText.startsWith("role ")) {
        if (event !== "join") return reply(msg, "error", "Role Action Not Valid", "Role assignment is only available on the `join` trigger.");
        const role = msg.mentions.roles.first() || await resolveRole(msg, parts[1].slice(5).trim());
        if (!canAutomateRole(msg.guild, role)) return reply(msg, "error", "Role Not Safe to Automate", "Choose a non-managed, non-privileged role below the bot’s top role. The bot also needs Manage Roles.");
        workflowAction = { type: "role", roleId: role.id };
      } else if (actionText === "reply" && event === "message") {
        workflowAction = { type: "reply", text: body };
      } else return reply(msg, "error", "Invalid Action", "Use `send #channel`, `role @role` for join events, or `reply` for a keyword message event.");
      if (list.length >= workflowLimit(msg)) return reply(msg, "error", "Workflow Limit Reached", `Your ${planFor(msg).key || "Plus"} plan supports ${workflowLimit(msg)} workflows. Upgrade for more capacity.`);
      const id = `wf-${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 4)}`;
      list.push({ id, event, match, action: workflowAction, enabled: true, createdAt: Date.now(), createdBy: msg.author.id });
      saveDB(msg.guild.id);
      return reply(msg, "success", "Workflow Created", `Saved workflow \`${id}\`: **${event}**${match ? ` when a message contains “${safeText(match, 50)}”` : ""} → **${workflowAction.type}**. It is active now. Use \`${getPrefix(msg.guild.id)}premium workflow test ${id}\` for a no-side-effect dry run.`);
    }
    if (action === "pause" || action === "resume") {
      const item = find(args[1]);
      if (!item) return reply(msg, "error", "Workflow Not Found", `Use \`${getPrefix(msg.guild.id)}premium workflow list\` to see workflow IDs.`);
      item.enabled = action === "resume";
      saveDB(msg.guild.id);
      return reply(msg, "success", `Workflow ${action === "pause" ? "Paused" : "Resumed"}`, `\`${item.id}\` is ${item.enabled ? "active" : "paused"}.`);
    }
    if (action === "test") {
      const item = find(args[1]);
      if (!item) return reply(msg, "error", "Workflow Not Found", `Use \`${getPrefix(msg.guild.id)}premium workflow list\` to see workflow IDs.`);
      const target = item.action.type === "send" ? `<#${item.action.channelId}>` : item.action.type === "role" ? `<@&${item.action.roleId}>` : "the triggering message";
      return reply(msg, "info", `Workflow Dry Run · ${item.id}`, `Would react to **${item.event}**${item.match ? ` containing “${safeText(item.match, 50)}”` : ""}, then **${item.action.type}** to ${target}.\n\nNo message, role, or channel was changed.`);
    }
    return reply(msg, "error", "Workflow Help", `\`${getPrefix(msg.guild.id)}premium workflow create <event> | <action> | <text>\`\n\`${getPrefix(msg.guild.id)}premium workflow list\`\n\`${getPrefix(msg.guild.id)}premium workflow pause <id>\`\n\`${getPrefix(msg.guild.id)}premium workflow test <id>\`\nUse \`resume <id>\` to reactivate a paused workflow.`);
  }

  async function autoroleCommand(msg, args) {
    const tools = ensureStore(msg.guild.id);
    if (String(args[0] || "").toLowerCase() !== "condition") return reply(msg, "error", "Usage", `Use \`${getPrefix(msg.guild.id)}premium autorole condition add @role human|bot|age>=days\`, \`list\`, or \`remove @role\`.`);
    const action = String(args[1] || "list").toLowerCase();
    const list = tools.autoroleConditions;
    if (action === "list") return reply(msg, "info", `Conditional Auto-Roles · ${list.length}`, list.map(item => `• <@&${item.roleId}> when ${item.condition.type === "age" ? `account age ≥ ${item.condition.days} days` : `member is ${item.condition.type}`}`).join("\n") || "No conditions configured.");
    const role = msg.mentions.roles.first() || await resolveRole(msg, args[2]);
    if (!role) return reply(msg, "error", "Role Needed", `Usage: \`${getPrefix(msg.guild.id)}premium autorole condition add @role human|bot|age>=days\`.`);
    if (action === "remove") {
      const before = list.length;
      tools.autoroleConditions = list.filter(item => item.roleId !== role.id);
      saveDB(msg.guild.id);
      return reply(msg, "success", "Auto-Role Condition Removed", before === tools.autoroleConditions.length ? "No condition was stored for that role." : `Removed the condition for <@&${role.id}>.`);
    }
    if (action !== "add") return reply(msg, "error", "Usage", `Use \`${getPrefix(msg.guild.id)}premium autorole condition add @role human|bot|age>=days\`, \`list\`, or \`remove @role\`.`);
    if (!canAutomateRole(msg.guild, role)) return reply(msg, "error", "Role Not Safe to Automate", "Choose a non-managed, non-privileged role below the bot’s top role. The bot also needs Manage Roles.");
    const conditionText = args.slice(3).join("").toLowerCase();
    let condition;
    if (["human", "bot"].includes(conditionText)) condition = { type: conditionText };
    else {
      const ageMatch = /^(?:age>=|age:)(\d{1,3})$/.exec(conditionText);
      if (ageMatch && Number(ageMatch[1]) >= 1 && Number(ageMatch[1]) <= 365) condition = { type: "age", days: Number(ageMatch[1]) };
    }
    if (!condition) return reply(msg, "error", "Condition Not Supported", "Choose `human`, `bot`, or `age>=1` through `age>=365`.");
    const existing = list.find(item => item.roleId === role.id);
    if (!existing && list.length >= roleLimit(msg)) return reply(msg, "error", "Condition Limit Reached", `Your plan supports ${roleLimit(msg)} conditional roles.`);
    if (existing) existing.condition = condition;
    else list.push({ roleId: role.id, condition });
    saveDB(msg.guild.id);
    return reply(msg, "success", "Auto-Role Condition Saved", `<@&${role.id}> will be assigned to a joining member when **${condition.type === "age" ? `their account is at least ${condition.days} days old` : `they are a ${condition.type}`}**.`);
  }

  async function autoThreadCommand(msg, args) {
    const tools = ensureStore(msg.guild.id);
    const action = String(args[0] || "status").toLowerCase();
    if (action === "off" || action === "disable" || action === "remove") {
      tools.autoThread = null;
      saveDB(msg.guild.id);
      return reply(msg, "success", "Auto-Thread Disabled", "Automatic discussion threads are off.");
    }
    if (action === "status" || !action) return reply(msg, "info", "Auto-Thread", tools.autoThread ? `On for <#${tools.autoThread.channelId}> · name template: \`${safeText(tools.autoThread.nameTemplate, 70)}\`` : `Off. Set it with \`${getPrefix(msg.guild.id)}premium autothread set #channel [name template]\`.`);
    if (action !== "set") return reply(msg, "error", "Usage", `\`${getPrefix(msg.guild.id)}premium autothread set #channel [name template]\` or \`${getPrefix(msg.guild.id)}premium autothread off\`.`);
    const channel = msg.mentions.channels.first() || await resolveChannel(msg, args[1]);
    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return reply(msg, "error", "Text Channel Needed", "Choose a server text or announcement channel.");
    const nameTemplate = safeText(args.slice(2).join(" ") || "{username} · discussion", 100);
    tools.autoThread = { channelId: channel.id, nameTemplate, enabled: true, updatedAt: Date.now() };
    saveDB(msg.guild.id);
    return reply(msg, "success", "Auto-Thread Enabled", `New human-authored posts in <#${channel.id}> will get a thread named from \`${nameTemplate}\`. The bot needs **Create Public Threads** and **Send Messages in Threads** there.`);
  }

  async function autoPingCommand(msg, args) {
    const tools = ensureStore(msg.guild.id);
    const action = String(args[0] || "list").toLowerCase();
    const pings = tools.autoPings;
    if (action === "list") return reply(msg, "info", `Scheduled Role Reminders · ${pings.length}`, pings.map(p => `• \`${p.id}\` <@&${p.roleId}> in <#${p.channelId}> · every ${p.hours}h · ${p.enabled ? "active" : "paused"}`).join("\n") || "No scheduled reminders yet.");
    if (["remove", "delete"].includes(action)) {
      const id = args[1];
      const before = pings.length;
      tools.autoPings = pings.filter(p => p.id !== id);
      saveDB(msg.guild.id);
      return reply(msg, "success", "Reminder Removed", before === tools.autoPings.length ? "That reminder ID was not found." : `Removed reminder \`${id}\`.`);
    }
    if (action !== "add") return reply(msg, "error", "Usage", `\`${getPrefix(msg.guild.id)}premium autoping add @role #channel <hours> | <message>\`\n\`${getPrefix(msg.guild.id)}premium autoping list\`\n\`${getPrefix(msg.guild.id)}premium autoping remove <id>\``);
    const [settingText, messageText] = args.slice(1).join(" ").split("|").map(x => x.trim());
    const role = msg.mentions.roles.first();
    const channel = msg.mentions.channels.first();
    const hoursToken = settingText?.split(/\s+/).filter(token => !/^<[@#]/.test(token)).at(-1)?.match(/^(\d{1,3}(?:\.\d+)?)h?$/i)?.[1];
    const hours = Number(hoursToken);
    if (!role || !channel?.isTextBased?.() || !Number.isFinite(hours) || hours < 1 || hours > 720 || !messageText) return reply(msg, "error", "Reminder Details Needed", `Use: \`${getPrefix(msg.guild.id)}premium autoping add @role #channel 24h | Please check the weekly update\`. Intervals: 1–720 hours.`);
    if (pings.length >= pingLimit(msg)) return reply(msg, "error", "Reminder Limit Reached", `Your plan supports ${pingLimit(msg)} scheduled reminder(s).`);
    const id = `ping-${Date.now().toString(36).slice(-5)}`;
    pings.push({ id, roleId: role.id, channelId: channel.id, hours, text: safeText(messageText, 1500), enabled: true, nextAt: Date.now() + hours * 3600000, createdBy: msg.author.id });
    saveDB(msg.guild.id);
    return reply(msg, "success", "Scheduled Reminder Added", `\`${id}\` will send to <#${channel.id}> and mention only <@&${role.id}> every **${hours} hour(s)**. Use \`${getPrefix(msg.guild.id)}premium autoping list\` or \`remove ${id}\` to manage it.`);
  }

  async function cleanupCommand(msg, args) {
    const tools = ensureStore(msg.guild.id);
    const action = String(args[0] || "list").toLowerCase();
    if (action === "list") return reply(msg, "info", `Scheduled Cleanup · ${tools.cleanup.length}`, tools.cleanup.map(c => `• <#${c.channelId}> · bot posts older than ${c.ageHours}h · ${c.enabled ? "active" : "paused"}`).join("\n") || "No cleanup schedules yet.");
    if (action === "off" || action === "remove") {
      const channel = msg.mentions.channels.first() || await resolveChannel(msg, args[1]);
      const before = tools.cleanup.length;
      tools.cleanup = channel ? tools.cleanup.filter(c => c.channelId !== channel.id) : [];
      saveDB(msg.guild.id);
      return reply(msg, "success", "Cleanup Schedule Removed", before === tools.cleanup.length ? "No matching cleanup schedule was found." : channel ? `Removed cleanup for <#${channel.id}>.` : "Removed all cleanup schedules.");
    }
    if (action !== "set") return reply(msg, "error", "Usage", `\`${getPrefix(msg.guild.id)}premium cleanup set #channel <age-hours>\`\n\`${getPrefix(msg.guild.id)}premium cleanup list\`\n\`${getPrefix(msg.guild.id)}premium cleanup off #channel\``);
    const channel = msg.mentions.channels.first() || await resolveChannel(msg, args[1]);
    const ageHours = Number(args[2]);
    if (!channel?.isTextBased?.() || !Number.isInteger(ageHours) || ageHours < 24 || ageHours > 312) return reply(msg, "error", "Cleanup Bounds", "Select a text channel and an age from **24–312 hours** (up to 13 days; Discord bulk deletion cannot remove older posts). Only bot-authored, unpinned messages are eligible.");
    const current = tools.cleanup.find(c => c.channelId === channel.id);
    if (!current && tools.cleanup.length >= (planFor(msg).key === "ultra" ? Infinity : 3)) return reply(msg, "error", "Cleanup Limit Reached", "Plus/Pro plans support 3 scheduled channels; Ultra supports unlimited channels.");
    if (current) { current.ageHours = ageHours; current.nextAt = Date.now() + 3600000; current.enabled = true; }
    else tools.cleanup.push({ channelId: channel.id, ageHours, enabled: true, nextAt: Date.now() + 3600000 });
    saveDB(msg.guild.id);
    return reply(msg, "success", "Cleanup Schedule Saved", `Every hour the bot will remove eligible **bot-authored, unpinned** posts older than **${ageHours} hours** in <#${channel.id}>. It will never sweep member-authored posts.`);
  }

  async function autoReplyCommand(msg, args) {
    const tools = ensureStore(msg.guild.id);
    const action = String(args[0] || "list").toLowerCase();
    const list = tools.autoReplies;
    if (action === "list") return reply(msg, "info", `Conditional Auto-Replies · ${list.length}`, list.map(item => `• \`${safeText(item.trigger, 40)}\` → ${item.cooldownSeconds}s cooldown${item.channelId ? ` · <#${item.channelId}>` : ""}${item.roleId ? ` · role <@&${item.roleId}>` : ""}`).join("\n") || "No premium auto-replies configured.");
    if (["remove", "delete"].includes(action)) {
      const trigger = args.slice(1).join(" ").toLowerCase();
      const before = list.length;
      tools.autoReplies = list.filter(item => item.trigger !== trigger);
      saveDB(msg.guild.id);
      return reply(msg, "success", "Auto-Reply Removed", before === tools.autoReplies.length ? "That trigger was not found." : `Removed \`${safeText(trigger, 80)}\`.`);
    }
    if (action !== "add") return reply(msg, "error", "Usage", `\`${getPrefix(msg.guild.id)}premium autoreplypro add <trigger> | <response> | cooldown=60 | channel=#general | role=@Members\`\n\`${getPrefix(msg.guild.id)}premium autoreplypro list\`\n\`${getPrefix(msg.guild.id)}premium autoreplypro remove <trigger>\``);
    const parts = args.slice(1).join(" ").split("|").map(x => x.trim());
    if (parts.length < 2 || !parts[0] || !parts[1]) return reply(msg, "error", "Trigger and Reply Needed", `Use \`${getPrefix(msg.guild.id)}premium autoreplypro add <trigger> | <response> | cooldown=60\`.`);
    const trigger = safeText(parts[0], 100).toLowerCase();
    const guild = guildData(msg.guild.id);
    if (guild.autoresponder?.triggers?.[trigger] || guild.globalAutoResponders?.[trigger]) return reply(msg, "error", "Trigger Already Used", "That trigger already belongs to the standard autoresponder. Remove or rename it before adding an advanced rule.");
    const options = Object.fromEntries(parts.slice(2).map(s => { const i = s.indexOf("="); return i > 0 ? [s.slice(0, i).trim().toLowerCase(), s.slice(i + 1).trim()] : ["", ""]; }).filter(([k]) => k));
    const cooldownSeconds = Number(options.cooldown || 60);
    if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 5 || cooldownSeconds > 86400) return reply(msg, "error", "Invalid Cooldown", "Choose a cooldown from 5 to 86,400 seconds.");
    const channel = options.channel ? (msg.mentions.channels.first() || await resolveChannel(msg, options.channel)) : null;
    const role = options.role ? (msg.mentions.roles.first() || await resolveRole(msg, options.role)) : null;
    if ((options.channel && !channel?.isTextBased?.()) || (options.role && (!role || role.id === msg.guild.id || role.managed))) return reply(msg, "error", "Invalid Condition", "The channel and role conditions must refer to channels and roles in this server.");
    if (list.length >= replyLimit(msg)) return reply(msg, "error", "Auto-Reply Limit Reached", `Your plan supports ${replyLimit(msg)} advanced replies.`);
    const existing = list.find(item => item.trigger === trigger);
    const record = { trigger, response: safeText(parts[1], 1500), cooldownSeconds, channelId: channel?.id || null, roleId: role?.id || null, enabled: true };
    if (existing) Object.assign(existing, record); else list.push(record);
    saveDB(msg.guild.id);
    return reply(msg, "success", "Conditional Auto-Reply Saved", `When a message contains \`${trigger}\`${channel ? ` in <#${channel.id}>` : ""}${role ? ` from a member with <@&${role.id}>` : ""}, reply with the saved text, at most once per member every **${cooldownSeconds}s**. Mentions in the response are not pinged.`);
  }

  async function addAutoPing(msg, ping) {
    const channel = client.channels.cache.get(ping.channelId);
    if (!channel?.isTextBased?.()) return false;
    const text = renderTemplate(ping.text, channel.guild || msg.guild, { id: ping.roleId, username: "members" });
    const role = channel.guild?.roles.cache.get(ping.roleId);
    const canPing = role && (role.mentionable || channel.guild.members.me?.permissions.has(PermissionsBitField.Flags.MentionEveryone));
    await channel.send({
      content: `${canPing ? `<@&${ping.roleId}> ` : ""}${text}`.slice(0, 1900),
      allowedMentions: canPing ? { parse: [], roles: [ping.roleId] } : { parse: [] },
    });
    return true;
  }

  function conditionMatches(condition, member) {
    if (condition.type === "human") return !member.user.bot;
    if (condition.type === "bot") return member.user.bot;
    if (condition.type === "age") return Date.now() - member.user.createdTimestamp >= condition.days * 86400000;
    return false;
  }

  async function executeWorkflow(guild, workflow, context) {
    const action = workflow.action;
    if (action.type === "role" && context.member) {
      const role = await guild.roles.fetch(action.roleId).catch(() => null);
      if (canAutomateRole(guild, role)) await context.member.roles.add(role, `Premium workflow ${workflow.id}`);
      return;
    }
    if (action.type === "send") {
      const channel = await guild.channels.fetch(action.channelId).catch(() => null);
      if (!channel?.isTextBased?.()) return;
      await channel.send({ content: renderTemplate(action.text, guild, context.user), allowedMentions: { users: context.user?.id ? [context.user.id] : [], parse: [] } });
      return;
    }
    if (action.type === "reply" && context.message) {
      await context.message.reply({ content: renderTemplate(action.text, guild, context.user), allowedMentions: { users: context.user?.id ? [context.user.id] : [], parse: [] } });
    }
  }

  async function dispatchWorkflows(guild, event, context) {
    const list = ensureStore(guild.id).workflows;
    const messageContent = String(context.message?.content || "").toLowerCase();
    for (const workflow of list) {
      if (!workflow.enabled || workflow.event !== event) continue;
      if (event === "message" && (!workflow.match || !messageContent.includes(workflow.match))) continue;
      try { await executeWorkflow(guild, workflow, context); }
      catch (error) { console.warn(`[PREMIUM WORKFLOW] guild=${guild.id} id=${workflow.id}: ${error.message}`); }
    }
  }

  async function handlePremiumAutoReplyMessage(message) {
    if (!message?.guild || message.author?.bot || message.webhookId || message.content.startsWith(getPrefix(message.guild.id))) return false;
    const tools = ensureStore(message.guild.id);
    const now = Date.now();
    const content = message.content.toLowerCase();
    for (const rule of tools.autoReplies) {
      if (!rule.enabled || !content.includes(rule.trigger)) continue;
      if (rule.channelId && rule.channelId !== message.channel.id) continue;
      if (rule.roleId && !message.member?.roles.cache.has(rule.roleId)) continue;
      const key = `${message.guild.id}:${rule.trigger}:${message.author.id}`;
      if ((recentAutoReplies.get(key) || 0) > now) continue;
      recentAutoReplies.set(key, now + rule.cooldownSeconds * 1000);
      await message.reply({ content: renderTemplate(rule.response, message.guild, message.author), allowedMentions: { parse: [] } }).catch(error => console.warn(`[AUTOREPLY PRO] guild=${message.guild.id}: ${error.message}`));
      return true;
    }
    return false;
  }

  async function processSchedules() {
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
      const tools = ensureStore(guild.id);
      for (const ping of tools.autoPings) {
        if (!ping.enabled || ping.nextAt > now) continue;
        ping.nextAt = now + ping.hours * 3600000;
        saveDB(guild.id);
        try { await addAutoPing(null, ping); }
        catch (error) { console.warn(`[AUTO PING] guild=${guild.id} id=${ping.id}: ${error.message}`); }
      }
      for (const cleanup of tools.cleanup) {
        const key = `${guild.id}:${cleanup.channelId}`;
        if (!cleanup.enabled || cleanup.nextAt > now || cleanupInFlight.has(key)) continue;
        cleanup.nextAt = now + 3600000;
        saveDB(guild.id);
        cleanupInFlight.add(key);
        try {
          const channel = await guild.channels.fetch(cleanup.channelId).catch(() => null);
          if (!channel?.isTextBased?.() || typeof channel.bulkDelete !== "function") continue;
          const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
          if (!messages) continue;
          const cutoff = now - cleanup.ageHours * 3600000;
          const eligible = messages.filter(message => message.author?.id === client.user.id && !message.pinned && message.createdTimestamp < cutoff && now - message.createdTimestamp < 14 * 86400000);
          if (eligible.size) await channel.bulkDelete(eligible, true);
        } catch (error) { console.warn(`[AUTO CLEANUP] guild=${guild.id} channel=${cleanup.channelId}: ${error.message}`); }
        finally { cleanupInFlight.delete(key); }
      }
    }
  }

  async function handlePremiumToolCommand(msg, args) {
    const key = String(args[0] || "").toLowerCase();
    if (!Object.hasOwn(MIN_PLAN, key)) return false;
    if (!msg.guild) { await reply(msg, "error", "Server Only", "Premium server tools can only be configured inside a server."); return true; }
    if (!authorized(msg)) { await reply(msg, "error", "Manage Server Required", "Only the server owner, a server manager, a configured bot owner, or an authorized ExtraOwner can manage these tools."); return true; }
    if (!entitled(msg, key)) {
      const required = MIN_PLAN[key].toUpperCase();
      await reply(msg, "error", `${required} Plan Required`, `This command is included from the **${required}** plan. Check \`${getPrefix(msg.guild.id)}premium plans\` for plan details. Existing core security protections remain available regardless of these premium tools.`);
      return true;
    }
    const rest = args.slice(1);
    try {
    if (["raidmode", "roleguard", "webhookguard", "botguard", "joinshield", "alertrole"].includes(key)) {
      await configureSecurity(msg, key, rest[0]?.toLowerCase(), rest.slice(1));
      return true;
    }
    if (key === "actionlog") { await actionLog(msg, rest[0]); return true; }
    if (key === "trustscore") { await trustScore(msg, rest); return true; }
    if (key === "workflow") { await workflowCommand(msg, rest); return true; }
    if (key === "autorole") { await autoroleCommand(msg, rest); return true; }
    if (key === "autothread") { await autoThreadCommand(msg, rest); return true; }
    if (key === "autoping") { await autoPingCommand(msg, rest); return true; }
    if (key === "cleanup") { await cleanupCommand(msg, rest); return true; }
    if (key === "autoreplypro") { await autoReplyCommand(msg, rest); return true; }
    if (key === "welcome") {
      if (String(rest[0] || "").toLowerCase() !== "test") await reply(msg, "error", "Usage", `Use \`${getPrefix(msg.guild.id)}premium welcome test\` to preview the saved welcome message.`);
      else await runWelcomeTest(msg);
      return true;
    }
    if (key === "restore") {
      const ownerOnly = isTrustedPremiumOwner(msg);
      if (!ownerOnly) { await reply(msg, "error", "Server Owner Required", "Snapshot restore changes roles, channels, webhooks, and server settings. Only the server owner, an authorized ExtraOwner, or bot owner can run it."); return true; }
      await restoreCommand(msg, rest);
      return true;
    }
    if (key === "panic") {
      const ownerOnly = isTrustedPremiumOwner(msg);
      if (!ownerOnly) { await reply(msg, "error", "Server Owner Required", "Only the server owner, an authorized ExtraOwner, or bot owner can turn emergency lockdown on or off."); return true; }
      await panicCommand(msg, rest);
      return true;
    }
    } catch (error) {
      console.error(`[PREMIUM COMMAND] ${key} guild=${msg.guild.id}: ${error.message}`);
      await reply(msg, "error", "Premium Command Failed", `Could not complete that command: ${safeText(error.message, 240)}`);
      return true;
    }
    return false;
  }

  globalThis.handleSoezyPremiumToolCommand = handlePremiumToolCommand;
  globalThis.handleSoezyPremiumAutoReplyMessage = handlePremiumAutoReplyMessage;

  client.on("guildMemberAdd", async member => {
    const tools = ensureStore(member.guild.id);
    for (const item of tools.autoroleConditions) {
      if (!conditionMatches(item.condition, member)) continue;
      const role = await member.guild.roles.fetch(item.roleId).catch(() => null);
      if (!canAutomateRole(member.guild, role) || member.roles.cache.has(role.id)) continue;
      await member.roles.add(role, "Premium conditional autorole").catch(error => console.warn(`[PREMIUM AUTOROLE] guild=${member.guild.id}: ${error.message}`));
    }
    await dispatchWorkflows(member.guild, "join", { member, user: member.user });
  });

  client.on("guildMemberRemove", member => {
    void dispatchWorkflows(member.guild, "leave", { user: member.user }).catch(error => console.warn(`[PREMIUM WORKFLOW] leave: ${error.message}`));
  });

  client.on("guildMemberUpdate", (oldMember, newMember) => {
    if (!oldMember.premiumSince && newMember.premiumSince) void dispatchWorkflows(newMember.guild, "boost", { member: newMember, user: newMember.user }).catch(error => console.warn(`[PREMIUM WORKFLOW] boost: ${error.message}`));
  });

  client.on("messageCreate", async message => {
    if (!message.guild || message.author.bot || message.webhookId || message.content.startsWith(getPrefix(message.guild.id))) return;
    const tools = ensureStore(message.guild.id);
    const threadConfig = tools.autoThread;
    if (threadConfig?.enabled && threadConfig.channelId === message.channel.id && !message.hasThread && message.channel.type !== ChannelType.GuildForum) {
      const canCreate = message.channel.permissionsFor(client.user)?.has(PermissionsBitField.Flags.CreatePublicThreads) && message.channel.permissionsFor(client.user)?.has(PermissionsBitField.Flags.SendMessagesInThreads);
      if (canCreate) {
        const name = safeText(threadConfig.nameTemplate.replaceAll("{username}", message.author.username).replaceAll("{server}", message.guild.name), 100) || "Discussion";
        await message.startThread({ name, autoArchiveDuration: 1440, reason: "Premium auto-thread" }).catch(error => console.warn(`[AUTO THREAD] guild=${message.guild.id}: ${error.message}`));
      }
    }
    await dispatchWorkflows(message.guild, "message", { message, user: message.author });
  });

  client.on("guildAuditLogEntryCreate", async (entry, guild) => {
    if (!guild || !entry?.id) return;
    const tools = ensureStore(guild.id);
    const roleId = tools.security.alertRoleId;
    const webhookGuard = entry.action === AuditLogEvent.WebhookCreate && guildData(guild.id).security?.webhookGuard === true;
    if ((!roleId && !webhookGuard) || (!RISK_NAMES.has(entry.action) && !webhookGuard) || entry.executorId === client.user.id) return;
    if (entry.executorId === guild.ownerId) return;
    const isWhitelisted = entry.executorId && typeof isAntiNukeWhitelisted === "function"
      ? await isAntiNukeWhitelisted(entry.executorId, guild.id).catch(() => false)
      : false;
    if (isWhitelisted) return;
    const previous = recentAlerts.get(entry.id);
    if (previous && Date.now() - previous < 5 * 60_000) return;
    recentAlerts.set(entry.id, Date.now());
    const auditChannelId = guildData(guild.id).antinuke?.logs || guildData(guild.id).security?.logs;
    const channel = (auditChannelId ? guild.channels.cache.get(auditChannelId) : null) || (roleId || webhookGuard ? guild.systemChannel : null);
    if (!channel?.isTextBased?.()) return;
    const role = guild.roles.cache.get(roleId);
    const canPing = role && (role.mentionable || guild.members.me?.permissions.has(PermissionsBitField.Flags.MentionEveryone));
    const actor = entry.executorId ? `<@${entry.executorId}>` : "Unknown actor";
    const target = entry.target?.id ? ` · target \`${entry.target.id}\`` : "";
    const title = webhookGuard ? "Unauthorized webhook created" : `Security event ${RISK_NAMES.get(entry.action) || "audit-change"}`;
    const rolePrefix = canPing ? `<@&${roleId}> ` : "";
    await channel.send({
      content: `${rolePrefix}**${title}** by ${actor}${target}.${webhookGuard ? " Check the creator’s permissions and remove the webhook if it was not approved." : ""}`,
      allowedMentions: canPing ? { parse: [], roles: [roleId], users: entry.executorId ? [entry.executorId] : [] } : { parse: [] },
    }).catch(error => console.warn(`[SECURITY ALERT] guild=${guild.id}: ${error.message}`));
  });

  const scheduleTimer = setInterval(() => void processSchedules().catch(error => console.warn(`[PREMIUM SCHEDULES] ${error.message}`)), 30000);
  scheduleTimer.unref?.();
})();
