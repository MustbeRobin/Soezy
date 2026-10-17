// ── Singleton guard: only register these event listeners once ───────────────
// If the VM sandbox re-executes this file (e.g. hot reload, dual require),
// we skip registration so no listener is bound a second time.
if (typeof globalThis.__soezyFeatureEventsLoaded === "undefined") {
globalThis.__soezyFeatureEventsLoaded = true;

const featureSecurityPremiumActive = guildId => {
  return !!guildId;
};

/* ================= GUILD CREATE EVENT ================= */
client.on("guildCreate", async guild => {
  console.log(`[GUILD]    Joined: ${guild.name} (${guild.id})`);
  const guildId = guild.id;

  const SUPPORT_SERVER_INVITE = "JRWtxxWASy";
  const BOT_INVITE_URL = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;

  // ── Find who actually added the bot via audit log ──
  let adder = null;
  try {
    await new Promise(r => setTimeout(r, 2000)); // brief wait for audit log to register
    const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 });
    const entry = auditLogs.entries.find(e => e.target?.id === client.user.id);
    if (entry?.executor) adder = entry.executor;
  } catch {}

  // Fall back to guild owner if audit log failed
  let owner = null;
  try { owner = await guild.fetchOwner(); } catch {}

  const adderUser  = adder  || owner?.user  || null;
  const adderMent  = adderUser ? `<@${adderUser.id}>` : "someone";
  const adderName  = adderUser?.username ?? "Unknown";

  // ── DM whoever added the bot ──
  if (adderUser) {
    try {
      const dmContainer = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `<a:info:1559656193637617754> **Ty for inviting ${client.user.username}!**`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `Ready to help in **${guild.name}**. Let's get started!\n\n` +
            `**Prefix:** \`${getPrefix(guildId)}\`\n` +
            `**Help:** \`${getPrefix(guildId)}help\` or \`/help\``
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `Need a hand? Join our **[Support Server](https://discord.gg/${SUPPORT_SERVER_INVITE})**.`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel("Support Server")
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.gg/${SUPPORT_SERVER_INVITE}`),
            new ButtonBuilder()
              .setLabel("Invite to Another Server")
              .setStyle(ButtonStyle.Link)
              .setURL(BOT_INVITE_URL)
          )
        );

      await adderUser.send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 });
      console.log(`[GUILD]    Welcome DM sent to ${adderName} (added to ${guild.name})`);
    } catch (err) {
      console.log(`[WARNING]  Could not DM adder ${adderName}: ${err.message}`);
    }
  }

  // ── Post welcome message in server channel ──
  try {
    const channel =
      guild.systemChannel ||
      guild.channels.cache
        .filter(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me)?.has("SendMessages"))
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .first();

    if (channel) {
      const memberCount = guild.memberCount;
      const channelCount = guild.channels.cache.size;
      const roleCount = guild.roles.cache.size - 1; // exclude @everyone

      const serverContainer = new ContainerBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `<a:0Neko_Catacafe_EMO4:1559062062259511377> **Ty for inviting ${client.user.username}!**`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `Ready to help your server. Let's get started!\n\n` +
            `**Prefix:** \`${getPrefix(guildId)}\`\n` +
            `**Help:** \`${getPrefix(guildId)}help\` or \`/help\``
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `<a:zyarrow:1487457493549453339> **Members:** ${memberCount}  •  **Channels:** ${channelCount}  •  **Roles:** ${roleCount}`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel("Support Server")
              .setStyle(ButtonStyle.Link)
              .setURL(`https://discord.gg/${SUPPORT_SERVER_INVITE}`),
            new ButtonBuilder()
              .setLabel("Invite Bot")
              .setStyle(ButtonStyle.Link)
              .setURL(BOT_INVITE_URL)
          )
        );

      await channel.send({ components: [serverContainer], flags: MessageFlags.IsComponentsV2 });
    }
  } catch {}

  // ── AntiNuke: snapshot new guild if antinuke is already enabled ──
  if (featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled) {
    await takeGuildSnapshot(guild).catch(() => {});
  }
});

/* ================= GUILD DELETE EVENT ================= */
client.on("guildDelete", async guild => {
  if (typeof soezySecurity !== "undefined") soezySecurity.cleanupRuntime?.(Date.now(), guild.id);
  globalThis.soezyConfigSync?.cleanupRuntime?.(guild.id);
  globalThis.soezyBlacklistManager?.clearBlacklistCache?.(guild.id);
  globalThis.cleanupCollectors?.({ guildId: guild.id, reason: "guildDelete" });
  for (const state of new Set(globalThis.__soezyModerationConfirmations?.values() || [])) {
    if (state.guildId !== guild.id) continue;
    clearTimeout(state.timer);
    globalThis.__soezyModerationConfirmations.delete(state.confirmId);
    globalThis.__soezyModerationConfirmations.delete(state.cancelId);
    state.resolve(false);
  }
  console.log(`[GUILD]    Left: ${guild.name} (${guild.id})`);
  const BOT_INVITE = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;
  const SUPPORT_SERVER_INVITE = "JRWtxxWASy";

  try {
    const owner = await guild.fetchOwner().catch(() => null);
    if (!owner) return;

    const container = new ContainerBuilder()
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `${EMOJIS.error} **${client.user.username} was removed from ${guild.name}**`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `<a:zyarrow:1487457493549453339> Hey <@${owner.id}>! **${client.user.username}** was just removed from **${guild.name}**.\n` +
          `<a:zyarrow:1487457493549453339> Sorry for any inconvenience — we hope to see you again!`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `<a:zyarrow:1487457493549453339> **Help Us Improve** — leave feedback at our Support Server so we can fix things ASAP!`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel("Support Server")
            .setStyle(ButtonStyle.Link)
            .setURL(`https://discord.gg/${SUPPORT_SERVER_INVITE}`),
          new ButtonBuilder()
            .setLabel("Add me back")
            .setStyle(ButtonStyle.Link)
            .setURL(BOT_INVITE)
        )
      );

    await owner.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  } catch (err) {
    console.error("[GUILD DELETE DM ERROR]", err);
  }
});

