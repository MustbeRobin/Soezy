/* ================= ERROR HANDLING ================= */
if (typeof globalThis.__soezyProcessErrorHandlersLoaded === "undefined") {
  globalThis.__soezyProcessErrorHandlersLoaded = true;
  if (!globalThis.__soezyCrashRecoveryInstalled) {
    process.on("unhandledRejection", error => {
      console.error("Unhandled promise rejection:", error);
    });

    process.on("uncaughtException", error => {
      console.error("Uncaught exception:", error);
    });
  }
} else {
  console.warn("[ERRORS] Process error handlers already registered; skipped duplicate.");
}

// ── Premium expiry checker (runs every 6 hours) ──────────────────────────────
// • Warns users 3 days before expiry (DM + log channel)
// • Removes premium role & channel overwrites the moment premium expires
if (typeof globalThis.__soezyExpiryTimersLoaded === "undefined") {
globalThis.__soezyExpiryTimersLoaded = true;
setInterval(async () => {
  const now = Date.now();
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
  for (const [userId, pData] of Object.entries(db.premium?.users || {})) {
    const timeLeft = pData.expiresAt - now;
    // ── Just expired ──
    if (timeLeft <= 0 && !pData._expiredNotified) {
      pData._expiredNotified = true; saveDB();
      // DM the user
      try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
          const expiredContainer = new ContainerBuilder()
            .addTextDisplayComponents(t => t.setContent(
              `### ${EMOJIS.gem} Your Premium Has Expired\nYour premium subscription has ended. You will lose access to premium channels and your premium role in shared servers.\n\nContact a **Soezy dev** to renew your premium!`
            ));
          await user.send({ components: [expiredContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
      } catch {}
      // Remove role + channel overwrites in every shared guild
      for (const [gId, g] of Object.entries(db.guilds || {})) {
        try {
          const guild = await client.guilds.fetch(gId).catch(() => null);
          if (!guild) continue;
          if (g.premiumRole) {
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member?.roles.cache.has(g.premiumRole)) await member.roles.remove(g.premiumRole).catch(() => {});
          }
          for (const chId of (g.premiumChannels || [])) {
            const ch = guild.channels.cache.get(chId);
            if (ch) await ch.permissionOverwrites.delete(userId).catch(() => {});
          }
          // Log to premium log channel
          if (g.premiumLogChannel) {
            const logCh = guild.channels.cache.get(g.premiumLogChannel);
            if (logCh?.isTextBased()) {
              await sendLoggingContainer(logCh, "premiumExpired", {
                guild,
                title: "Premium Expired",
                icon: EMOJIS.error,
                fields: [
                  { name: "User", value: `<@${userId}> (\`${userId}\`)` },
                  { name: "Action", value: "Premium role and channel access removed automatically." },
                ],
              }).catch(() => {});
            }
          }
        } catch {}
      }
    }
    // ── 3-day warning (send once) ──
    if (timeLeft > 0 && timeLeft <= THREE_DAYS && !pData._warnedSoon) {
      pData._warnedSoon = true; saveDB();
      try {
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
          const warnContainer = new ContainerBuilder()
            .addTextDisplayComponents(t => t.setContent(
              `### ${EMOJIS.warning} Premium Expiring Soon!\nYour premium expires <t:${Math.floor(pData.expiresAt/1000)}:R>.\nContact a **Soezy dev** to renew before you lose access!`
            ));
          await user.send({ components: [warnContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
        }
      } catch {}
      // Also log warning to each shared guild's log channel
      for (const [gId, g] of Object.entries(db.guilds || {})) {
        if (!g.premiumLogChannel) continue;
        try {
          const guild = await client.guilds.fetch(gId).catch(() => null);
          const logCh = guild?.channels.cache.get(g.premiumLogChannel);
          if (logCh?.isTextBased()) {
            await sendLoggingContainer(logCh, "premiumExpiring", {
              guild,
              title: "Premium Expiring Soon",
              icon: EMOJIS.warning,
              fields: [
                { name: "User", value: `<@${userId}> (\`${userId}\`)` },
                { name: "Expires", value: `<t:${Math.floor(pData.expiresAt / 1000)}:R>` },
              ],
            }).catch(() => {});
          }
        } catch {}
      }
    }
  }
}, 6 * 60 * 60 * 1000);

// ── Shop timed-item expiry checker (runs every 30 minutes) ───────────────────
// Clears expired no_prefix / bot_avatar / bot_banner / shopPremium entries
setInterval(async () => {
  const now = Date.now();
  let changed = false;

  // Per-guild activeItems
  for (const [gId, g] of Object.entries(db.guilds || {})) {
    const ai = g.activeItems;
    if (!ai) continue;
    for (const [uid, items] of Object.entries(ai)) {
      for (const cat of ["no_prefix", "bot_avatar", "bot_banner"]) {
        if (items[cat] && items[cat].expiresAt <= now) {
          delete ai[uid][cat];
          changed = true;
          // If bot_avatar or bot_banner expired, clear guild-scoped identity if this user last set it
          if ((cat === "bot_avatar" || cat === "bot_banner") && g.guildBotIdentity) {
            delete g.guildBotIdentity[cat === "bot_avatar" ? "avatar" : "banner"];
            // Attempt to reset guild avatar/banner to global
            try {
              const field = cat === "bot_avatar" ? "avatar" : "banner";
              await restClient.patch(Routes.guildMember(gId, client.user.id), { body: { [field]: null } }).catch(() => {});
            } catch {}
          }
        }
      }
      // Clean up empty user entries
      if (Object.keys(ai[uid]).length === 0) delete ai[uid];
    }
    if (Object.keys(ai).length === 0) delete g.activeItems;
  }

  // Global shopPremium
  if (db.shopPremium) {
    for (const [uid, guilds] of Object.entries(db.shopPremium)) {
      for (const [gId, pdata] of Object.entries(guilds)) {
        if (pdata.expiresAt <= now) {
          delete db.shopPremium[uid][gId];
          changed = true;
          // Notify user
          try {
            const u = await client.users.fetch(uid).catch(() => null);
            if (u) {
              const c = new ContainerBuilder().addTextDisplayComponents(t => t.setContent(
                `### ${EMOJIS.gem} Shop Premium Expired\nYour shop Premium subscription for a server has ended. Renew anytime with \`${getPrefix(gId)}buy Premium\`!`
              ));
              await u.send({ components: [c], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
            }
          } catch {}
          // Remove premium role and channel access in the expired guild
          try {
            const guild = await client.guilds.fetch(gId).catch(() => null);
            if (guild) {
              const gd = db.guilds?.[gId];
              // Remove premium role
              if (gd?.premiumRole) {
                const member = await guild.members.fetch(uid).catch(() => null);
                if (member?.roles.cache.has(gd.premiumRole)) {
                  await member.roles.remove(gd.premiumRole, "Shop Premium expired").catch(() => {});
                }
              }
              // Remove premium channel overwrites
              for (const chId of (gd?.premiumChannels || [])) {
                const ch = guild.channels.cache.get(chId);
                if (ch) await ch.permissionOverwrites.delete(uid, "Shop Premium expired").catch(() => {});
              }
            }
          } catch {}
        }
      }
      if (Object.keys(db.shopPremium[uid]).length === 0) delete db.shopPremium[uid];
    }
  }

  if (changed) saveDB();
}, 30 * 60 * 1000);
} else {
  console.warn("[ERRORS] Expiry timers already active; skipped duplicate timers.");
}