/* ================= GUILD MEMBER ADD EVENT ================= */
client.on("guildMemberAdd", async member => {
  soezySecurity.handleGuildJoinGuard(member).catch(err => console.error("[Security Join Guard]", err));
  const guildId = member.guild.id;

// Welcome message (merged welcome and legacy greet support)
if ((guildData(guildId).welcome?.enabled && guildData(guildId).welcome?.channel) || (guildData(guildId).greet?.channel && guildData(guildId).greet?.message)) {
  // Prioritize new welcome system over legacy greet
  const channelId = guildData(guildId).welcome?.enabled && guildData(guildId).welcome?.channel ? guildData(guildId).welcome.channel : guildData(guildId).greet?.channel;
  const channel = member.guild.channels.cache.get(channelId);
  
  if (channel) {
    // Determine which message format to use
    const isNewWelcome = guildData(guildId).welcome?.enabled && guildData(guildId).welcome?.channel;
    const rawMessage = isNewWelcome 
      ? (guildData(guildId).welcome.message || "Welcome {user} to {server}!")
      : guildData(guildId).greet.message;
    
    // Replace placeholders
    const message = rawMessage
      .replace(/{user}/g, `<@${member.id}>`)
      .replace(/{username}/g, member.user.username)
      .replace(/{tag}/g, member.user.tag || `${member.user.username}#${member.user.discriminator}`)
      .replace(/{server}/g, member.guild.name)
      .replace(/{membercount}/g, member.guild.memberCount.toString())
      .replace(/{userid}/g, member.id);
    
    // Check if embeds should be used (new welcome system allows disabling, legacy always uses embeds)
    const useEmbed = isNewWelcome ? (guildData(guildId).welcome.embedEnabled !== false) : true;
    const deleteDelayMs = isNewWelcome ? Number(guildData(guildId).welcome.deleteDelayMs) || 0 : 0;
    const sendWelcome = payload => channel.send(payload).then(sent => {
      if (sent && deleteDelayMs > 0 && deleteDelayMs <= 2147000000) {
        const timer = setTimeout(() => sent.delete().catch(() => {}), deleteDelayMs);
        timer.unref?.();
      }
    }).catch(console.error);
    
    if (useEmbed) {
      // Build outside title (content) and inside embed
      const rawTitle = guildData(guildId).welcome?.title || null;
      const outsideTitle = rawTitle
        ? rawTitle
            .replace(/{user}/g, `<@${member.id}>`)
            .replace(/{username}/g, member.user.username)
            .replace(/{tag}/g, member.user.tag || `${member.user.username}#${member.user.discriminator}`)
            .replace(/{server}/g, member.guild.name)
            .replace(/{membercount}/g, member.guild.memberCount.toString())
            .replace(/{userid}/g, member.id)
        : `${EMOJIS.welcome} Wlcm <@${member.id}>`;

      const w = guildData(guildId).welcome;
      const _ph = str => formatWelcomeVariables(str, member.guild, member.user, member);

      const embed = createEmbed({
        author: w.authorText ? _ph(w.authorText) : undefined,
        authorIcon: w.authorIcon ? _ph(w.authorIcon) : undefined,
        description: _ph(message),
        thumbnail: w.thumbnail ? _ph(w.thumbnail) : undefined,
        color: w.color ?? getThemeColor(guildId),
        footer: isNewWelcome && w.footer
          ? { text: _ph(w.footer), iconURL: w.footerIcon ? _ph(w.footerIcon) : undefined }
          : undefined,
        fields: isNewWelcome && w.fields?.length ? w.fields.map(f => ({ name: _ph(f.name), value: _ph(f.value) })) : undefined,
        image: isNewWelcome && w.image ? _ph(w.image) : undefined,
        timestamp: false,
      });

      sendWelcome({ content: _ph(outsideTitle), embeds: [embed], allowedMentions: { users: [member.id] } });
    } else {
      sendWelcome({ content: formatWelcomeVariables(message, member.guild, member.user, member), allowedMentions: { users: [member.id] } });
    }
  }
}

  // Welcome DM
  if (guildData(guildId).welcome?.dmEnabled && guildData(guildId).welcome?.dmMessage) {
    const rawDmMsg = guildData(guildId).welcome.dmMessage;
    const dmMessage = rawDmMsg
      .replace(/{user}/g, member.user.username)
      .replace(/{username}/g, member.user.username)
      .replace(/{server}/g, member.guild.name)
      .replace(/{membercount}/g, member.guild.memberCount.toString());

    const dmEmbed = createEmbed({
      title: `${EMOJIS.welcome} ${bold(`Welcome to ${member.guild.name}!`)}`,
      description: dmMessage,
      thumbnail: member.guild.iconURL({ forceStatic: false }) || undefined,
      footer: guildData(guildId).welcome.dmFooter
        ? { text: guildData(guildId).welcome.dmFooter
              .replace(/{user}/g, member.user.username)
              .replace(/{server}/g, member.guild.name)
              .replace(/{membercount}/g, member.guild.memberCount.toString()) }
        : undefined,
      image: guildData(guildId).welcome.dmImage || undefined,
      timestamp: false,
    });

    member.send({ embeds: [dmEmbed] }).catch(() => {});
  }

  // Join DM (legacy)
  if (guildData(guildId).joinDm?.enabled && guildData(guildId).joinDm?.message) {
    const jdCfg = guildData(guildId).joinDm;
    const _jdPh = str => str
      ? str
          .replace(/{user}/g,          member.user.username)
          .replace(/{username}/g,      member.user.username)
          .replace(/{server}/g,        member.guild.name)
          .replace(/{membercount}/g,   member.guild.memberCount.toString())
          .replace(/{userid}/g,        member.id)
          .replace(/{user_avatar}/g,   member.displayAvatarURL?.({ forceStatic: false, size: 256 }) || member.user.displayAvatarURL({ forceStatic: false, size: 256 }))
          .replace(/{server_avatar}/g, member.guild.iconURL({ forceStatic: false }) || "")
          .replace(/{server_icon}/g,   member.guild.iconURL({ forceStatic: false }) || "")
          .replace(/{bot_avatar}/g,    typeof getBotAvatar === "function" ? getBotAvatar(guildId, 256) : (client.user?.displayAvatarURL({ extension: "png", size: 256 }) || ""))
      : str;

    const dmMessage = _jdPh(jdCfg.message);
    const footerText = jdCfg.footer || jdCfg.dmFooter;
    const imageUrl   = jdCfg.image  || jdCfg.dmImage;

    if (jdCfg.embedEnabled !== false) {
      const embed = createEmbed({
        title: jdCfg.title
          ? _jdPh(jdCfg.title)
          : `${EMOJIS.welcome} ${bold(`Welcome to ${member.guild.name}!`)}`,
        author: jdCfg.authorText ? _jdPh(jdCfg.authorText) : undefined,
        authorIcon: jdCfg.authorIcon ? _jdPh(jdCfg.authorIcon) : undefined,
        description: dmMessage,
        thumbnail: jdCfg.thumbnail ? _jdPh(jdCfg.thumbnail) : member.guild.iconURL({ dynamic: true }),
        color: jdCfg.color ?? getThemeColor(typeof guildId !== "undefined" ? guildId : null),
        footer: footerText
          ? { text: _jdPh(footerText), iconURL: jdCfg.footerIcon ? _jdPh(jdCfg.footerIcon) : undefined }
          : undefined,
        image: imageUrl ? _jdPh(imageUrl) : undefined,
      });
      member.send({ embeds: [embed] }).catch(() => {});
    } else {
      member.send({ content: dmMessage }).catch(() => {});
    }
  }

  // Anti-bot is an AutoMod child preference and cannot outlive the parent switch.
  const antiBotRuntime = typeof getProtectionRuntimeState === "function"
    ? getProtectionRuntimeState(guildId, "automod", "antiBot")
    : { effectiveEnabled: (guildData(guildId).automod?.systemEnabled ?? guildData(guildId).automod?.enabled) === true && guildData(guildId).antibot?.enabled === true };
  if (featureSecurityPremiumActive(guildId) && antiBotRuntime.effectiveEnabled && member.user.bot) {
    if (!isAntibotWhitelisted(member.user.id, guildId)) {
      try {
        const action = guildData(guildId).antibot.action || "kick";
        if (action === "ban") {
          await member.ban({ reason: "Anti-bot: Unauthorized bot" });
        } else {
          await member.kick("Anti-bot: Unauthorized bot");
        }
        
        if (guildData(guildId).antibot.joinLogs) {
          const logChannel = member.guild.channels.cache.get(guildData(guildId).antibot.joinLogs);
          if (logChannel) {
            await sendLoggingContainer(logChannel, "antibot", {
              guild: member.guild,
              title: "Bot Blocked",
              icon: EMOJIS.antibot,
              actor: member.user,
              thumbnail: member.user.displayAvatarURL({ dynamic: true }),
              fields: [{ name: "Action", value: action.toUpperCase() }],
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.error("Failed to block bot:", err);
      }
      return;
    }
  }

  // Auto roles — separate user and bot lists
  const arData = guildData(guildId).autoRoles || {};
  // Migrate legacy flat array stored under guildId key
  if (Array.isArray(arData[guildId])) {
    if (!arData.userRoles) arData.userRoles = [];
    arData.userRoles = [...new Set([...arData.userRoles, ...arData[guildId]])];
    delete arData[guildId];
    saveDB();
  }
  const rolesToApply = member.user.bot
    ? (arData.botRoles  || [])
    : (arData.userRoles || []);
  for (const roleId of rolesToApply) {
    const role = member.guild.roles.cache.get(roleId);
    if (role) await member.roles.add(role).catch(() => {});
  }

  // Logging
  if (guildData(guildId).logging?.enabled && guildData(guildId).logging?.events?.memberJoin) {
    await sendLogEvent(member.guild, "memberJoin", {
      primaryName: member.user.username,
      actor: member.user,
      logFooter: `User ID: ${member.id} - Join Log`,
      fields: [
        { name: "Member", value: member.user.username, inline: true },
        { name: `${EMOJIS.calendar} ${bold("Account Created")}`, value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: `${EMOJIS.chart} ${bold("Member #")}`, value: `${member.guild.memberCount}`, inline: true }
      ],
      thumbnail: member.user.displayAvatarURL({ dynamic: true }),
      color: getThemeColor(guildId)
    });
  }

  // ── Account Age Gate ──────────────────────────────────────────────────────
  const accountAgeRuntime = typeof getProtectionRuntimeState === "function"
    ? getProtectionRuntimeState(guildId, "automod", "accountAge")
    : { effectiveEnabled: (guildData(guildId).automod?.systemEnabled ?? guildData(guildId).automod?.enabled) === true && guildData(guildId).accountAge?.enabled === true };
  if (featureSecurityPremiumActive(guildId) && accountAgeRuntime.effectiveEnabled && !member.user.bot) {
    const minMs  = (guildData(guildId).accountAge.minDays || 7) * 24 * 60 * 60 * 1000;
    const ageMs  = Date.now() - member.user.createdTimestamp;
    if (ageMs < minMs) {
      const action  = guildData(guildId).accountAge.action || "kick";
      const minDays = guildData(guildId).accountAge.minDays || 7;
      const dmContainer = new ContainerBuilder()
        .setAccentColor(getThemeColor(guildId))
        .addSectionComponents(s => s
          .addTextDisplayComponents(t => t.setContent(
            `${EMOJIS.shield} **Account Too New**\n` +
            `Your account must be at least **${minDays} days old** to join **${member.guild.name}**.\n\n` +
            `<a:zyarrow:1487457493549453339> **Account Age:** ${Math.floor(ageMs / 86400000)} day(s)\n` +
            `<a:zyarrow:1487457493549453339> **Required:** ${minDays} day(s)`
          ))
          .setThumbnailAccessory(th => th.setURL(member.guild.iconURL({ dynamic: true }) || "https://cdn.discordapp.com/embed/avatars/0.png"))
        )
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t => t.setContent(`-# ${member.guild.name} • Account Age Protection`));
      await member.send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      if (action === "ban") {
        await member.ban({ reason: `Account Age Gate: Account only ${Math.floor(ageMs / 86400000)} days old (min: ${minDays})` }).catch(() => {});
      } else {
        await member.kick(`Account Age Gate: Account only ${Math.floor(ageMs / 86400000)} days old (min: ${minDays})`).catch(() => {});
      }
      const logCh = guildData(guildId).accountAge.logs ? member.guild.channels.cache.get(guildData(guildId).accountAge.logs) : null;
      if (logCh) {
        sendLoggingContainer(logCh, "accountAge", {
          guild: member.guild,
          title: "Account Age Gate Triggered",
          icon: EMOJIS.shield,
          actor: member.user,
          thumbnail: member.user.displayAvatarURL({ dynamic: true }),
          fields: [
            { name: "Account Age", value: `${Math.floor(ageMs / 86400000)} day(s)` },
            { name: "Action", value: action.toUpperCase() },
          ],
        }).catch(() => {});
      }
      return;
    }
  }

  // ── Anti-Raid Mode ────────────────────────────────────────────────────────
  if (featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antiRaid?.enabled && !member.user.bot) {
    const ar        = guildData(guildId).antiRaid;
    const now       = Date.now();
    const interval  = ar.interval || 10000;
    const threshold = ar.threshold || 10;
    if (!Array.isArray(ar.joins)) ar.joins = [];
    ar.joins = ar.joins.filter(entry => now - (typeof entry === "number" ? entry : Number(entry?.at || 0)) < interval);
    if (!isAntiRaidWhitelisted(member, guildId)) ar.joins.push({ at: now, userId: member.id });
    saveDB();
    if (!isAntiRaidWhitelisted(member, guildId) && ar.joins.filter(entry => !isAntiRaidWhitelisted(member.guild.members.cache.get(entry?.userId), guildId)).length >= threshold) {
      ar.joins = [];
      saveDB();
      const action = ar.action || "kick";
      const fetchedMembers = await member.guild.members.fetch().catch(() => null);
      if (fetchedMembers) {
        const recentMembers = fetchedMembers.filter(m =>
          !m.user.bot && now - m.joinedTimestamp < interval + 5000 && !isAntiRaidWhitelisted(m, guildId)
        );
        for (const rm of recentMembers.values()) {
          if (action === "ban") {
            await rm.ban({ reason: "Anti-Raid: Mass join detected" }).catch(() => {});
          } else {
            await rm.kick("Anti-Raid: Mass join detected").catch(() => {});
          }
        }
      }
      const raidLogCh = ar.logs ? member.guild.channels.cache.get(ar.logs) : null;
      if (raidLogCh) {
        sendLoggingContainer(raidLogCh, "antiRaid", {
          guild: member.guild,
          title: "Raid Detected - Auto Lockdown",
          icon: EMOJIS.antinuke,
          actor: member.user,
          thumbnail: member.guild.iconURL({ dynamic: true }) || undefined,
          fields: [
            { name: "Join Threshold", value: `${threshold}+ members within ${interval / 1000}s` },
            { name: "Action", value: action.toUpperCase() },
          ],
        }).catch(() => {});
      }
      return;
    }
  }

  // ── Mute Evasion Detection ────────────────────────────────────────────────
  if (featureSecurityPremiumActive(guildId) && guildData(guildId).muteEvasion?.enabled && !member.user.bot) {
    const mutedUsers = guildData(guildId).muteEvasion.mutedUsers || {};
    if (mutedUsers[member.id]) {
      const muteInfo = mutedUsers[member.id];
      try {
        const until = muteInfo.until ? new Date(muteInfo.until) : null;
        if (!until || until > new Date()) {
          const remainingMs = until ? until - Date.now() : 28 * 24 * 60 * 60 * 1000;
          await member.timeout(Math.min(remainingMs, 28 * 24 * 60 * 60 * 1000), "Mute Evasion: Rejoined while muted").catch(() => {});
          const evasionLogCh = guildData(guildId).muteEvasion.logs
            ? member.guild.channels.cache.get(guildData(guildId).muteEvasion.logs)
            : null;
          if (evasionLogCh) {
            sendLoggingContainer(evasionLogCh, "muteEvasion", {
              guild: member.guild,
              title: "Mute Evasion Detected",
              icon: EMOJIS.mute,
              actor: member.user,
              thumbnail: member.user.displayAvatarURL({ dynamic: true }),
              fields: [
                { name: "Action", value: "Re-muted on rejoin" },
                { name: "Original Mute By", value: muteInfo.moderator ? `<@${muteInfo.moderator}> (\`${muteInfo.moderator}\`)` : "Unknown" },
                { name: "Mute Expires", value: until ? `<t:${Math.floor(until / 1000)}:R>` : "Permanent" },
              ],
            }).catch(() => {});
          }
        } else {
          delete guildData(guildId).muteEvasion.mutedUsers[member.id];
          saveDB();
        }
      } catch {}
    }
  }

  // ── Verification Gate ─────────────────────────────────────────────────────
  if (guildData(guildId).verify?.enabled && !member.user.bot) {
    const vCfg = typeof ensureVerifyData === "function" ? ensureVerifyData(guildId) : guildData(guildId).verify;
    if (typeof isVerifyWhitelisted === "function" && isVerifyWhitelisted(member, guildId)) {
      if (typeof grantVerifiedRoles === "function") await grantVerifiedRoles(member, vCfg, "Verification whitelist bypass").catch(() => {});
    } else {
      if ((!vCfg.unverifiedRole || !member.guild.roles.cache.has(vCfg.unverifiedRole)) && typeof ensureVerifyRoles === "function") {
        await ensureVerifyRoles(member.guild, vCfg).catch(() => null);
      }
      const unverifiedRole = vCfg.unverifiedRole ? member.guild.roles.cache.get(vCfg.unverifiedRole) : null;
      if (unverifiedRole?.editable) await member.roles.add(unverifiedRole, "Verification Gate: awaiting verification").catch(() => {});
    }
  }

  // ── Wall: suspicious username / nickname auto-quarantine on join ────────────
  try {
    const wsJoin = guildData(guildId).wallSystem;
    if (featureSecurityPremiumActive(guildId) && wsJoin?.enabled && member.id !== member.guild.ownerId && member.id !== client.user.id) {
      const toCheck = [member.user.username, member.displayName || ""].join(" ");
      const isSuspicious = DANGEROUS_CONTENT_PATTERNS.some(p => p.test(toCheck));
      if (isSuspicious) {
        const qRoleIdJ = wsJoin.quarantineRoleId;
        if (qRoleIdJ && member.guild.roles.cache.has(qRoleIdJ)) {
          const ARROW = "<a:zyarrow:1487457493549453339>";
          const savedRolesJ = member.roles.cache.filter(r => r.id !== member.guild.id && r.id !== qRoleIdJ).map(r => r.id);
          await member.roles.set([qRoleIdJ], "Wall System: suspicious username on join");
          if (!wsJoin.quarantined) wsJoin.quarantined = {};
          if (!wsJoin.quarantined[guildId]) wsJoin.quarantined[guildId] = {};
          wsJoin.quarantined[guildId][member.id] = {
            savedRoles: savedRolesJ,
            reason: "Auto-quarantined on join: suspicious username/nickname",
            moderatorId: client.user.id,
            timestamp: Date.now(),
            autoAction: true,
            source: "wall_suspicious_join",
            strikes: [],
            strikeEvents: [],
            attempts: 0,
            attemptDay: new Date().toISOString().slice(0, 10)
          };
          if (typeof wallUpsertQuarantineRecord === "function") {
            wallUpsertQuarantineRecord(guildId, member.id, {
              savedRoles: savedRolesJ,
              reason: "Auto-quarantined on join: suspicious username/nickname",
              moderatorId: client.user.id,
              source: "wall_suspicious_join",
              autoAction: true,
              resetStrikes: true,
            });
          }
          saveDB();
          if (typeof wallEnforceQuarantinedMemberAccess === "function") {
            const accessErrors = await wallEnforceQuarantinedMemberAccess(member.guild, member.id);
            for (const item of accessErrors) {
              console.error(`[WALL CHANNEL LOCKDOWN] guild=${guildId} channel=${item.channelId} member=${member.id}: ${item.error.message}`);
            }
          }
          if (wsJoin.logChannel) {
            const logCh = member.guild.channels.cache.get(wsJoin.logChannel);
            if (logCh) await sendLoggingContainer(logCh, "wall", {
              guild: member.guild,
              title: "Wall — Suspicious Join Auto-Quarantined",
              icon: EMOJIS.wall,
              actor: member.user,
              fields: [
                { name: "Username", value: member.user.username },
                { name: "Reason", value: "Suspicious username pattern detected on join." },
              ],
            }).catch(() => {});
          }
        }
      }
    }
  } catch (error) { console.error(`[WALL SUSPICIOUS JOIN] guild=${guildId} member=${member.id}: ${error.message}`); }

  // ── Vanity role: check new member's presence immediately after join ──────
  try {
    const vr = guildData(guildId).vanityRole;
    if (vr?.enabled && vr.roleId && vr.tag) {
      // Wait a moment for presence to populate
      setTimeout(async () => {
        try {
          const freshMember = await member.guild.members.fetch(member.id).catch(() => null);
          if (!freshMember) return;
          const presence = freshMember.presence;
          const custom = presence?.activities?.find(a => a.type === 4);
          const statusText = ((custom?.state || "") + " " + (custom?.name || "")).toLowerCase();
          if (statusText.includes(vr.tag.toLowerCase())) {
            if (!freshMember.roles.cache.has(vr.roleId)) {
              await freshMember.roles.add(vr.roleId, `Vanity tag rep on join: ${vr.tag}`).catch(() => {});
            }
          }
        } catch {}
      }, 3000);
    }
  } catch {}
});

/* ================= GUILD MEMBER REMOVE EVENT ================= */
client.on("guildMemberRemove", async member => {
  const guildId = member.guild.id;

  // Antinuke: antikick check
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antikick !== false) {
    try {
      const auditLogs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== member.guild.ownerId) {
          await handleAntiNukeAction(member.guild, executor.id, "kick");
        }
      }
    } catch (err) {}
  }

  // Kick detection logging
  if (guildData(guildId).logging?.enabled && guildData(guildId).logging?.events?.memberKick) {
    try {
      const auditLogs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
      const kickLog = auditLogs.entries.first();
      if (kickLog && kickLog.target?.id === member.id && Date.now() - kickLog.createdTimestamp < 10000) {
        await sendLogEvent(member.guild, "memberKick", {
          fields: [
            { name: `${EMOJIS.confession} ${bold("User")}`, value: `${member.user.tag} (\`${member.id}\`)`, inline: true },
            { name: `${EMOJIS.crown} ${bold("Kicked By")}`, value: `${kickLog.executor?.tag || "Unknown"} (\`${kickLog.executor?.id || "?"}\`)`, inline: true },
            { name: `${EMOJIS.file} ${bold("Reason")}`, value: kickLog.reason || "No reason provided", inline: false },
            { name: `${EMOJIS.calendar} ${bold("Joined")}`, value: member.joinedAt ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "Unknown", inline: true }
          ],
          thumbnail: member.user.displayAvatarURL({ dynamic: true }),
        });
      }
    } catch {}
  }

  // Goodbye DM
  if (guildData(guildId).goodbye?.enabled) {
    const gbCfg = guildData(guildId).goodbye;
    let hasStaleGoodbyeChannel = false;
    const _gbPh = str => str
      ? str
          .replace(/{user}/g,          member.user.username)
          .replace(/{username}/g,      member.user.username)
          .replace(/{tag}/g,           member.user.tag || member.user.username)
          .replace(/{server}/g,        member.guild.name)
          .replace(/{membercount}/g,   member.guild.memberCount.toString())
          .replace(/{userid}/g,        member.id)
          .replace(/{user_avatar}/g,   member.displayAvatarURL?.({ forceStatic: false, size: 256 }) || member.user.displayAvatarURL({ forceStatic: false, size: 256 }))
          .replace(/{server_avatar}/g, member.guild.iconURL({ forceStatic: false }) || "")
          .replace(/{server_icon}/g,   member.guild.iconURL({ forceStatic: false }) || "")
          .replace(/{bot_avatar}/g,    typeof getBotAvatar === "function" ? getBotAvatar(guildId, 256) : (client.user?.displayAvatarURL({ extension: "png", size: 256 }) || ""))
      : str;

    const dmMessage = _gbPh(gbCfg.message || "Goodbye {username}! We'll miss you.");
    const footerText = gbCfg.footer || gbCfg.dmFooter;
    const imageUrl   = gbCfg.image  || gbCfg.dmImage;

    if (gbCfg.channel) {
      const goodbyeChannel = member.guild.channels.cache.get(gbCfg.channel)
        || await member.guild.channels.fetch(gbCfg.channel).catch(() => null);
      const botMember = member.guild.members.me || await member.guild.members.fetchMe().catch(() => null);
      const channelPerms = botMember && goodbyeChannel?.permissionsFor?.(botMember);
      const canSend = goodbyeChannel?.isTextBased?.()
        && channelPerms?.has?.(PermissionsBitField.Flags.ViewChannel)
        && channelPerms?.has?.(PermissionsBitField.Flags.SendMessages);
      if (canSend) {
        if (gbCfg.embedEnabled !== false) {
          const channelEmbed = createEmbed({
            title: gbCfg.title ? _gbPh(gbCfg.title) : undefined,
            author: gbCfg.authorText ? _gbPh(gbCfg.authorText) : undefined,
            authorIcon: gbCfg.authorIcon ? _gbPh(gbCfg.authorIcon) : undefined,
            description: dmMessage,
            thumbnail: gbCfg.thumbnail ? _gbPh(gbCfg.thumbnail) : undefined,
            color: gbCfg.color ?? getThemeColor(guildId),
            footer: footerText
              ? { text: _gbPh(footerText), iconURL: gbCfg.footerIcon ? _gbPh(gbCfg.footerIcon) : undefined }
              : undefined,
            image: imageUrl ? _gbPh(imageUrl) : undefined,
          });
          goodbyeChannel.send({ embeds: [channelEmbed] }).catch(error => {
            console.warn(`[GOODBYE] Failed to send in guild=${guildId} channel=${goodbyeChannel.id}: ${error.message}`);
          });
        } else {
          goodbyeChannel.send({ content: dmMessage }).catch(error => {
            console.warn(`[GOODBYE] Failed to send in guild=${guildId} channel=${goodbyeChannel.id}: ${error.message}`);
          });
        }
      } else {
        // A deleted/inaccessible channel must not leave a stale configuration
        // that throws for every future member leave.
        delete gbCfg.channel;
        gbCfg.enabled = false;
        hasStaleGoodbyeChannel = true;
        saveDB();
        console.warn(`[GOODBYE] Disabled stale goodbye config for guild=${guildId}; configured channel is unavailable.`);
      }
    }

  }

  // Logging
  if (guildData(guildId).logging?.enabled && guildData(guildId).logging?.events?.memberLeave) {
    await sendLogEvent(member.guild, "memberLeave", {
      primaryName: member.user.username,
      actor: member.user,
      logFooter: `User ID: ${member.id} - Leave Log`,
      fields: [
        { name: "Member", value: member.user.username, inline: true },
        { name: `${EMOJIS.calendar} ${bold("Joined")}`, value: member.joinedAt ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "Unknown", inline: true },
        { name: `${EMOJIS.chart} ${bold("Members Left")}`, value: `${member.guild.memberCount}`, inline: true }
      ],
      thumbnail: member.user.displayAvatarURL({ dynamic: true }),
      color: getThemeColor(guildId)
    });
  }
});

/* ================= GUILD MEMBER UPDATE EVENT ================= */
registerGuildMemberUpdateHandler(async (oldMember, newMember) => {
  const guildId = newMember.guild.id;

  // ── Boost detection ──
  if (guildData(guildId).boost?.enabled && guildData(guildId).boost?.channel) {
    const oldBoost = oldMember.premiumSince;
    const newBoost = newMember.premiumSince;
    if (!oldBoost && newBoost) {
      const channel = newMember.guild.channels.cache.get(guildData(guildId).boost.channel);
      if (channel) {
        const boostCount = newMember.guild.premiumSubscriptionCount || 0;
        const e = guildData(guildId).boost.embed || {};
        const fill = value => String(value || "")
          .replace(/{user}/g, `<@${newMember.id}>`)
          .replace(/{username}/g, newMember.user.username)
          .replace(/{count}/g, String(boostCount))
          .replace(/{server}/g, newMember.guild.name);
        if (guildData(guildId).boost.embedEnabled === false) {
          const message = fill(e.description || "{user} just boosted {server}! We now have {count} boosts!");
          channel.send({ content: message, allowedMentions: { users: [newMember.id] } }).catch(console.error);
        } else {
          const embed = createEmbed({
            title: e.title ? fill(e.title) : `${EMOJIS.boost} ${bold("Server Boosted!")}`,
            description: e.description
              ? fill(e.description)
              : `${EMOJIS.party} ${newMember} just boosted the server!\n\nWe now have ${bold(boostCount.toString())} boost(s)! ${EMOJIS.heart}`,
            color: e.color ? parseInt(e.color.replace('#', ''), 16) : getThemeColor(typeof guildId !== "undefined" ? guildId : null),
            image: e.image || null,
            footer: e.footer ? fill(e.footer) : null
          });
          if (e.timestamp) embed.setTimestamp();
          channel.send({ embeds: [embed] }).catch(console.error);
        }
      }
    }
  }

  const lg = guildData(guildId).logging;
  if (!lg?.enabled) return;

  // Keep member role changes in the same compact member-update log.
  const oldRoleIds = new Set(oldMember.roles.cache.keys());
  const newRoleIds = new Set(newMember.roles.cache.keys());
  const addedRoles = [...newMember.roles.cache.values()]
    .filter(role => !oldRoleIds.has(role.id) && role.id !== guildId);
  const removedRoles = [...oldMember.roles.cache.values()]
    .filter(role => !newRoleIds.has(role.id) && role.id !== guildId);
  const oldTopRole = oldMember.roles.highest;
  const newTopRole = newMember.roles.highest;
  if ((addedRoles.length || removedRoles.length || oldTopRole?.id !== newTopRole?.id) &&
      lg.events?.memberUpdate) {
    const fields = [
      { name: "User", value: `${newMember.user.tag} (\`${newMember.id}\`)`, inline: true },
      ...(addedRoles.length ? [{ name: "Roles Added", value: addedRoles.map(role => role.name).join(", ") }] : []),
      ...(removedRoles.length ? [{ name: "Roles Removed", value: removedRoles.map(role => role.name).join(", ") }] : []),
      ...(oldTopRole?.id !== newTopRole?.id ? [{
        name: "Top Role Updated",
        value: `${oldTopRole?.name || "None"} -> ${newTopRole?.name || "None"}`
      }] : [])
    ];
    await sendLogEvent(newMember.guild, "memberUpdate", {
      fields,
      thumbnail: newMember.user.displayAvatarURL({ dynamic: true })
    });
  }

  // ── Mute / Unmute (Discord timeout) ──
  const wasTimedOut = !!oldMember.communicationDisabledUntil;
  const isTimedOut  = !!newMember.communicationDisabledUntil;

  if (!wasTimedOut && isTimedOut && lg.events?.memberMute) {
    let executor = null;
    try {
      const al = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 1 });
      const entry = al.entries.first();
      if (entry && entry.target?.id === newMember.id && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    await sendLogEvent(newMember.guild, "memberMute", {
      fields: [
        { name: `${EMOJIS.confession} ${bold("User")}`, value: `${newMember.user.tag} (\`${newMember.id}\`)`, inline: true },
        { name: `${EMOJIS.crown} ${bold("Muted By")}`, value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown", inline: true },
        { name: `${EMOJIS.clock} ${bold("Expires")}`, value: `<t:${Math.floor(newMember.communicationDisabledUntil.getTime() / 1000)}:R>`, inline: true }
      ],
      thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
    });
  }

  if (wasTimedOut && !isTimedOut && lg.events?.memberUnmute) {
    let executor = null;
    try {
      const al = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 1 });
      const entry = al.entries.first();
      if (entry && entry.target?.id === newMember.id && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}

    // ── DM the user about their unmute ────────────────────────────────────
    const isAutoExpire = !executor || executor.bot;
    const unmutedByLabel = isAutoExpire ? "Timeout expired automatically" : `${executor.tag}`;
    const unmuteReason  = isAutoExpire ? "Your timeout has expired." : "You were manually unmuted by a moderator.";
    try {
      await newMember.user.send({
        components: [new ContainerBuilder()
          .addTextDisplayComponents(t => t.setContent(
            `### ${EMOJIS.unmute} You have been unmuted!\n` +
            `<:member:1559133144345477120> **${newMember.guild.name}**\n\n` +
            `<a:zyarrow:1487457493549453339> **Unmuted by:** ${unmutedByLabel}\n` +
            `<a:zyarrow:1487457493549453339> **Reason:** ${unmuteReason}`
          ))
        ],
        flags: MessageFlags.IsComponentsV2
      }).catch(() => {});
    } catch {}

    await sendLogEvent(newMember.guild, "memberUnmute", {
      fields: [
        { name: `${EMOJIS.confession} ${bold("User")}`, value: `${newMember.user.tag} (\`${newMember.id}\`)`, inline: true },
        { name: `${EMOJIS.crown} ${bold("Unmuted By")}`, value: isAutoExpire ? "Expired automatically" : `${executor.tag} (\`${executor.id}\`)`, inline: true }
      ],
      thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
    });
  }

  // ── Nickname change ──
  if (oldMember.nickname !== newMember.nickname && lg.events?.nicknameChange) {
    let executor = null;
    try {
      const al = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 1 });
      const entry = al.entries.first();
      if (entry && entry.target?.id === newMember.id && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    await sendLogEvent(newMember.guild, "nicknameChange", {
      fields: [
        { name: `${EMOJIS.confession} ${bold("User")}`, value: `${newMember.user.tag} (\`${newMember.id}\`)`, inline: true },
        { name: `${EMOJIS.crown} ${bold("Changed By")}`, value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown", inline: true },
        { name: `${EMOJIS.error} ${bold("Old Nickname")}`, value: oldMember.nickname || "*None*", inline: true },
        { name: `${EMOJIS.success} ${bold("New Nickname")}`, value: newMember.nickname || "*Removed*", inline: true }
      ],
      thumbnail: newMember.user.displayAvatarURL({ dynamic: true }),
    });
  }
});

/* ================= VANITY TAG ROLE (PRESENCE UPDATE) ================= */
// Awards or removes a configured role when a member adds/removes the server's
// vanity tag from their custom status — same mechanic as Zynrax image 3.
client.on("presenceUpdate", async (oldPresence, newPresence) => {
  try {
    const member = newPresence?.member;
    if (!member || !newPresence.guild) return;
    const guildId  = newPresence.guild.id;
    const vr       = guildData(guildId).vanityRole;
    if (!vr?.enabled || !vr.roleId || !vr.tag) return;

    // Helper: extract custom status text from a presence
    const getStatusText = (presence) => {
      if (!presence?.activities) return "";
      const custom = presence.activities?.find(a => a.type === 4); // ActivityType.Custom = 4
      // Check both state (status text) and name — some clients use different fields
      return ((custom?.state || "") + " " + (custom?.name || "")).toLowerCase();
    };

    // Helper: extract bio/about-me from a member (populated when bot has GuildMembers intent)
    // Only check the global (user-level) bio — not the guild/server profile bio
    // NOTE: Gateway never sends bio to bots, so we fetch it via REST.
    const getMemberBio = async (m) => {
      return await fetchGlobalBio(m.user.id, m.guild.id);
    };

    const tagLower = vr.tag.toLowerCase();
    // Check BOTH custom status AND bio/about-me
    const hasTag = getStatusText(newPresence).includes(tagLower) || (await getMemberBio(member)).includes(tagLower);
    const hasRole = member.roles.cache.has(vr.roleId);

    // Only act if there's a mismatch between "has tag" and "has role"
    if (hasTag === hasRole) return;

    const role = newPresence.guild.roles.cache.get(vr.roleId);
    if (!role) return;

    // Send a Components V2 log container to the configured log channel
    const sendVanityLog = async (added) => {
      if (!vr.logChannel) return;
      const logCh = newPresence.guild.channels.cache.get(vr.logChannel);
      if (!logCh?.isTextBased()) return;

      await sendLoggingContainer(logCh, "vanityRole", {
        guild: newPresence.guild,
        title: added ? "Tag Added" : "Tag Removed",
        actor: member.user,
        thumbnail: member.user.displayAvatarURL({ dynamic: true, size: 128 }),
        fields: [
          { name: "Role", value: role.name },
          { name: "Tag", value: vr.tag },
          { name: "Detection", value: "Status / Bio" },
        ],
      }).catch(() => {});
    };

    if (hasTag && !hasRole) {
      // Member is repping the tag (status or bio) but doesn't have the role — give it
      await member.roles.add(vr.roleId, `Vanity tag rep: ${vr.tag}`).catch(() => {});
      saveDB();
      await sendVanityLog(true);
    } else if (!hasTag && hasRole) {
      // Member is no longer repping the tag in status or bio — remove the role
      await member.roles.remove(vr.roleId, `No longer repping vanity tag: ${vr.tag}`).catch(() => {});
      saveDB();
      await sendVanityLog(false);
    }
  } catch (err) {
    // Silently swallow — presence events fire very frequently
  }
});

/* ===============================================================
   VANITY ROLE — bio/about-me change listener
   Discord fires userUpdate when a user edits their global profile
   (including About Me / bio). We re-evaluate vanity role eligibility
   for every guild that has the system enabled.
   =============================================================== */
client.on("userUpdate", async (oldUser, newUser) => {
  try {
    // Gateway doesn't send bio to bots — fetch it fresh via REST for the first guild we can find
    // (bio is global so any guild_id works for the profile endpoint)
    const firstGuild = client.guilds.cache.find(g => g.members.cache.has(newUser.id));
    if (!firstGuild) return;
    const newBio = await fetchGlobalBio(newUser.id, firstGuild.id);
    const oldBio = ""; // we can't know the old bio; always re-evaluate against role state

    // Check every guild this user is a member of
    for (const guild of client.guilds.cache.values()) {
      try {
        const vr = guildData(guild.id).vanityRole;
        if (!vr?.enabled || !vr.roleId || !vr.tag) continue;

        const member = await guild.members.fetch(newUser.id).catch(() => null);
        if (!member) continue;

        const tagLower = vr.tag.toLowerCase();

        // Check status too — don't strip if they still have it in their status
        const customActivity = member.presence?.activities?.find(a => a.type === 4);
        const statusText = ((customActivity?.state || "") + " " + (customActivity?.name || "")).toLowerCase();

        const hasTag  = newBio.includes(tagLower) || statusText.includes(tagLower);
        const hasRole = member.roles.cache.has(vr.roleId);

        if (hasTag && !hasRole) {
          await member.roles.add(vr.roleId, `Vanity bio rep: ${vr.tag}`).catch(() => {});
          saveDB();
          // Log if configured
          if (vr.logChannel) {
            const logCh = guild.channels.cache.get(vr.logChannel);
            if (logCh?.isTextBased()) {
              const role = guild.roles.cache.get(vr.roleId);
              await sendLoggingContainer(logCh, "vanityRole", {
                guild,
                title: "Tag Added (via Bio)",
                actor: member.user,
                thumbnail: member.user.displayAvatarURL({ dynamic: true }),
                fields: [
                  { name: "Role", value: role?.name ?? "vanity" },
                  { name: "Tag", value: vr.tag },
                ],
              }).catch(() => {});
            }
          }
        } else if (!hasTag && hasRole) {
          await member.roles.remove(vr.roleId, `No longer repping vanity tag in bio: ${vr.tag}`).catch(() => {});
          saveDB();
          if (vr.logChannel) {
            const logCh = guild.channels.cache.get(vr.logChannel);
            if (logCh?.isTextBased()) {
              const role = guild.roles.cache.get(vr.roleId);
              await sendLoggingContainer(logCh, "vanityRole", {
                guild,
                title: "Tag Removed (via Bio)",
                actor: member.user,
                thumbnail: member.user.displayAvatarURL({ dynamic: true }),
                fields: [
                  { name: "Role", value: role?.name ?? "vanity" },
                  { name: "Tag", value: vr.tag },
                ],
              }).catch(() => {});
            }
          }
        }
      } catch { /* silently skip this guild */ }
    }
  } catch (err) {
    // Silently swallow — userUpdate fires very frequently
  }
});

/* ================= ANTINUKE — antimassroleremove guildMemberUpdate ================= */
// Detects when a moderator strips all/many roles from a member and triggers antinuke.
registerGuildMemberUpdateHandler(async (oldMember, newMember) => {
  try {
    const guildId = newMember.guild.id;
    if (globalThis.soezyEmergency?.auditDriven || !featureSecurityPremiumActive(guildId) || !guildData(guildId).antinuke?.enabled) return;
    if (guildData(guildId).antinuke?.events?.antimassroleremove === false) return;

    const removedRoles = oldMember.roles.cache.filter(r =>
      r.id !== newMember.guild.id && !newMember.roles.cache.has(r.id)
    );
    // Only flag if 3+ roles were removed at once (mass strip)
    if (removedRoles.size < 3) return;

    try {
      const auditLogs = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && log.target?.id === newMember.id && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== newMember.guild.ownerId) {
          await handleAntiNukeAction(newMember.guild, executor.id, "massroleremove");
        }
      }
    } catch {}
  } catch {}
});

// ── Dangerous permissions that must never reach untrusted members ──────────────
const DANGEROUS_PERMISSIONS = [
  PermissionsBitField.Flags.Administrator,
  PermissionsBitField.Flags.BanMembers,
  PermissionsBitField.Flags.KickMembers,
  PermissionsBitField.Flags.ManageGuild,
  PermissionsBitField.Flags.ManageRoles,
  PermissionsBitField.Flags.ManageChannels,
  PermissionsBitField.Flags.ManageWebhooks,
  PermissionsBitField.Flags.MentionEveryone,
  PermissionsBitField.Flags.ManageNicknames,
  PermissionsBitField.Flags.ModerateMembers,
];

// Patterns that flag suspicious usernames / nicknames on join
const DANGEROUS_CONTENT_PATTERNS = [
  /\b(discord\.gg|discordapp\.com\/invite)\b/i,
  /\b(nitro.*free|free.*nitro)\b/i,
  /\b(admin|owner|mod|staff|support)\b/i,
  /\b(hack|exploit|nuke|raid)\b/i,
];

/* ── WALL: Auto-strip dangerous roles when any member gains one ── */
registerGuildMemberUpdateHandler(async (oldMember, newMember) => {
  try {
    const guildId = newMember.guild.id;
    const ws = guildData(guildId).wallSystem;
    if (!ws?.enabled) return;
    if (newMember.id === newMember.guild.ownerId) return;
    if (newMember.id === client.user.id) return;
    if (newMember.user?.bot) return;
    // Skip whitelisted members
    if (isWallWhitelisted(newMember, guildId)) return;

    // Only care about added roles
    const addedRoles = newMember.roles.cache.filter(
      r => r.id !== newMember.guild.id && !oldMember.roles.cache.has(r.id)
    );
    if (addedRoles.size === 0) return;

    if (ws.quarantined?.[guildId]?.[newMember.id] && typeof wallEnforceQuarantinedMemberAccess === "function") {
      const accessErrors = await wallEnforceQuarantinedMemberAccess(newMember.guild, newMember.id, newMember);
      for (const item of accessErrors) {
        console.error(`[WALL CHANNEL LOCKDOWN] guild=${guildId} channel=${item.channelId} member=${newMember.id}: ${item.error.message}`);
      }
    }

    const dangerousAdded = addedRoles.filter(role =>
      DANGEROUS_PERMISSIONS.some(perm => role.permissions.has(perm))
    );
    if (dangerousAdded.size === 0) return;

    const ARROW = "<a:zyarrow:1487457493549453339>";
    const roleNames = dangerousAdded.map(r => `\`${r.name}\``).join(", ");

    // Trust dangerous-role grants made by the server owner or Wall-whitelisted staff.
    try {
      const auditLogs = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberRoleUpdate, limit: 5 });
      const entry = auditLogs.entries.find(e => {
        const age = Date.now() - Number(e.createdTimestamp);
        return e.target?.id === newMember.id &&
          e.executor?.id &&
          (e.changes || []).some(change => change.key === "$add" &&
            (Array.isArray(change.new) ? change.new : [change.new]).some(role =>
              dangerousAdded.has(String(role.id || role))
            )) &&
          Number.isFinite(Number(e.createdTimestamp)) && age >= 0 && age < 15000;
      });
      const executorId = entry?.executor?.id;
      if (executorId === client.user.id || executorId === newMember.guild.ownerId) return;
      if (executorId) {
        const executorMember = await newMember.guild.members.fetch(executorId).catch(() => null);
        if (executorMember && isWallWhitelisted(executorMember, guildId)) return;
      }
    } catch {}

    const qRoleId = ws.quarantineRoleId || ws.roleId;
    const qRole = qRoleId ? newMember.guild.roles.cache.get(qRoleId) : null;
    const dangerousRoleIds = new Set(dangerousAdded.map(([, role]) => role.id));
    const savedRoles = [...newMember.roles.cache.values()]
      .filter(role => role.id !== newMember.guild.id && role.id !== qRoleId && !dangerousRoleIds.has(role.id))
      .map(role => role.id);
    if (qRole) {
      await newMember.roles.set([qRole], "Wall System: auto-quarantine after dangerous role");
      if (typeof wallUpsertQuarantineRecord === "function") {
        wallUpsertQuarantineRecord(guildId, newMember.id, {
          savedRoles,
          reason: `Auto-quarantined: received dangerous role(s) - ${roleNames}`,
          moderatorId: client.user.id,
          source: "wall_dangerous_role",
          autoAction: true,
          resetStrikes: true,
        });
      } else {
        ws.quarantined ||= {};
        ws.quarantined[guildId] ||= {};
        ws.quarantined[guildId][newMember.id] = {
          savedRoles,
          reason: `Auto-quarantined: received dangerous role(s) - ${roleNames}`,
          moderatorId: client.user.id,
          timestamp: Date.now(),
          autoAction: true,
          source: "wall_dangerous_role",
          strikes: [],
          strikeEvents: [],
        };
        saveDB();
      }
      if (typeof wallEnforceQuarantinedMemberAccess === "function") {
        const accessErrors = await wallEnforceQuarantinedMemberAccess(newMember.guild, newMember.id, newMember);
        for (const item of accessErrors) {
          console.error(`[WALL CHANNEL LOCKDOWN] guild=${guildId} channel=${item.channelId} member=${newMember.id}: ${item.error.message}`);
        }
      }
      await newMember.send({
        components: [createLoggingContainer("wall", {
          guild: newMember.guild,
          title: "Automatically Quarantined",
          icon: EMOJIS.lock,
          actor: newMember.user,
          fields: [
            { name: "Dangerous Role(s)", value: roleNames },
            { name: "Action", value: "Previous safe roles saved; moderator review required." },
          ],
        })],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
    } else {
      for (const [, role] of dangerousAdded) {
        await newMember.roles.remove(role, "Wall System: dangerous permission role auto-stripped");
      }
    }
    const quarantined = Boolean(qRole);

    if (ws.logChannel) {
      const logCh = newMember.guild.channels.cache.get(ws.logChannel);
      if (logCh) await sendLoggingContainer(logCh, "wall", {
        guild: newMember.guild,
        title: "Wall — Dangerous Role Auto-Stripped",
        icon: EMOJIS.wall,
        actor: newMember.user,
        thumbnail: newMember.user.displayAvatarURL({ dynamic: true, size: 256 }),
        fields: [
          { name: "Role(s) Stripped", value: roleNames },
          { name: "Action", value: quarantined ? "Stripped + quarantined" : "Stripped (no quarantine role set)" },
        ],
      }).catch(() => {});
    }
  } catch (err) { console.error("[WALL AUTO-STRIP]", err.message); }
});

/* ================= TAG ROLE — guildMemberUpdate ================= */
// Fires when a member's display name / username changes.
// Gives or removes the tag role based on whether the tag appears in their name.
registerGuildMemberUpdateHandler(async (oldMember, newMember) => {
  try {
    const guildId = newMember.guild.id;
    const tr = guildData(guildId).tagRole;
    if (!tr?.enabled || !tr.roleId || !tr.tag) return;

    const tagLower = tr.tag.toLowerCase();
    const nameHasTag = (name) =>
      (name || "").toLowerCase().includes(tagLower);

    const oldDisplay = oldMember.displayName || oldMember.user.username;
    const newDisplay = newMember.displayName || newMember.user.username;
    const oldUser    = oldMember.user.username;
    const newUser    = newMember.user.username;

    const hadTag = nameHasTag(oldDisplay) || nameHasTag(oldUser);
    const hasTag = nameHasTag(newDisplay) || nameHasTag(newUser);

    if (hadTag === hasTag) return; // no change

    const role = newMember.guild.roles.cache.get(tr.roleId);
    if (!role) return;

    const sendTagLog = async (added) => {
      if (!tr.logChannel) return;
      const logCh = newMember.guild.channels.cache.get(tr.logChannel);
      if (!logCh?.isTextBased()) return;
      await sendLoggingContainer(logCh, "tagRole", {
        guild: newMember.guild,
        title: added ? "Tag Role Added" : "Tag Role Removed",
        icon: "🔖",
        actor: newMember.user,
        thumbnail: newMember.user.displayAvatarURL({ dynamic: true, size: 128 }),
        fields: [
          { name: "Role", value: role.name },
          { name: "Tag", value: tr.tag },
        ],
      }).catch(() => {});
    };

    if (hasTag && !hadTag) {
      if (!newMember.roles.cache.has(tr.roleId)) {
        await newMember.roles.add(tr.roleId, `Tag role: has ${tr.tag} in name`).catch(() => {});
        await sendTagLog(true);
      }
    } else if (!hasTag && hadTag) {
      if (newMember.roles.cache.has(tr.roleId)) {
        await newMember.roles.remove(tr.roleId, `Tag role: no longer has ${tr.tag} in name`).catch(() => {});
        await sendTagLog(false);
      }
    }
  } catch {
    // Silently swallow
  }
});

  /* ================= MESSAGE DELETE EVENT ================= */
client.on("messageDelete", async msg => {
  if (!msg) return;
  if (msg.partial || !msg.author || !msg.guild) {
    msg = typeof getCachedMediaMessageForDelete === "function"
      ? getCachedMediaMessageForDelete(msg.id)
      : null;
  }
  if (!msg?.author || !msg?.guild) return;

  // ── Shadow-mute: silently delete messages ──
  if (!msg.author.bot && msg.guild) {
    const sm = guildData(msg.guild.id)?.shadowMuted || [];
    if (sm.includes(msg.author.id)) { msg.delete().catch(()=>{}); return; }
    // Premium channel: only allow members with premiumRole
    const pChs = guildData(msg.guild.id)?.premiumChannels || [];
    if (pChs.includes(msg.channel.id)) {
      const pRoleId = guildData(msg.guild.id)?.premiumRole;
      if (pRoleId && !msg.member?.roles.cache.has(pRoleId)) { msg.delete().catch(()=>{}); return; }
    }
  }

  if (!msg.guild || msg.author?.bot) return;
  const guildId = msg.guild.id;

  // Store in snipe history
  if (!channelSnipeHistory.has(msg.channel.id)) {
    channelSnipeHistory.set(msg.channel.id, []);
  }
  
  const history = channelSnipeHistory.get(msg.channel.id);
  history.unshift({
    content: msg.content,
    author: msg.author,
    attachments: [...msg.attachments.values()],
    timestamp: Date.now(),
    embeds: msg.embeds
  });
  
  // Keep only last 10 messages
  if (history.length > 10) history.pop();

  // Also update single snipe (for backwards compatibility)
  snipedMessages.set(msg.channel.id, {
    content: msg.content,
    author: msg.author,
    attachments: [...msg.attachments.values()],
    timestamp: Date.now(),
    embeds: msg.embeds
  });

  // The logger handles attachments, media links and embeds, and deduplicates
  // explicit purge/CUC logs against the messageDelete event.
  await logDeletedMedia(msg, "Message Deleted");

  // Logging
  if (guildData(guildId).logging?.enabled && guildData(guildId).logging?.events?.messageDelete) {
    await sendLogEvent(msg.guild, "messageDelete", {
      actor: msg.author,
      jumpUrl: msg.url,
      hasEmbeds: Boolean(msg.embeds?.length),
      description: msg.content?.trim() ? msg.content.slice(0, 1000) : null,
      fields: [
        { name: "Author", value: msg.author.username || msg.author.tag, inline: true },
        { name: "Channel", value: `#${msg.channel.name}`, inline: true },
        { name: `${EMOJIS.file} ${bold("Attachments")}`, value: `${msg.attachments.size}`, inline: true }
      ],
      color: getThemeColor(guildId)
    });
  }
});

/* ================= MESSAGE UPDATE EVENT ================= */
client.on("messageUpdate", async (oldMsg, newMsg) => {
  if (!oldMsg || oldMsg.partial || !oldMsg.guild || !oldMsg.author) return;
  if (oldMsg.author.bot) return;
  if (oldMsg.content === newMsg.content) return;
  const guildId = oldMsg.guild.id;

  // Store in edit history
  if (!channelEditHistory.has(oldMsg.channel.id)) {
    channelEditHistory.set(oldMsg.channel.id, []);
  }
  
  const history = channelEditHistory.get(oldMsg.channel.id);
  history.unshift({
    oldContent: oldMsg.content,
    newContent: newMsg.content,
    author: oldMsg.author,
    timestamp: Date.now(),
    url: newMsg.url
  });
  
  // Keep only last 10 messages
  if (history.length > 10) history.pop();

  // Also update single editsnipe (for backwards compatibility)
  editSnipedMessages.set(oldMsg.channel.id, {
    oldContent: oldMsg.content,
    newContent: newMsg.content,
    author: oldMsg.author,
    timestamp: Date.now(),
    url: newMsg.url
  });

  await sendLogEvent(oldMsg.guild, "messageEdit", {
    actor: oldMsg.author,
    hasEmbeds: Boolean(oldMsg.embeds?.length || newMsg.embeds?.length),
    fields: [{ name: "Channel", value: `<#${oldMsg.channel.id}>` }],
    editBefore: oldMsg.content,
    editAfter: newMsg.content,
    jumpUrl: newMsg.url,
  });
});

/* ================= VOICE STATE UPDATE EVENT ================= */
client.on("voiceStateUpdate", async (oldState, newState) => {
  const guild = newState.guild || oldState.guild;
  const guildId = guild.id;
  
  // Temp voice channel system
  if (guildData(guildId).tempVoice?.enabled) {
    const tv = guildData(guildId).tempVoice;

    // Ensure defaultLimit exists for older guilds
    if (tv.defaultLimit === undefined) tv.defaultLimit = 0;

    // ── User joined the "create" channel ──────────────────────────────────
    const isRegularTrigger = newState.channelId === tv.createChannel;
    const isPrivateTrigger  = newState.channelId === tv.privateCreateChannel;

    if (newState.channelId && (isRegularTrigger || isPrivateTrigger) && newState.member) {
      // Prevent double-trigger if member is already being moved
      if (tv._creating?.[newState.member.id]) return;
      if (!tv._creating) tv._creating = {};
      tv._creating[newState.member.id] = true;

      try {
        // Per-user saved settings (tempsettings)
        const userPrefs = db.tempVoiceSettings?.[newState.member.id] || {};

        // Channel name: always based on username
        const rawName   = isPrivateTrigger
          ? `${newState.member.user.username}'s Channel`
          : (userPrefs.name || tv.defaultName || "{user}'s Channel");
        const channelName = rawName
          .replace(/{user}/g,   newState.member.user.username)
          .replace(/{server}/g, guild.name)
          .slice(0, 100);
        const userLimit = userPrefs.limit ?? tv.defaultLimit ?? 0;

        // Build permission overwrites:
        // - @everyone: for private channels deny ViewChannel + Connect; for locked deny Connect only
        // - Owner gets full control
        // - Bot gets Manage Channels so it can delete the channel later
        const overwrites = [
          {
            id: newState.member.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak,
              PermissionsBitField.Flags.Stream,
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.MoveMembers,
              PermissionsBitField.Flags.MuteMembers,
              PermissionsBitField.Flags.DeafenMembers,
            ],
          },
          {
            id: guild.members.me.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.MoveMembers,
            ],
          },
        ];

        // Private trigger → hide AND lock from everyone
        if (isPrivateTrigger) {
          overwrites.push({
            id: guild.id,
            deny: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.Connect,
            ],
          });
        } else if (userPrefs.privacy === "locked") {
          // Regular trigger with user privacy setting → only lock (still visible)
          overwrites.push({ id: guild.id, deny: [PermissionsBitField.Flags.Connect] });
        }

        const channel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildVoice,
          parent: tv.category || null,
          userLimit,
          permissionOverwrites: overwrites,
          reason: `Temp voice created for ${newState.member.user.tag}`,
        });

        // Move member into the new channel
        // Re-fetch member to make sure their voice state is fresh
        const freshMember = await guild.members.fetch(newState.member.id).catch(() => newState.member);
        if (freshMember.voice.channelId) {
          await freshMember.voice.setChannel(channel, "Temp voice: moving to created channel").catch(async () => {
            // If move fails, delete the channel we just made
            await channel.delete("Temp voice: failed to move member").catch(() => {});
          });
        } else {
          // Member left voice before we could move them
          await channel.delete("Temp voice: member left before move").catch(() => {});
          delete tv._creating[newState.member.id];
          return;
        }

        tv.channels[channel.id] = {
          owner:   newState.member.id,
          created: Date.now(),
          name:    channelName,
          locked:  userPrefs.privacy === "locked" || isPrivateTrigger,
          private: isPrivateTrigger,
        };
        saveDB();
      } catch (err) {
        console.error("[TEMPVOICE] Create error:", err.message);
      } finally {
        delete tv._creating[newState.member.id];
      }
    }

    // ── User left a temp channel — delete if empty ────────────────────────
    if (oldState.channelId && tv.channels[oldState.channelId]) {
      const channel = guild.channels.cache.get(oldState.channelId);
      if (channel && channel.members.size === 0) {
        try {
          await channel.delete("Temp voice: all members left");
          delete tv.channels[oldState.channelId];
          saveDB();
        } catch (err) {
          // Channel already deleted or no permission — clean up the DB entry anyway
          if (err.code === 10003 /* Unknown Channel */ || err.code === 50013 /* Missing Perms */) {
            delete tv.channels[oldState.channelId];
            saveDB();
          }
          console.error("[TEMPVOICE] Delete error:", err.message);
        }
      }
    }
  }

  // Voice roles
  if (guildData(guildId).voiceRoles && guildData(guildId).voiceRoles[guild.id]) {
    // Joined a voice channel
    if (newState.channelId && guildData(guildId).voiceRoles[guild.id][newState.channelId] && newState.member) {
      const roleId = guildData(guildId).voiceRoles[guild.id][newState.channelId];
      const role = guild.roles.cache.get(roleId);
      if (role) {
        await newState.member.roles.add(role).catch(() => {});
      }
    }
    
    // Left a voice channel
    if (oldState.channelId && guildData(guildId).voiceRoles[guild.id][oldState.channelId] && oldState.member) {
      const roleId = guildData(guildId).voiceRoles[guild.id][oldState.channelId];
      const role = guild.roles.cache.get(roleId);
      if (role) {
        await oldState.member.roles.remove(role).catch(() => {});
      }
    }
  }

  // Voice logging
  if (guildData(guildId).logging?.enabled) {
    // Voice join
    if (!oldState.channelId && newState.channelId && guildData(guildId).logging.events?.voiceJoin) {
      await sendLogEvent(guild, "voiceJoin", {
        actor: newState.member?.user || newState.member,
        fields: [
          { name: "User", value: `${newState.member?.user.username || newState.member?.user.tag || "Unknown"}`, inline: true },
          { name: "Channel", value: `${newState.channel?.name || "Unknown"}`, inline: true }
        ],
        color: getThemeColor(guildId)
      });
    }
    
    // Voice leave
    if (oldState.channelId && !newState.channelId && guildData(guildId).logging.events?.voiceLeave) {
      await sendLogEvent(guild, "voiceLeave", {
        actor: oldState.member?.user || oldState.member,
        fields: [
          { name: "User", value: `${oldState.member?.user.username || oldState.member?.user.tag || "Unknown"}`, inline: true },
          { name: "Channel", value: `${oldState.channel?.name || "Unknown"}`, inline: true }
        ],
        color: getThemeColor(guildId)
      });
    }
    
    // Voice move
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId && guildData(guildId).logging.events?.voiceMove) {
      let movedBy = null;
      try {
        const auditLogs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberMove, limit: 5 });
        const entry = auditLogs.entries.find(log =>
          log.target?.id === newState.id && Date.now() - log.createdTimestamp < 10000
        );
        movedBy = entry?.executor || null;
      } catch {}
      await sendLogEvent(guild, "voiceMove", {
        actor: newState.member?.user || newState.member,
        fields: [
          { name: "User", value: `${newState.member?.user.username || newState.member?.user.tag || "Unknown"}`, inline: true },
          { name: "From", value: `${oldState.channel?.name || "Unknown"}`, inline: true },
          { name: "To", value: `${newState.channel?.name || "Unknown"}`, inline: true },
          { name: "Moved By", value: movedBy?.username || movedBy?.globalName || movedBy?.tag || "Unknown", inline: false }
        ],
        color: getThemeColor(guildId)
      });
    }
  }
});

/* ================= ROLE EVENTS ================= */
client.on("roleCreate", async (role) => {
  const guildId = role.guild.id;
  if (typeof wallGuardRolePermissions === "function") {
    try { await wallGuardRolePermissions(null, role, { auditType: AuditLogEvent.RoleCreate }); }
    catch (error) { console.error(`[WALL ROLE PERMISSIONS] guild=${guildId} role=${role.id}: ${error.message}`); }
  }

  // Antinuke: antirolecreate check
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antirolecreate !== false) {
    try {
      const auditLogs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== role.guild.ownerId) {
          await handleAntiNukeAction(role.guild, executor.id, "roleCreate");
        }
      }
    } catch (err) {}
  }

  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.roleCreate) {
    let executor = null;
    try {
      const al = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleCreate, limit: 1 });
      const entry = al.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    await sendLogEvent(role.guild, "roleCreate", {
      fields: [
        { name: `${EMOJIS.customroles} ${bold("Role")}`,      value: `${role} (\`${role.id}\`)`,                                              inline: true },
        { name: `🎨 ${bold("Color")}`,                         value: role.hexColor,                                                           inline: true },
        { name: `📍 ${bold("Position")}`,                      value: `${role.position}`,                                                      inline: true },
        { name: `${EMOJIS.crown} ${bold("Created By")}`,       value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown",           inline: true }
      ],
    });
  }
});

client.on("roleDelete", async (role) => {
  const guildId = role.guild.id;
  // Antinuke check
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antiroledelete !== false) {
    try {
      const auditLogs = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== role.guild.ownerId) {
          await handleAntiNukeAction(role.guild, executor.id, "roleDelete");
        }
      }
    } catch (err) {}
  }

  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.roleDelete) {
    let executor = null;
    try {
      const al = await role.guild.fetchAuditLogs({ type: AuditLogEvent.RoleDelete, limit: 1 });
      const entry = al.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    await sendLogEvent(role.guild, "roleDelete", {
      fields: [
        { name: `${EMOJIS.customroles} ${bold("Role")}`,  value: `${role.name} (\`${role.id}\`)`,                                    inline: true },
        { name: `🎨 ${bold("Color")}`,                     value: role.hexColor,                                                       inline: true },
        { name: `${EMOJIS.crown} ${bold("Deleted By")}`,   value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown",       inline: true }
      ],
    });
  }
});

client.on("roleUpdate", async (oldRole, newRole) => {
  const guildId = newRole.guild.id;
  if (typeof wallGuardRolePermissions === "function") {
    try { await wallGuardRolePermissions(oldRole, newRole); }
    catch (error) { console.error(`[WALL ROLE PERMISSIONS] guild=${guildId} role=${newRole.id}: ${error.message}`); }
  }
  if (!guildData(guildId).logging?.enabled || !guildData(guildId).logging.events?.roleUpdate) return;
  let executor = null;
  try {
    const al = await newRole.guild.fetchAuditLogs({ type: AuditLogEvent.RoleUpdate, limit: 1 });
    const entry = al.entries.first();
    if (entry && entry.target?.id === newRole.id && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
  } catch {}
  const changes = [];
  if (oldRole.name !== newRole.name)         changes.push({ name: `📝 ${bold("Name")}`,     value: `\`${oldRole.name}\` → \`${newRole.name}\``,           inline: false });
  if (oldRole.hexColor !== newRole.hexColor) changes.push({ name: `🎨 ${bold("Color")}`,    value: `\`${oldRole.hexColor}\` → \`${newRole.hexColor}\``,   inline: true  });
  if (oldRole.hoist !== newRole.hoist)       changes.push({ name: `📌 ${bold("Hoisted")}`,  value: `${oldRole.hoist} → ${newRole.hoist}`,                 inline: true  });
  if (oldRole.mentionable !== newRole.mentionable) changes.push({ name: `📣 ${bold("Mentionable")}`, value: `${oldRole.mentionable} → ${newRole.mentionable}`, inline: true });
  if (changes.length === 0) return;
  await sendLogEvent(newRole.guild, "roleUpdate", {
    fields: [
      { name: `${EMOJIS.customroles} ${bold("Role")}`,  value: `${newRole} (\`${newRole.id}\`)`,                                    inline: true },
      { name: `${EMOJIS.crown} ${bold("Updated By")}`,  value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown",       inline: true },
      ...changes
    ],
  });
});

/* ================= CHANNEL EVENTS ================= */
client.on("channelCreate", async (channel) => {
  if (!channel.guild) return;
  const guildId = channel.guild.id;
  if (typeof wallEnforceQuarantineChannelAccess === "function") {
    try { await wallEnforceQuarantineChannelAccess(channel); }
    catch (error) { console.error(`[WALL CHANNEL LOCKDOWN] guild=${guildId} channel=${channel.id}: ${error.message}`); }
  }

  // Antinuke: antichannelcreate check
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antichannelcreate !== false) {
    try {
      const auditLogs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== channel.guild.ownerId) {
          await handleAntiNukeAction(channel.guild, executor.id, "channelCreate");
        }
      }
    } catch (err) {}
  }

  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.channelCreate) {
    let executor = null;
    let auditReason = null;
    try {
      const al = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelCreate, limit: 1 });
      const entry = al.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10000) {
        executor   = entry.executor;
        auditReason = entry.reason || null;
      }
    } catch {}
    await sendLogEvent(channel.guild, "channelCreate", {
      fields: [
        // field[0] → smember line (who did it)
        { name: `${EMOJIS.crown} ${bold("Created By")}`, value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown", inline: false },
        // field[1] → tick line (channel)
        { name: `${EMOJIS.messages} ${bold("Channel")}`, value: `<#${channel.id}>`, inline: false },
        // field[2+] → arrow/reason lines
        { name: `📁 ${bold("Type")}`,                    value: ChannelType[channel.type] || "Unknown",               inline: false },
        { name: `${EMOJIS.info} ${bold("Reason")}`,      value: auditReason || "No reason provided",                  inline: false },
      ],
    });
  }
});

client.on("channelDelete", async (channel) => {
  if (!channel.guild) return;
  const guildId = channel.guild.id;
  const gd = guildData(guildId);

  // If a ticket channel is manually deleted, immediately close/cancel the
  // ticket record so the opener is not blocked by a stale open ticket.
  const tickets = gd.ticket?.tickets;
  if (tickets && typeof tickets === "object") {
    const ticketEntry = tickets[channel.id]
      ? [channel.id, tickets[channel.id]]
      : Object.entries(tickets).find(([, ticket]) => ticket?.channelId === channel.id);
    if (ticketEntry?.[1] && (ticketEntry[1].open || !ticketEntry[1].deleted)) {
      const [, ticket] = ticketEntry;
      ticket.open = false;
      ticket.closed = true;
      ticket.deleted = true;
      ticket.deletedAt = Date.now();
      ticket.closedAt = ticket.closedAt || ticket.deletedAt;
      ticket.closeReason = ticket.closeReason || "ticket_channel_deleted";
      saveDB();
      console.log(`[TICKET] Auto-closed stale ticket guild=${guildId} channel=${channel.id}`);
    }
  }
  
  // Antinuke check
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antichanneldelete !== false) {
    try {
      const auditLogs = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== channel.guild.ownerId) {
          await handleAntiNukeAction(channel.guild, executor.id, "channelDelete");
        }
      }
    } catch (err) {}
  }

  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.channelDelete) {
    let executor = null;
    let auditReason = null;
    try {
      const al = await channel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelDelete, limit: 1 });
      const entry = al.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10000) {
        executor    = entry.executor;
        auditReason = entry.reason || null;
      }
    } catch {}
    await sendLogEvent(channel.guild, "channelDelete", {
      fields: [
        // field[0] → smember line (who did it)
        { name: `${EMOJIS.crown} ${bold("Deleted By")}`,  value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown", inline: false },
        // field[1] → tick line (channel — deleted so use name, not mention)
        { name: `${EMOJIS.messages} ${bold("Channel")}`,  value: `#${channel.name}`,                                             inline: false },
        // field[2+] → arrow/reason lines
        { name: `📁 ${bold("Type")}`,                     value: ChannelType[channel.type] || "Unknown",                          inline: false },
        { name: `${EMOJIS.info} ${bold("Reason")}`,       value: auditReason || "No reason provided",                             inline: false },
      ],
    });
  }
  
  // Clean up sticky messages
  if (guildData(guildId).stickyMessages[channel.id]) {
    delete guildData(guildId).stickyMessages[channel.id];
    saveDB();
  }
  
  // Clean up auto delete
  if (guildData(guildId).autoDeleteTextOnly[channel.id] !== undefined) {
    delete guildData(guildId).autoDeleteTextOnly[channel.id];
    delete guildData(guildId).autoDeleteTextOnly[channel.id];
    saveDB();
  }
});

/* ================= CHANNEL UPDATE EVENT ================= */
client.on("channelUpdate", async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;
  const guildId = newChannel.guild.id;
  if (typeof wallEnforceQuarantineChannelAccess === "function") {
    try { await wallEnforceQuarantineChannelAccess(newChannel); }
    catch (error) { console.error(`[WALL CHANNEL LOCKDOWN] guild=${guildId} channel=${newChannel.id}: ${error.message}`); }
  }

  // ── AntiNuke: antipermschange — detect bulk/suspicious permission overwrite changes ──
  // This check runs independently of logging so antinuke works even when logging is off.
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antipermschange !== false) {
    const oldOws = oldChannel.permissionOverwrites?.cache;
    const newOws = newChannel.permissionOverwrites?.cache;
    // Detect if overwrites actually changed
    const owChanged = oldOws && newOws && (
      oldOws.size !== newOws.size ||
      [...newOws.values()].some(ow => {
        const old = oldOws.get(ow.id);
        return !old || old.allow.bitfield !== ow.allow.bitfield || old.deny.bitfield !== ow.deny.bitfield;
      })
    );
    if (owChanged) {
      try {
        // ChannelOverwriteUpdate covers create/update/delete of permission overwrites
        const al = await newChannel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelOverwriteUpdate, limit: 1 });
        const entry = al.entries.first();
        if (entry && entry.target?.id === newChannel.id && Date.now() - entry.createdTimestamp < 10000) {
          const executor = entry.executor;
          if (executor.id !== client.user.id && executor.id !== newChannel.guild.ownerId) {
            await handleAntiNukeAction(newChannel.guild, executor.id, "permschange");
          }
        }
      } catch {}
    }
  }

  // ── Logging ──
  if (!guildData(guildId).logging?.enabled || !guildData(guildId).logging.events?.channelUpdate) return;
  let executor = null;
  try {
    const al = await newChannel.guild.fetchAuditLogs({ type: AuditLogEvent.ChannelUpdate, limit: 1 });
    const entry = al.entries.first();
    if (entry && entry.target?.id === newChannel.id && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
  } catch {}
  const changes = [];
  if (oldChannel.name !== newChannel.name)                           changes.push({ name: `📝 ${bold("Name")}`,      value: `\`#${oldChannel.name}\` → \`#${newChannel.name}\``,              inline: false });
  if (oldChannel.topic !== newChannel.topic)                         changes.push({ name: `📄 ${bold("Topic")}`,     value: `${oldChannel.topic || "*None*"} → ${newChannel.topic || "*None*"}`,inline: false });
  if (oldChannel.nsfw !== newChannel.nsfw)                           changes.push({ name: `🔞 ${bold("NSFW")}`,      value: `${oldChannel.nsfw} → ${newChannel.nsfw}`,                         inline: true  });
  if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser)   changes.push({ name: `⏱️ ${bold("Slowmode")}`,  value: `${oldChannel.rateLimitPerUser}s → ${newChannel.rateLimitPerUser}s`,inline: true  });
  if (changes.length === 0) return;
  await sendLogEvent(newChannel.guild, "channelUpdate", {
    fields: [
      { name: `${EMOJIS.messages} ${bold("Channel")}`,  value: `<#${newChannel.id}> (\`${newChannel.id}\`)`,                          inline: true },
      { name: `${EMOJIS.crown} ${bold("Updated By")}`,  value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown",          inline: true },
      ...changes
    ],
  });
});

/* ================= GUILD UPDATE EVENT ================= */
client.on("guildUpdate", async (oldGuild, newGuild) => {
  const guildId = newGuild.id;
  if (!guildData(guildId).logging?.enabled || !guildData(guildId).logging.events?.guildUpdate) return;
  let executor = null;
  try {
    const al = await newGuild.fetchAuditLogs({ type: AuditLogEvent.GuildUpdate, limit: 1 });
    const entry = al.entries.first();
    if (entry && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
  } catch {}
  const changes = [];
  if (oldGuild.name !== newGuild.name)                   changes.push({ name: `📝 ${bold("Name")}`,            value: `\`${oldGuild.name}\` → \`${newGuild.name}\``,                        inline: false });
  if (oldGuild.icon !== newGuild.icon)                   changes.push({ name: `🖼️ ${bold("Icon")}`,            value: "Server icon was changed",                                            inline: true  });
  if (oldGuild.banner !== newGuild.banner)               changes.push({ name: `🎨 ${bold("Banner")}`,          value: "Server banner was changed",                                          inline: true  });
  if (oldGuild.verificationLevel !== newGuild.verificationLevel) changes.push({ name: `🔒 ${bold("Verification")}`, value: `Level ${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`, inline: true });
  if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) changes.push({ name: `🛡️ ${bold("Content Filter")}`, value: `${oldGuild.explicitContentFilter} → ${newGuild.explicitContentFilter}`, inline: true });
  if (changes.length === 0) return;
  await sendLogEvent(newGuild, "guildUpdate", {
    fields: [
      { name: `${EMOJIS.crown} ${bold("Updated By")}`, value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown", inline: true },
      ...changes
    ],
  });
});

/* ================= BAN EVENTS ================= */
client.on("guildBanAdd", async (ban) => {
  const guildId = ban.guild.id;
  // Antinuke check
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antiban !== false) {
    try {
      const auditLogs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== ban.guild.ownerId) {
          await handleAntiNukeAction(ban.guild, executor.id, "ban");
        }
      }
    } catch (err) {}
  }

  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.memberBan) {
    let executor = null;
    try {
      const al = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
      const entry = al.entries.first();
      if (entry && entry.target?.id === ban.user.id && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    await sendLogEvent(ban.guild, "memberBan", {
      fields: [
        { name: `${EMOJIS.confession} ${bold("User")}`,    value: `${ban.user.tag} (\`${ban.user.id}\`)`,                               inline: true },
        { name: `${EMOJIS.crown} ${bold("Banned By")}`,    value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown",         inline: true },
        { name: `${EMOJIS.file} ${bold("Reason")}`,        value: ban.reason || "No reason provided",                                   inline: false }
      ],
      thumbnail: ban.user.displayAvatarURL({ dynamic: true }),
    });
  }
});

client.on("guildBanRemove", async (ban) => {
  const guildId = ban.guild.id;
  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.memberUnban) {
    let executor = null;
    try {
      const al = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 1 });
      const entry = al.entries.first();
      if (entry && entry.target?.id === ban.user.id && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    await sendLogEvent(ban.guild, "memberUnban", {
      fields: [
        { name: `${EMOJIS.confession} ${bold("User")}`,    value: `${ban.user.tag} (\`${ban.user.id}\`)`,                               inline: true },
        { name: `${EMOJIS.crown} ${bold("Unbanned By")}`,  value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown",         inline: true }
      ],
      thumbnail: ban.user.displayAvatarURL({ dynamic: true }),
    });
  }
});

/* ================= INTERACTION HANDLER ================= */
/* ================= EMOJI EVENTS ================= */
client.on("emojiCreate", async (emoji) => {
  if (!emoji.guild) return;
  const guildId = emoji.guild.id;
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antiemojicreate !== false) {
    try {
      const auditLogs = await emoji.guild.fetchAuditLogs({ type: AuditLogEvent.EmojiCreate, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== emoji.guild.ownerId) {
          await handleAntiNukeAction(emoji.guild, executor.id, "emojiCreate");
        }
      }
    } catch {}
  }
  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.emojiCreate) {
    let executor = null;
    try {
      const al = await emoji.guild.fetchAuditLogs({ type: AuditLogEvent.EmojiCreate, limit: 1 });
      const entry = al.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    await sendLogEvent(emoji.guild, "emojiCreate", {
      fields: [
        { name: `${EMOJIS.fun} **Emoji**`,      value: `${emoji} \`${emoji.name}\` (\`${emoji.id}\`)`, inline: true },
        { name: `${EMOJIS.crown} **Created By**`, value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown", inline: true }
      ],
    });
  }
});

client.on("emojiDelete", async (emoji) => {
  if (!emoji.guild) return;
  const guildId = emoji.guild.id;
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antiemojidelete !== false) {
    try {
      const auditLogs = await emoji.guild.fetchAuditLogs({ type: AuditLogEvent.EmojiDelete, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== emoji.guild.ownerId) {
          await handleAntiNukeAction(emoji.guild, executor.id, "emojiDelete");
        }
      }
    } catch {}
  }
  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.emojiDelete) {
    let executor = null;
    try {
      const al = await emoji.guild.fetchAuditLogs({ type: AuditLogEvent.EmojiDelete, limit: 1 });
      const entry = al.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    await sendLogEvent(emoji.guild, "emojiDelete", {
      fields: [
        { name: `${EMOJIS.fun} **Emoji**`,      value: `\`${emoji.name}\` (\`${emoji.id}\`)`, inline: true },
        { name: `${EMOJIS.crown} **Deleted By**`, value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown", inline: true }
      ],
    });
  }
});

client.on("emojiUpdate", async (oldEmoji, newEmoji) => {
  if (!newEmoji.guild) return;
  const guildId = newEmoji.guild.id;
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antiemojiupdate !== false) {
    try {
      const auditLogs = await newEmoji.guild.fetchAuditLogs({ type: AuditLogEvent.EmojiUpdate, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== newEmoji.guild.ownerId) {
          await handleAntiNukeAction(newEmoji.guild, executor.id, "emojiUpdate");
        }
      }
    } catch {}
  }
  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.emojiUpdate) {
    let executor = null;
    try {
      const al = await newEmoji.guild.fetchAuditLogs({ type: AuditLogEvent.EmojiUpdate, limit: 1 });
      const entry = al.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    const changes = [];
    if (oldEmoji.name !== newEmoji.name) changes.push({ name: `📝 **Name**`, value: `\`${oldEmoji.name}\` → \`${newEmoji.name}\``, inline: false });
    if (changes.length === 0) return;
    await sendLogEvent(newEmoji.guild, "emojiUpdate", {
      fields: [
        { name: `${EMOJIS.fun} **Emoji**`,       value: `${newEmoji} (\`${newEmoji.id}\`)`, inline: true },
        { name: `${EMOJIS.crown} **Updated By**`, value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown", inline: true },
        ...changes
      ],
    });
  }
});

/* ================= STICKER EVENTS ================= */
client.on("stickerCreate", async (sticker) => {
  if (!sticker.guild) return;
  const guildId = sticker.guild.id;
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antistickercreate !== false) {
    try {
      const auditLogs = await sticker.guild.fetchAuditLogs({ type: AuditLogEvent.StickerCreate, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== sticker.guild.ownerId) {
          await handleAntiNukeAction(sticker.guild, executor.id, "stickerCreate");
        }
      }
    } catch {}
  }
  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.stickerCreate) {
    let executor = null;
    try {
      const al = await sticker.guild.fetchAuditLogs({ type: AuditLogEvent.StickerCreate, limit: 1 });
      const entry = al.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    await sendLogEvent(sticker.guild, "stickerCreate", {
      fields: [
        { name: `${EMOJIS.sticker} **Sticker**`,  value: `\`${sticker.name}\` (\`${sticker.id}\`)`, inline: true },
        { name: `${EMOJIS.crown} **Created By**`,  value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown", inline: true }
      ],
    });
  }
});

client.on("stickerDelete", async (sticker) => {
  if (!sticker.guild) return;
  const guildId = sticker.guild.id;
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antistickerdelete !== false) {
    try {
      const auditLogs = await sticker.guild.fetchAuditLogs({ type: AuditLogEvent.StickerDelete, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== sticker.guild.ownerId) {
          await handleAntiNukeAction(sticker.guild, executor.id, "stickerDelete");
        }
      }
    } catch {}
  }
  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.stickerDelete) {
    let executor = null;
    try {
      const al = await sticker.guild.fetchAuditLogs({ type: AuditLogEvent.StickerDelete, limit: 1 });
      const entry = al.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    await sendLogEvent(sticker.guild, "stickerDelete", {
      fields: [
        { name: `${EMOJIS.sticker} **Sticker**`,  value: `\`${sticker.name}\` (\`${sticker.id}\`)`, inline: true },
        { name: `${EMOJIS.crown} **Deleted By**`,  value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown", inline: true }
      ],
    });
  }
});

client.on("stickerUpdate", async (oldSticker, newSticker) => {
  if (!newSticker.guild) return;
  const guildId = newSticker.guild.id;
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antistickerupdate !== false) {
    try {
      const auditLogs = await newSticker.guild.fetchAuditLogs({ type: AuditLogEvent.StickerUpdate, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== newSticker.guild.ownerId) {
          await handleAntiNukeAction(newSticker.guild, executor.id, "stickerUpdate");
        }
      }
    } catch {}
  }
  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.stickerUpdate) {
    let executor = null;
    try {
      const al = await newSticker.guild.fetchAuditLogs({ type: AuditLogEvent.StickerUpdate, limit: 1 });
      const entry = al.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    const changes = [];
    if (oldSticker.name !== newSticker.name) changes.push({ name: `📝 **Name**`, value: `\`${oldSticker.name}\` → \`${newSticker.name}\``, inline: false });
    if (oldSticker.description !== newSticker.description) changes.push({ name: `📄 **Description**`, value: `${oldSticker.description || "*None*"} → ${newSticker.description || "*None*"}`, inline: false });
    if (changes.length === 0) return;
    await sendLogEvent(newSticker.guild, "stickerUpdate", {
      fields: [
        { name: `${EMOJIS.sticker} **Sticker**`,  value: `\`${newSticker.name}\` (\`${newSticker.id}\`)`, inline: true },
        { name: `${EMOJIS.crown} **Updated By**`,  value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown", inline: true },
        ...changes
      ],
    });
  }
});

/* ================= WEBHOOK EVENTS ================= */
// Discord fires a single "webhooksUpdate" event per channel, not per webhook.
// We fetch the audit log to determine create/delete/update and apply the
// appropriate antinuke check.
client.on("webhooksUpdate", async (channel) => {
  if (!channel.guild) return;
  const guildId = channel.guild.id;
  const an = guildData(guildId).antinuke;
  const security = guildData(guildId).security || {};

  // This controls Security Dashboard alerts only. Anti-Nuke's webhook
  // protection remains independent, even when webhook guard is disabled.
  if (security.webhookGuard !== false && security.enabled !== false) {
    await soezySecurity?.handleWebhookUpdate?.(channel).catch(() => {});
  }

  try {
    // Probe the three webhook audit log types and take the most recent
    const [createLogs, deleteLogs, updateLogs] = await Promise.all([
      channel.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 1 }).catch(() => null),
      channel.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookDelete, limit: 1 }).catch(() => null),
      channel.guild.fetchAuditLogs({ type: AuditLogEvent.WebhookUpdate, limit: 1 }).catch(() => null),
    ]);

    const candidates = [
      { log: createLogs?.entries.first(), eventId: "antiwebhookcreate", action: "webhookCreate" },
      { log: deleteLogs?.entries.first(), eventId: "antiwebhookdelete", action: "webhookDelete" },
      { log: updateLogs?.entries.first(), eventId: "antiwebhookupdate", action: "webhookUpdate" },
    ].filter(c => c.log && Date.now() - c.log.createdTimestamp < 10000);

    for (const { log, eventId, action } of candidates) {
      const executor = log.executor;
      if (!executor || executor.id === client.user.id || executor.id === channel.guild.ownerId) continue;
      if (an?.enabled && an?.events?.[eventId] !== false) {
        await handleAntiNukeAction(channel.guild, executor.id, action);
      }
      if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.[action]) {
        await sendLogEvent(channel.guild, action, {
          fields: [
            { name: `${EMOJIS.link} **Channel**`,    value: `<#${channel.id}>`, inline: true },
            { name: `${EMOJIS.crown} **Executor**`,  value: `${executor.tag} (\`${executor.id}\`)`, inline: true }
          ],
        });
      }
    }
  } catch {}
});

/* ================= AUTOMOD RULE EVENTS ================= */
client.on("autoModerationRuleCreate", async (rule) => {
  const guildId = rule.guild.id;
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antiautomodcreate !== false) {
    try {
      const auditLogs = await rule.guild.fetchAuditLogs({ type: AuditLogEvent.AutoModerationRuleCreate, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== rule.guild.ownerId) {
          await handleAntiNukeAction(rule.guild, executor.id, "autoModerationRuleCreate");
        }
      }
    } catch {}
  }
  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.autoModerationRuleCreate) {
    let executor = null;
    try {
      const al = await rule.guild.fetchAuditLogs({ type: AuditLogEvent.AutoModerationRuleCreate, limit: 1 });
      const entry = al.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    await sendLogEvent(rule.guild, "autoModerationRuleCreate", {
      fields: [
        { name: `${EMOJIS.automod} **Rule**`,     value: `\`${rule.name}\` (\`${rule.id}\`)`, inline: true },
        { name: `${EMOJIS.crown} **Created By**`, value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown", inline: true }
      ],
    });
  }
});

client.on("autoModerationRuleDelete", async (rule) => {
  const guildId = rule.guild.id;
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antiautomoddelete !== false) {
    try {
      const auditLogs = await rule.guild.fetchAuditLogs({ type: AuditLogEvent.AutoModerationRuleDelete, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== rule.guild.ownerId) {
          await handleAntiNukeAction(rule.guild, executor.id, "autoModerationRuleDelete");
        }
      }
    } catch {}
  }
  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.autoModerationRuleDelete) {
    let executor = null;
    try {
      const al = await rule.guild.fetchAuditLogs({ type: AuditLogEvent.AutoModerationRuleDelete, limit: 1 });
      const entry = al.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    await sendLogEvent(rule.guild, "autoModerationRuleDelete", {
      fields: [
        { name: `${EMOJIS.automod} **Rule**`,     value: `\`${rule.name}\` (\`${rule.id}\`)`, inline: true },
        { name: `${EMOJIS.crown} **Deleted By**`, value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown", inline: true }
      ],
    });
  }
});

client.on("autoModerationRuleUpdate", async (oldRule, newRule) => {
  const guildId = newRule.guild.id;
  if (!globalThis.soezyEmergency?.auditDriven && featureSecurityPremiumActive(guildId) && guildData(guildId).antinuke?.enabled && guildData(guildId).antinuke?.events?.antiautomod !== false) {
    try {
      const auditLogs = await newRule.guild.fetchAuditLogs({ type: AuditLogEvent.AutoModerationRuleUpdate, limit: 1 });
      const log = auditLogs.entries.first();
      if (log && Date.now() - log.createdTimestamp < 10000) {
        const executor = log.executor;
        if (executor.id !== client.user.id && executor.id !== newRule.guild.ownerId) {
          await handleAntiNukeAction(newRule.guild, executor.id, "autoModerationRuleUpdate");
        }
      }
    } catch {}
  }
  if (guildData(guildId).logging?.enabled && guildData(guildId).logging.events?.autoModerationRuleUpdate) {
    let executor = null;
    try {
      const al = await newRule.guild.fetchAuditLogs({ type: AuditLogEvent.AutoModerationRuleUpdate, limit: 1 });
      const entry = al.entries.first();
      if (entry && Date.now() - entry.createdTimestamp < 10000) executor = entry.executor;
    } catch {}
    const changes = [];
    if (oldRule?.name !== newRule.name) changes.push({ name: `📝 **Name**`, value: `\`${oldRule?.name}\` → \`${newRule.name}\``, inline: false });
    if (oldRule?.enabled !== newRule.enabled) changes.push({ name: `🔘 **Enabled**`, value: `${oldRule?.enabled} → ${newRule.enabled}`, inline: true });
    await sendLogEvent(newRule.guild, "autoModerationRuleUpdate", {
      fields: [
        { name: `${EMOJIS.automod} **Rule**`,     value: `\`${newRule.name}\` (\`${newRule.id}\`)`, inline: true },
        { name: `${EMOJIS.crown} **Updated By**`, value: executor ? `${executor.tag} (\`${executor.id}\`)` : "Unknown", inline: true },
        ...(changes.length ? changes : [{ name: `📋 **Change**`, value: "Rule configuration updated", inline: false }])
      ],
    });
  }
});

const nativeAutomodPunishment = require("./utils/automodPunishment");
const nativeAutomodClaims = globalThis.__soezyNativeAutomodClaims || (globalThis.__soezyNativeAutomodClaims = new Map());
const nativeAutomodCategories = {
  spam: "spam", duplicate: "duplicate", caps: "caps", mentions: "mentions", zalgo: "zalgo",
  everyone: "everyone", "automod-invites": "invite", "automod-links": "antilink",
  badwords: "badwords", nsfw: "nsfw", "scam-phrases": "scams", presets: "badwords", profiles: "badwords",
};

async function enforceNativeAutomod(execution) {
  const guild = execution.guild;
  const userId = String(execution.userId || "");
  if (!guild || !userId || userId === client.user?.id) return;
  const gd = guildData(guild.id);
  const am = gd.automod || {};
  if ((am.systemEnabled ?? am.enabled) !== true) return;

  const ruleEntries = Object.entries(gd.nativeAutomod?.ruleIds || {})
    .filter(([, id]) => String(id) === String(execution.ruleId));
  const key = ruleEntries.map(([name]) => name.replace(/^filter_/, "")).find(name => nativeAutomodCategories[name]);
  const category = nativeAutomodCategories[key];
  if (!category) return;

  const featureEnabled = {
    spam: am.features?.antiSpam?.enabled ?? am.antiSpam?.enabled,
    duplicate: am.features?.duplicate?.enabled ?? am.advanced?.duplicate?.enabled,
    caps: am.features?.antiCaps?.enabled ?? am.antiCaps?.enabled,
    mentions: am.features?.antiMassMention?.enabled ?? am.antiMassMention?.enabled,
    invite: am.features?.antiInvite?.enabled ?? am.antiInvite?.enabled,
    antilink: am.features?.antiLink?.enabled ?? am.antiLink?.enabled,
    zalgo: am.features?.antiZalgo?.enabled ?? gd.security?.antiZalgo,
    everyone: am.features?.antiEveryoneBP?.enabled ?? gd.security?.antiEveryoneBP,
    badwords: am.features?.badWords?.enabled ?? gd.badWordEnabled,
    nsfw: am.features?.nsfw?.enabled ?? gd.nsfwProtection,
    scams: am.features?.scams?.enabled ?? am.advanced?.scams?.enabled,
  }[category];
  if (featureEnabled !== true) return;

  const now = Date.now();
  for (const [claim, expiry] of nativeAutomodClaims) if (expiry <= now) nativeAutomodClaims.delete(claim);
  const claim = `${guild.id}:${userId}:${execution.ruleId}:${execution.messageId || Math.floor(now / 5000)}`;
  if (nativeAutomodClaims.has(claim)) return;
  if (nativeAutomodClaims.size > 10000) nativeAutomodClaims.delete(nativeAutomodClaims.keys().next().value);
  nativeAutomodClaims.set(claim, now + 30000);

  let action = nativeAutomodPunishment.resolve(am, category) || "block";
  if (action === "mute") action = "timeout";
  if (action === "delete") action = "block";
  const reason = `AutoMod ${category} protection`;
  if (action === "warn") {
    await client.users.fetch(userId).then(user => user.send(`A message in **${guild.name}** was blocked by AutoMod (${category}).`)).catch(() => {});
    return;
  }
  if (action === "block") return;

  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (!member) return;
  try {
    if (action === "timeout") {
      const timeoutMs = category === "spam"
        ? Number(am.antiSpam?.duration ?? am.antiSpam?.timeoutMs)
        : category === "duplicate"
          ? Number(am.advanced?.duplicate?.timeoutMs)
          : category === "nsfw" ? Number(gd.nsfwConfig?.timeoutMs) : 30 * 60 * 1000;
      if (member.moderatable === false) throw new Error("member is not moderatable (permission or role hierarchy)");
      await member.timeout(Math.max(60000, Math.min(28 * 24 * 60 * 60 * 1000, timeoutMs || 30 * 60 * 1000)), reason);
      const channel = guild.channels.cache.get(String(execution.channelId || ""));
      if (channel?.messages?.fetch) {
        const recent = await channel.messages.fetch({ limit: 100 }).catch(() => null);
        const authored = [...(recent?.values?.() || [])]
          .filter(message => message.author?.id === userId)
          .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
          .slice(0, 10);
        await Promise.all(authored.map(message => message.deletable === false ? null : message.delete().catch(() => null)));
      }
    } else if (action === "kick") {
      if (member.kickable === false) throw new Error("member is not kickable (permission or role hierarchy)");
      await member.kick(reason);
    } else if (action === "ban") {
      if (member.bannable === false) throw new Error("member is not bannable (permission or role hierarchy)");
      await member.ban({ reason });
    }
  } catch (error) {
    console.warn(`[AutoMod] Native ${category} punishment failed for ${userId}: ${error.message}`);
  }
}

client.on("autoModerationActionExecution", async (execution) => {
  const guild = execution.guild;
  if (!guild) return;
  await enforceNativeAutomod(execution).catch(error => console.error("[AutoMod] Native action enforcement failed:", error));
  const gd = guildData(guild.id);
  if (!gd.logging?.enabled || !gd.logging.events?.autoModerationActionExecution) return;
  const actionType = execution.action?.type === 1 ? "Block message" : execution.action?.type === 2 ? "Send alert" : `Action ${execution.action?.type ?? "unknown"}`;
  await sendLogEvent(guild, "autoModerationActionExecution", {
    fields: [
      { name: `${EMOJIS.automod} **Rule**`, value: execution.ruleId ? `\`${execution.ruleId}\`` : "Unknown", inline: true },
      { name: `${EMOJIS.crown || "👤"} **Member**`, value: execution.userId ? `<@${execution.userId}> (\`${execution.userId}\`)` : "Unknown", inline: true },
      { name: `${EMOJIS.channel || "#️⃣"} **Channel**`, value: execution.channelId ? `<#${execution.channelId}>` : "Unknown", inline: true },
      { name: `${EMOJIS.shield || "🛡️"} **Action**`, value: actionType, inline: true },
      { name: `${EMOJIS.info || "ℹ️"} **Trigger**`, value: `\`${execution.ruleTriggerType ?? "unknown"}\``, inline: true },
    ],
  });
});

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) return;
    // Fetch partials
    if (reaction.partial) await reaction.fetch();
    if (reaction.message.partial) await reaction.message.fetch();

    const guild = reaction.message.guild;
    if (!guild) return;
    const gId = guild.id;

    // ── REACTION ROLES ────────────────────────────────────────────────────────
    const rrPanels = guildData(gId).reactionRoles;
    if (rrPanels?.[reaction.message.id]) {
      const panel = rrPanels[reaction.message.id];
      const reactionEmoji = reaction.emoji.id
        ? `<:${reaction.emoji.name}:${reaction.emoji.id}>`
        : reaction.emoji.name;
      const rrEntry = panel.roles?.find(r =>
        r.emoji === reactionEmoji ||
        r.emoji === reaction.emoji.name ||
        (reaction.emoji.id && r.emoji === `<a:${reaction.emoji.name}:${reaction.emoji.id}>`)
      );
      if (rrEntry) {
        try {
          const member = await guild.members.fetch(user.id).catch(() => null);
          if (member && !member.roles.cache.has(rrEntry.roleId)) {
            await member.roles.add(rrEntry.roleId, "Reaction Role").catch(() => {});
          }
        } catch {}
      }
      return;
    }
  } catch (e) {
    console.error("Reaction role add error:", e);
  }
});

} // end __soezyFeatureEventsLoaded guard
