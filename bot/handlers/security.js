var soezyNativeFilterState = require("./utils/nativeAutomodState");
var soezySecurity = (() => {
  // ─────────────────────────────────────────────
  //  In-memory state maps
  // ─────────────────────────────────────────────
  const userViolations        = new Map(); // key: guildId:userId
  const userMessageWindows    = new Map(); // rate-limit windows
  const guildCommandWindows   = new Map();
  const guildJoinWindows      = new Map();
  const raidModeGuilds        = new Map();
  const duplicateMessageCache = new Map(); // key: guildId:userId  → { text, count, ts }
  const reactionWindows       = new Map(); // key: guildId:userId
  const userCommandWindows    = new Map(); // per-user command cooldown
  const roleLocks             = new Map(); // key: guildId:roleId  → true
  const mentionSpikeWindows   = new Map(); // key: guildId
  const banWaveWindows        = new Map(); // key: guildId:modId   → timestamps[]
  const recentBans            = new Map(); // key: guildId         → [{ userId, modId, ts }]

  // ─────────────────────────────────────────────
  //  Phishing / unsafe-link pattern lists
  // ─────────────────────────────────────────────
  const invitePattern = /\b(?:discord\.gg|discord(?:app)?\.com\/invite|discord\.com\/invites)\/[a-z0-9-]+/i;

  // Extended unsafe-link pattern: known phishing domains + generic shorteners + loggers
  const PHISHING_DOMAINS = [
    // grabbers / ip loggers
    "grabify\\.link","iplogger\\.org","iplogger\\.co","blasze\\.tk","2no\\.co",
    "yip\\.su","ps3cfw\\.com","yourfreemp3\\.com","cdn\\.discordapp\\.com\\.de",
    "discordnitro\\.gift","discordgift\\.site","dlscord\\.org","dlscord\\.com",
    "steamcommumity\\.com","stearnpowered\\.com","steamcommunity\\.gift",
    // shorteners
    "bit\\.ly\\/","tinyurl\\.com\\/","ow\\.ly\\/","t\\.co\\/","buff\\.ly\\/",
    "rebrand\\.ly\\/","shorturl\\.at\\/","cutt\\.ly\\/",
    // nitro / gift scams
    "discordnitro\\.","free-nitro\\.","freenitr\\.","discord-gift\\.",
    "nitro-gift\\.","getdiscord\\.","discordapp\\.net","discord-steam\\.",
    // crypto / financial scams
    "free-crypto\\.","claim-reward\\.","nft-drop\\.","nftairdrop\\.",
    // dangerous schemes
    "javascript:","data:","file:",
  ];
  const unsafeLinkPattern = new RegExp(
    `\\b(?:${PHISHING_DOMAINS.join("|")})`,
    "i"
  );

  // Zero-width / homoglyph @everyone bypass
  // Catches @\u200beveryone, @​here, invisible-char variants, etc.
  const everyoneBypassPattern =
    /@[\u200b\u200c\u200d\u2060\ufeff\u00a0\u180e\u2000-\u200a\u202f\u205f\u3000]*(every\s*one|here)\b/i;

  // Zalgo detector — characters that stack combining diacritics abnormally
  const zalgoPattern = /([\u0300-\u036f\u0488\u0489\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]{3,})/;

  // ─────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────
  function now() { return Date.now(); }

  function isAdmin(member) {
    return typeof hasGuildPermission === "function"
      ? hasGuildPermission(member, ["Administrator"])
      : !!member?.permissions?.has(PermissionsBitField.Flags.Administrator);
  }

  function isOwner(userId) {
    return config.ownerIds?.includes(userId);
  }

  function securityPremiumActive(guildId) {
    if (!guildId) return false;
    if (typeof hasSecurityPremium === "function") return hasSecurityPremium(guildId);
    if (typeof isPremiumGuild === "function" && isPremiumGuild(guildId)) return true;
    const shopPremium = db.shopPremium || {};
    return Object.values(shopPremium).some(perGuild => {
      const entry = perGuild?.[guildId];
      return entry?.expiresAt && Date.now() < entry.expiresAt;
    });
  }

  function getSecurity(guildId) {
    const gd = guildData(guildId);
    if (!gd.security) gd.security = {};
    const s = gd.security;
    s.enabled = gd.automod?.enabled === true;
    if (!s.blacklistedUsers)    s.blacklistedUsers    = {};
    if (!s.violations)          s.violations          = {};
    if (!s.inviteWhitelist)     s.inviteWhitelist     = [];
    if (!Array.isArray(s.whitelistUsers)) s.whitelistUsers = [];
    if (!Array.isArray(s.whitelistRoles)) s.whitelistRoles = [];
    if (!Array.isArray(s.whitelistChannels)) s.whitelistChannels = [];
    if (!Array.isArray(s.immuneChannels)) s.immuneChannels = s.whitelistChannels;
    if (!s.raidMode)            s.raidMode            = { enabled: false, until: 0 };
    if (!s.lockedRoles)         s.lockedRoles         = [];
    if (!s.channelMaxLength)    s.channelMaxLength    = {}; // { channelId: number }
    // automod toggles — all default on
    if (s.antiPhishing    === undefined) s.antiPhishing    = true;
    if (s.antiCaps        === undefined) s.antiCaps        = true;
    if (s.antiCapsThresh  === undefined) s.antiCapsThresh  = 70; // %
    if (s.antiCapsMinLen  === undefined) s.antiCapsMinLen  = 8;  // min chars to apply
    if (s.antiZalgo       === undefined) s.antiZalgo       = true;
    if (s.antiDuplicate   === undefined) s.antiDuplicate   = true;
    if (s.antiEveryoneBP  === undefined) s.antiEveryoneBP  = true;
    if (s.accountAgeDays  === undefined) s.accountAgeDays  = 0;   // 0 = disabled
    if (s.webhookGuard === undefined) s.webhookGuard = true;
    let removedLegacyConfig = false;
    for (const key of ["joinCaptcha", "noAvatarGate", "slowmodeManager", "slowmodeThresh", "slowmodeSeconds", "ghostPingDetect"]) {
      if (Object.prototype.hasOwnProperty.call(s, key)) {
        delete s[key];
        removedLegacyConfig = true;
      }
    }
    if (Object.prototype.hasOwnProperty.call(gd, "ghostPingLog")) {
      delete gd.ghostPingLog;
      removedLegacyConfig = true;
    }
    if (removedLegacyConfig) saveDB();
    if (!s.logChannels)                  s.logChannels     = {};  // { security: id, forensics: id }
    return s;
  }

  function getNightMode(guildId) {
    const gd = guildData(guildId);
    if (!gd.settings || typeof gd.settings !== "object" || Array.isArray(gd.settings)) gd.settings = {};
    if (!gd.nightmode || typeof gd.nightmode !== "object" || Array.isArray(gd.nightmode)) gd.nightmode = {};
    const saved = gd.settings.nightmode && typeof gd.settings.nightmode === "object" ? gd.settings.nightmode : gd.nightmode;
    const state = {
      enabled: saved.enabled !== false,
      startHour: Number.isFinite(Number(saved.startHour)) ? Number(saved.startHour) : 0,
      endHour: Number.isFinite(Number(saved.endHour)) ? Number(saved.endHour) : 6,
      forceActive: saved.forceActive === true,
      updatedAt: saved.updatedAt || null,
      updatedBy: saved.updatedBy || null,
    };
    state.startHour = Math.max(0, Math.min(23, state.startHour));
    state.endHour = Math.max(0, Math.min(23, state.endHour));
    gd.settings.nightmode = state;
    gd.nightmode = state;
    return state;
  }

  function isNightMode(guildId) {
    const state = getNightMode(guildId);
    if (!state.enabled) return false;
    if (state.forceActive) return true;
    const hour = typeof getCurrentHourInGuildTZ === "function"
      ? getCurrentHourInGuildTZ(guildId)
      : new Date().getHours();
    if (state.startHour === state.endHour) return true;
    if (state.startHour < state.endHour) return hour >= state.startHour && hour < state.endHour;
    return hour >= state.startHour || hour < state.endHour;
  }

  function pruneWindow(key, map, interval) {
    const cutoff = now() - interval;
    const arr = (map.get(key) || []).filter(ts => ts > cutoff);
    map.set(key, arr);
    return arr;
  }

  /** Send to the dedicated security log channel (or fallback mod-log). */
  function logSecurity(guild, title, body, forensics = false) {
    try {
      const gd = guildData(guild.id);
      const sec = getSecurity(guild.id);
      const chId = forensics
        ? (sec.logChannels?.forensics || sec.logChannels?.security || gd.logging?.channels?.moderation || gd.logging?.channel)
        : (sec.logChannels?.security  || gd.logging?.channels?.moderation || gd.logging?.channel);
      const ch = chId ? guild.channels.cache.get(chId) : null;
      if (!ch?.isTextBased()) return;
      const send = sendLoggingContainer(ch, `security:${title}`, {
        guild,
        title,
        icon: EMOJIS.shield || EMOJIS.automod || "🛡️",
        description: body.slice(0, 1800),
        footer: forensics ? "Forensics security log" : "Security log",
      });
      setTimeout(() => Promise.resolve(send).catch(() => {}), 0);
    } catch {}
  }

  function addViolation(guild, user, type, reason) {
    const sec = getSecurity(guild.id);
    const key = `${guild.id}:${user.id}`;
    const runtime = userViolations.get(key) || { count: 0, types: {} };
    runtime.count++;
    runtime.updatedAt = now();
    runtime.types[type] = (runtime.types[type] || 0) + 1;
    userViolations.set(key, runtime);

    sec.violations[user.id] = sec.violations[user.id] || { count: 0, types: {}, lastReason: null, updatedAt: 0 };
    sec.violations[user.id].count++;
    sec.violations[user.id].types[type] = (sec.violations[user.id].types[type] || 0) + 1;
    sec.violations[user.id].lastReason  = reason;
    sec.violations[user.id].updatedAt   = now();

    const count = sec.violations[user.id].count;
    if (count >= 3) {
      soezyBlacklistManager.addBlacklist({
        guildId: guild.id,
        userId: user.id,
        reason,
        type,
        createdAt: now(),
        auto: true,
      });
      logSecurity(guild, "Auto Blacklist",
        `${user.tag || user.id} was automatically blacklisted after ${count} violations.\nLast reason: ${reason}`);
      return { blacklisted: true, count };
    }
    saveDB();
    logSecurity(guild, "Violation",
      `${user.tag || user.id}: ${reason}\nViolation count: ${count}/3`);
    return { blacklisted: false, count };
  }

  function isBlacklisted(guildId, userId) {
    return soezyBlacklistManager.isBlacklisted({ guildId, userId, scope: "security" });
  }

  function hasInvite(content, guildId) {
    if (!invitePattern.test(content || "")) return false;
    const whitelist = getSecurity(guildId).inviteWhitelist || [];
    return !whitelist.some(d => content.toLowerCase().includes(String(d).toLowerCase()));
  }

  function isSecurityBypassed(msg, guildId) {
    if (!msg?.member || !guildId) return false;
    if (isAdmin(msg.member) || isOwner(msg.author?.id)) return true;
    const gd = guildData(guildId);
    if (typeof syncGuildWhitelist === "function") syncGuildWhitelist(gd);
    const sec = getSecurity(guildId);
    const userId = msg.author?.id;
    const channelId = msg.channel?.id;
    const users = [
      ...(Array.isArray(gd.whitelistUsers) ? gd.whitelistUsers : []),
      ...(Array.isArray(gd.immuneUsers) ? gd.immuneUsers : []),
      ...(Array.isArray(sec.whitelistUsers) ? sec.whitelistUsers : []),
    ];
    if (userId && users.includes(userId)) return true;
    const roles = [
      ...(Array.isArray(gd.whitelistRoles) ? gd.whitelistRoles : []),
      ...(Array.isArray(gd.immuneRoles) ? gd.immuneRoles : []),
      ...(Array.isArray(sec.whitelistRoles) ? sec.whitelistRoles : []),
    ];
    if (roles.length && msg.member.roles?.cache?.some(role => roles.includes(role.id))) return true;
    const channels = [
      ...(Array.isArray(gd.whitelistChannels) ? gd.whitelistChannels : []),
      ...(Array.isArray(gd.immuneChannels) ? gd.immuneChannels : []),
      ...(Array.isArray(sec.whitelistChannels) ? sec.whitelistChannels : []),
      ...(Array.isArray(sec.immuneChannels) ? sec.immuneChannels : []),
    ];
    return Boolean(channelId && channels.includes(channelId));
  }

  // ─────────────────────────────────────────────
  //  Content analysis helpers
  // ─────────────────────────────────────────────

  /** Returns true if the message body exceeds the caps threshold. */
  function isCapsAbuse(content, thresh, minLen) {
    const letters = content.replace(/[^a-zA-Z]/g, "");
    if (letters.length < (minLen || 8)) return false;
    const upper = letters.replace(/[^A-Z]/g, "").length;
    return (upper / letters.length) * 100 >= (thresh || 70);
  }

  /** Strips zalgo combining characters; returns cleaned string. */
  function stripZalgo(text) {
    return text.replace(/[\u0300-\u036f\u0488\u0489\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]+/g, "");
  }

  /** Returns true if the string contains zalgo-level stacking. */
  function isZalgo(text) {
    return zalgoPattern.test(text);
  }

  // ─────────────────────────────────────────────
  //  Reminder validator (public API)
  // ─────────────────────────────────────────────
  function validateReminderInput(message, guildId) {
    const mentionCount = (message.match(/<@!?(\d+)>|<@&(\d+)>/g) || []).length;
    if (/@everyone|@here/i.test(message))  return "Reminders cannot mention everyone or here.";
    if (mentionCount > 2)                  return "Reminders cannot contain more than 2 mentions.";
    if (hasInvite(message, guildId) || unsafeLinkPattern.test(message))
      return "That reminder contains an unsafe link.";
    return null;
  }

  // ─────────────────────────────────────────────
  //  Main message guard
  // ─────────────────────────────────────────────
  async function handleMessageGuard(msg, gd, parsedCommand) {
    if (!msg.guild || msg.author.bot || isOwner(msg.author.id)) return false;
    const guildId = msg.guild.id;
    if (!securityPremiumActive(guildId)) return false;
    const night   = isNightMode(guildId);
    const sec     = getSecurity(guildId);
    const automodOwnsFilters = require("./utils/protectionOwnership").automodOwnsMessageFilters(gd);

    if (sec.enabled === false || (typeof isSystemEnabled === "function" && isSystemEnabled(guildId, "security") === false)) {
      return false;
    }

    if (isSecurityBypassed(msg, guildId)) return false;

    // ── Blacklist ──────────────────────────────
    if (isBlacklisted(guildId, msg.author.id)) {
      if (!soezyBlacklistManager.isBlacklisted({ guildId, userId: msg.author.id, scope: "security" })) return false;
      await msg.delete().catch(() => {});
      console.log(`[BLACKLIST] Message blocked guild=${guildId} user=${msg.author.id} channel=${msg.channel?.id}`);
      if (parsedCommand) {
        await msg.channel.send({
          components: [createErrorContainer("Blacklisted", `${msg.author}, you cannot use commands in this server.`)],
          flags: MessageFlags.IsComponentsV2,
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 8000)).catch(() => {});
      }
      return true;
    }

    // ── @everyone / @here bypass (zero-width tricks) ──
    if (sec.antiEveryoneBP && everyoneBypassPattern.test(msg.content) && !soezyNativeFilterState.isNativeFilterInstalled(gd, "everyone")) {
      await msg.delete().catch(() => {});
      const result = addViolation(msg.guild, msg.author, "everyoneBypass", "@everyone bypass attempt");
      await msg.channel.send({
        components: [createWarningContainer("Bypass Blocked",
          `${msg.author}, attempting to bypass @everyone protections is not allowed. Warning ${Math.min(result.count, 3)}/3.`)],
        flags: MessageFlags.IsComponentsV2,
      }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000)).catch(() => {});
      return true;
    }

    // ── Mass mention ──────────────────────────
    const mentionCount = msg.mentions.users.size + msg.mentions.roles.size;
    if (!automodOwnsFilters && (msg.mentions.everyone || mentionCount > 4)) {
      await msg.delete().catch(() => {});
      const result = addViolation(msg.guild, msg.author, "massMention", "Mass mention abuse");
      await msg.channel.send({
        components: [createWarningContainer("Mass Mention Blocked",
          `${msg.author}, mass mentions are not allowed. Warning ${Math.min(result.count, 3)}/3.`)],
        flags: MessageFlags.IsComponentsV2,
      }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000)).catch(() => {});
      return true;
    }

    // ── Phishing / unsafe links ──────────────
    if (sec.antiPhishing && unsafeLinkPattern.test(msg.content)) {
      await msg.delete().catch(() => {});
      const result = addViolation(msg.guild, msg.author, "phishing", "Phishing / unsafe link");
      await msg.channel.send({
        components: [createWarningContainer("Unsafe Link Blocked",
          `${msg.author}, that link has been flagged as potentially dangerous. Warning ${Math.min(result.count, 3)}/3.`)],
        flags: MessageFlags.IsComponentsV2,
      }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000)).catch(() => {});
      return true;
    }

    // ── Discord invite links ──────────────────
    if (!automodOwnsFilters && hasInvite(msg.content, guildId)) {
      await msg.delete().catch(() => {});
      const result = addViolation(msg.guild, msg.author, "invite", "Discord invite link");
      await msg.channel.send({
        components: [createWarningContainer("Invite Blocked",
          `${msg.author}, Discord invite links are not allowed. Warning ${Math.min(result.count, 3)}/3.`)],
        flags: MessageFlags.IsComponentsV2,
      }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000)).catch(() => {});
      return true;
    }

    // ── Zalgo text ────────────────────────────
    if (sec.antiZalgo && isZalgo(msg.content) && !soezyNativeFilterState.isNativeFilterInstalled(gd, "zalgo")) {
      const action = gd.automod?.enabled === true
        ? require("./utils/automodPunishment").resolve(gd.automod, "zalgo") || "warn"
        : "warn";
      await msg.delete().catch(() => {});
      const result = addViolation(msg.guild, msg.author, "zalgo", "Zalgo/corrupted text");
      if (action === "timeout") await msg.member?.timeout?.(Number(gd.automod?.zalgoDuration) || 300000, "AutoMod: Zalgo text").catch(() => {});
      else if (action === "kick") await msg.member?.kick?.("AutoMod: Zalgo text").catch(() => {});
      else if (action === "ban") await msg.member?.ban?.({ reason: "AutoMod: Zalgo text" }).catch(() => {});
      if (action !== "block") {
        await msg.channel.send({
          components: [createWarningContainer("Zalgo Removed",
            `${msg.author}, corrupted text was removed. Action: **${action}**. Violation ${Math.min(result.count, 3)}/3.`)],
          flags: MessageFlags.IsComponentsV2,
        }).then(m => setTimeout(() => m.delete().catch(() => {}), 8000)).catch(() => {});
      }
      return true;
    }

    // ── Caps abuse ────────────────────────────
    if (!automodOwnsFilters && sec.antiCaps && isCapsAbuse(msg.content, sec.antiCapsThresh, sec.antiCapsMinLen)) {
      await msg.delete().catch(() => {});
      const result = addViolation(msg.guild, msg.author, "caps", "Excessive caps");
      await msg.channel.send({
        components: [createWarningContainer("Caps Limit",
          `${msg.author}, please don't shout. Messages over ${sec.antiCapsThresh}% uppercase are blocked. Warning ${Math.min(result.count, 3)}/3.`)],
        flags: MessageFlags.IsComponentsV2,
      }).then(m => setTimeout(() => m.delete().catch(() => {}), 8000)).catch(() => {});
      return true;
    }

    // ── Duplicate message filter ──────────────
    if (!automodOwnsFilters && sec.antiDuplicate) {
      const dupKey  = `${guildId}:${msg.author.id}`;
      const norm    = msg.content.trim().toLowerCase();
      const entry   = duplicateMessageCache.get(dupKey);
      if (entry && entry.text === norm && now() - entry.ts < 30_000) {
        entry.count++;
        duplicateMessageCache.set(dupKey, entry);
        if (entry.count >= 3) {
          await msg.delete().catch(() => {});
          duplicateMessageCache.delete(dupKey); // reset after action
          const result = addViolation(msg.guild, msg.author, "duplicate", "Repeated identical messages");
          await msg.channel.send({
            components: [createWarningContainer("Duplicate Spam",
              `${msg.author}, stop sending the same message repeatedly. Warning ${Math.min(result.count, 3)}/3.`)],
            flags: MessageFlags.IsComponentsV2,
          }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000)).catch(() => {});
          return true;
        }
      } else {
        duplicateMessageCache.set(dupKey, { text: norm, count: 1, ts: now() });
      }
    }

    // ── Max message length (per-channel) ─────
    const maxLen = sec.channelMaxLength?.[msg.channel.id] || sec.messageLimit;
    if (maxLen && [...msg.content].length > maxLen) {
      await msg.delete().catch(() => {});
      await msg.channel.send({
        components: [createWarningContainer("Message Too Long",
          `${msg.author}, messages in this channel are limited to **${maxLen}** characters (yours: ${msg.content.length}).`)],
        flags: MessageFlags.IsComponentsV2,
      }).then(m => setTimeout(() => m.delete().catch(() => {}), 8000)).catch(() => {});
      return true;
    }

    // ── Spam (rate-limit) ─────────────────────
    const spamInterval = night ? 4000 : 5000;
    const spamLimit    = night ? 4 : 6;
    const spamKey      = `${guildId}:${msg.author.id}`;
    const win          = pruneWindow(spamKey, userMessageWindows, spamInterval);
    win.push(now());
    userMessageWindows.set(spamKey, win);
    if (!automodOwnsFilters && win.length > spamLimit) {
      await msg.delete().catch(() => {});
      addViolation(msg.guild, msg.author, "spam", "Message spam");
      return true;
    }

    // ── Guild command rate-limit (global & per-user) ──
    if (parsedCommand) {
      const guildWin = pruneWindow(guildId, guildCommandWindows, 2500);
      guildWin.push(now());
      guildCommandWindows.set(guildId, guildWin);
      if (guildWin.length > 20) {
        await msg.reply({
          components: [createWarningContainer("Server Rate Limit",
            "Too many commands are running in this server. Try again in a moment.")],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
        return true;
      }

      const userCmdKey = `${guildId}:${msg.author.id}:cmd`;
      const userCmdWin = pruneWindow(userCmdKey, userCommandWindows, 5000);
      userCmdWin.push(now());
      userCommandWindows.set(userCmdKey, userCmdWin);
      if (userCmdWin.length > 5) {
        await msg.reply({
          components: [createWarningContainer("Slow Down",
            `${msg.author}, you're sending commands too fast. Please wait a moment.`)],
          flags: MessageFlags.IsComponentsV2,
        }).catch(() => {});
        return true;
      }
    }

    return false;
  }

  // ─────────────────────────────────────────────
  //  Interaction guard
  // ─────────────────────────────────────────────
  async function handleInteractionGuard(interaction, commandName) {
    if (!interaction.guild || !interaction.user || isOwner(interaction.user.id)) return false;
    const sec = getSecurity(interaction.guildId);
    if (commandName !== "security" && (sec.enabled === false || (typeof isSystemEnabled === "function" && isSystemEnabled(interaction.guildId, "security") === false))) {
      return false;
    }

    if (isBlacklisted(interaction.guildId, interaction.user.id)) {
      await interaction.reply({
        components: [createErrorContainer("Blacklisted", "You cannot use commands in this server.")],
        flags: MessageFlags.IsComponentsV2 | 64,
      }).catch(() => {});
      return true;
    }

    // Guild command rate
    const guildWin = pruneWindow(interaction.guildId, guildCommandWindows, 2500);
    guildWin.push(now());
    guildCommandWindows.set(interaction.guildId, guildWin);
    if (guildWin.length > 20) {
      await interaction.reply({
        components: [createWarningContainer("Server Rate Limit",
          "Too many commands are running in this server. Try again in a moment.")],
        flags: MessageFlags.IsComponentsV2 | 64,
      }).catch(() => {});
      return true;
    }

    // Per-user command rate
    const userCmdKey = `${interaction.guildId}:${interaction.user.id}:cmd`;
    const userCmdWin = pruneWindow(userCmdKey, userCommandWindows, 5000);
    userCmdWin.push(now());
    userCommandWindows.set(userCmdKey, userCmdWin);
    if (userCmdWin.length > 5) {
      await interaction.reply({
        components: [createWarningContainer("Slow Down", "You're sending commands too fast. Please wait a moment.")],
        flags: MessageFlags.IsComponentsV2 | 64,
      }).catch(() => {});
      return true;
    }

    const adminOnly = new Set([
      "antinuke","automod","antibot","antilink","logging","welcome","goodbye","joindm",
      "ticket","tempvoice","media","wall","autorole","autireact","autoresponder",
      "verify","warnpunish","antiraid","security",
      "lockdown","rolelock","webhookguard","slowmode",
    ]);
    if (adminOnly.has(commandName) && !isAdmin(interaction.member)) {
      await interaction.reply({
        components: [createErrorContainer("Admin Only",
          "You need **Administrator** permission to use this command.")],
        flags: MessageFlags.IsComponentsV2 | 64,
      }).catch(() => {});
      return true;
    }

    return false;
  }

  // ─────────────────────────────────────────────
  //  Join / guild member add guard
  // ─────────────────────────────────────────────
  async function handleGuildJoinGuard(member) {
    if (!member.guild) return;
    const guildId = member.guild.id;
    if (!securityPremiumActive(guildId) || member.user.bot) return;
    const night   = isNightMode(guildId);
    const sec     = getSecurity(guildId);

    // ── Raid detection ───────────────────────
    // Join bursts are handled once by AntiNuke's antiRaid configuration.
    if (!sec.enabled) return;

    // ── Account age gate ─────────────────────
    if (sec.accountAgeDays > 0) {
      const ageDays = (now() - member.user.createdTimestamp) / 86_400_000;
      if (ageDays < sec.accountAgeDays) {
        await member.kick(`Security: account younger than ${sec.accountAgeDays} days`).catch(() => {});
        logSecurity(member.guild, "Age Gate Kick",
          `${member.user.tag} (${member.user.id}) was kicked — account age: ${ageDays.toFixed(1)} days (min: ${sec.accountAgeDays}).`);
        return;
      }
    }

    // ── Suspicious new account during raid ───
    if (raidModeGuilds.has(guildId)) {
      const accountAge  = now() - member.user.createdTimestamp;
      const suspicious  = accountAge < 7 * 86_400_000;
      if (suspicious) {
        await member.kick("Raid mode: suspicious new account").catch(() => {});
        logSecurity(member.guild, "Raid Kick",
          `${member.user.tag} (${member.user.id}) was kicked during raid mode (new account).`);
        return;
      }
    }
  }

  // ─────────────────────────────────────────────
  //  Reaction spam guard
  // ─────────────────────────────────────────────
  async function handleReactionAdd(reaction, user) {
    if (!reaction.message.guild || user.bot || isOwner(user.id)) return;
    const guildId = reaction.message.guild.id;
    if (!securityPremiumActive(guildId)) return;
    const key     = `${guildId}:${user.id}`;
    const win     = pruneWindow(key, reactionWindows, 5000);
    win.push(now());
    reactionWindows.set(key, win);
    if (win.length > 8) {
      await reaction.message.guild.members.fetch(user.id).then(async m => {
        // Remove the excessive reaction
        await reaction.users.remove(user.id).catch(() => {});
        const result = addViolation(reaction.message.guild, user, "reactionSpam", "Reaction spam");
        if (result.blacklisted) return;
        const ch = reaction.message.channel;
        await ch.send({
          components: [createWarningContainer("Reaction Spam",
            `${user}, you're adding reactions too fast. Warning ${Math.min(result.count, 3)}/3.`)],
          flags: MessageFlags.IsComponentsV2,
        }).then(m2 => setTimeout(() => m2.delete().catch(() => {}), 8000)).catch(() => {});
      }).catch(() => {});
    }
  }

  // ─────────────────────────────────────────────
  //  Role & permission protection
  // ─────────────────────────────────────────────

  /** Call from roleUpdate / guildRoleUpdate events. */
  async function handleRoleUpdate(oldRole, newRole) {
    const guild = newRole.guild;
    if (!securityPremiumActive(guild.id)) return;
    const sec   = getSecurity(guild.id);

    // Anti-permission creep
    const dangerFlags = [
      PermissionsBitField.Flags.Administrator,
      PermissionsBitField.Flags.BanMembers,
      PermissionsBitField.Flags.ManageGuild,
      PermissionsBitField.Flags.ManageRoles,
      PermissionsBitField.Flags.ManageChannels,
      PermissionsBitField.Flags.KickMembers,
    ];
    for (const flag of dangerFlags) {
      if (!oldRole.permissions.has(flag) && newRole.permissions.has(flag)) {
        const flagName = Object.entries(PermissionsBitField.Flags)
          .find(([, v]) => v === flag)?.[0] || "Unknown";
        logSecurity(guild, "⚠️ Permission Creep Detected",
          `Role **${newRole.name}** (${newRole.id}) was just granted \`${flagName}\`.\n` +
          `Please verify this was intentional.`);
      }
    }

    // Role lock enforcement
    if (sec.lockedRoles?.includes(newRole.id)) {
      // Attempt to revert the permission change
      await newRole.setPermissions(oldRole.permissions, "Security: role lock").catch(() => {});
      logSecurity(guild, "🔒 Role Lock Enforced",
        `Attempted permission change on locked role **${newRole.name}** was reverted.`);
    }
  }

  /** Call from guildMemberUpdate to catch locked role assignments. */
  async function handleMemberRoleUpdate(oldMember, newMember) {
    const guild = newMember.guild;
    if (!securityPremiumActive(guild.id)) return;
    const sec   = getSecurity(guild.id);
    if (!sec.lockedRoles?.length) return;

    const added   = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

    for (const [id, role] of [...added, ...removed]) {
      if (sec.lockedRoles.includes(id)) {
        // Revert
        if (added.has(id)) await newMember.roles.remove(id, "Security: role lock").catch(() => {});
        else                await newMember.roles.add(id,    "Security: role lock").catch(() => {});
        logSecurity(guild, "🔒 Role Lock Enforced",
          `Unauthorised role change on locked role **${role.name}** for ${newMember.user.tag} was reverted.`);
      }
    }
  }

  // ─────────────────────────────────────────────
  //  Webhook guard
  // ─────────────────────────────────────────────
  async function handleWebhookUpdate(channel) {
    const guild = channel.guild;
    if (!guild) return;
    if (!securityPremiumActive(guild.id)) return;
    const security = getSecurity(guild.id);
    if (!security.enabled || security.webhookGuard !== true) return;
    // Fetch the audit log to see what happened
    try {
      const logs = await guild.fetchAuditLogs({ limit: 3, type: AuditLogEvent?.WebhookCreate }).catch(() => null);
      const entry = logs?.entries?.first();
      const actor = entry?.executor ? `<@${entry.executor.id}>` : "Unknown";
      logSecurity(guild, "🪝 Webhook Change Detected",
        `A webhook was created or deleted in <#${channel.id}> by ${actor}.\n` +
        `If this was not authorised, investigate immediately.`);
    } catch {
      logSecurity(guild, "🪝 Webhook Change Detected",
        `A webhook was created or deleted in <#${channel.id}>. Investigate if unexpected.`);
    }
  }

  // ─────────────────────────────────────────────
  //  Channel flood guard (nuke protection)
  // ─────────────────────────────────────────────
  const channelEventWindows = new Map(); // key: guildId:type

  async function handleChannelEvent(guild, type /* "create" | "delete" */) {
    if (!securityPremiumActive(guild.id)) return;
    const key = `${guild.id}:${type}`;
    const win = pruneWindow(key, channelEventWindows, 10_000);
    win.push(now());
    channelEventWindows.set(key, win);
    const limit = type === "delete" ? 3 : 5;
    if (win.length >= limit) {
      // Freeze: lock entire guild (set verification level to very high)
      await guild.setVerificationLevel(4, "Security: channel flood detected").catch(() => {});
      logSecurity(guild, "🚨 Channel Flood Detected",
        `${win.length} channels ${type}d in 10 seconds — verification level raised.\n` +
        `Likely nuke attempt. Audit logs: <https://discord.com/developers/docs/resources/audit-log>`);
    }
  }

  // ─────────────────────────────────────────────
  //  Emoji/sticker guard
  // ─────────────────────────────────────────────
  const emojiDeleteWindows = new Map();

  async function handleEmojiDelete(emoji) {
    const guild = emoji.guild;
    if (!guild) return;
    if (!securityPremiumActive(guild.id)) return;
    const win = pruneWindow(guild.id, emojiDeleteWindows, 10_000);
    win.push(now());
    emojiDeleteWindows.set(guild.id, win);
    if (win.length >= 5) {
      logSecurity(guild, "🚨 Mass Emoji Deletion",
        `${win.length} emojis deleted in 10 seconds — possible nuke. Check audit logs immediately.`);
    }
  }

  // ─────────────────────────────────────────────
  //  Ban wave detection
  // ─────────────────────────────────────────────

  /**
   * Call from guildBanAdd.
   * @param {GuildBan} ban
   */
  async function handleBanAdd(ban) {
    const guild = ban.guild;
    if (!securityPremiumActive(guild.id)) return;
    try {
      const logs = await guild.fetchAuditLogs({ limit: 1, type: AuditLogEvent?.MemberBanAdd }).catch(() => null);
      const entry = logs?.entries?.first();
      const modId = entry?.executor?.id;
      if (!modId || isOwner(modId)) return;

      // Track ban for potential reversal
      const banList = recentBans.get(guild.id) || [];
      banList.push({ userId: ban.user.id, modId, ts: now() });
      recentBans.set(guild.id, banList);

      const modKey = `${guild.id}:${modId}`;
      const win    = pruneWindow(modKey, banWaveWindows, 10_000);
      win.push(now());
      banWaveWindows.set(modKey, win);

      if (win.length >= 5) {
        logSecurity(guild, "🚨 Ban Wave Detected",
          `<@${modId}> issued ${win.length} bans in 10 seconds.\n` +
          `Reversal may be required. Recent bans stored — use \`/security unban-wave\` to review.`);

        // Auto-remove their mod roles if they have no Administrator
        const mod = await guild.members.fetch(modId).catch(() => null);
        if (mod && !isAdmin(mod)) {
          const modRoles = mod.roles.cache.filter(r =>
            r.permissions.has(PermissionsBitField.Flags.BanMembers) && r.id !== guild.id);
          for (const [, role] of modRoles) {
            await mod.roles.remove(role, "Security: ban wave — auto-demod").catch(() => {});
          }
          logSecurity(guild, "Auto-Demod",
            `<@${modId}>'s mod roles were removed pending investigation of ban wave.`);
        }
      }
    } catch {}
  }

  // ─────────────────────────────────────────────
  //  Mention spike alert
  // ─────────────────────────────────────────────
  async function checkMentionSpike(msg) {
    if (!msg.guild) return;
    if (!securityPremiumActive(msg.guild.id)) return;
    const hasMass = msg.mentions.everyone ||
      msg.mentions.roles.size > 0 ||
      msg.mentions.users.size >= 3;
    if (!hasMass) return;

    const win = pruneWindow(msg.guild.id, mentionSpikeWindows, 3_600_000); // 1 hour
    win.push(now());
    mentionSpikeWindows.set(msg.guild.id, win);
    if (win.length >= 10) {
      logSecurity(msg.guild, "📣 Mention Spike Alert",
        `${win.length} mass-mention events in the past hour.\n` +
        `Last triggered by ${msg.author.tag} in <#${msg.channel.id}>.`);
    }
  }

  // ─────────────────────────────────────────────
  //  User history snapshot (forensics)
  // ─────────────────────────────────────────────

  /** Call from guildBanAdd BEFORE the member is removed for best results. */
  async function snapshotUserHistory(guild, user) {
    if (!securityPremiumActive(guild.id)) return;
    const sec = getSecurity(guild.id);
    const chId = sec.logChannels?.forensics || sec.logChannels?.security;
    const ch   = chId ? guild.channels.cache.get(chId) : null;
    if (!ch?.isTextBased()) return;

    // Collect last 20 messages across all visible text channels
    const collected = [];
    const textChannels = guild.channels.cache
      .filter(c => c.isTextBased?.() && c.viewable)
      .first(10); // limit scan to 10 channels

    for (const [, channel] of Object.entries(textChannels)) {
      if (collected.length >= 20) break;
      try {
        const msgs = await channel.messages.fetch({ limit: 50 });
        const userMsgs = msgs.filter(m => m.author.id === user.id);
        userMsgs.forEach(m => collected.push(m));
        if (collected.length >= 20) break;
      } catch {}
    }

    collected.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    const snapshot = collected.slice(0, 20)
      .map((m, i) =>
        `**${i + 1}.** [<t:${Math.floor(m.createdTimestamp / 1000)}:t>] #${m.channel.name}: ${m.content.slice(0, 200) || "*[attachment/embed]*"}`
      ).join("\n");

    await sendLoggingContainer(ch, "security:ban-snapshot", {
      guild,
      title: `Ban Snapshot — ${user.tag || user.username || user.id}`,
      actor: user,
      description: snapshot.slice(0, 1800) || "*No recent messages found.*",
      footer: "Forensics snapshot",
    });
  }

  // ─────────────────────────────────────────────
  //  Lockdown mode
  // ─────────────────────────────────────────────

  /**
   * Toggle server-wide lockdown (verification level 4 = highest).
   * Returns the new state.
   */
  async function setLockdown(guild, enable, reason = "Manual lockdown") {
    if (!securityPremiumActive(guild.id)) return false;
    await guild.setVerificationLevel(enable ? 4 : 0, reason).catch(() => {});
    const sec = getSecurity(guild.id);
    sec.lockdown = enable;
    saveDB();
    logSecurity(guild, enable ? "🔒 Lockdown Enabled" : "🔓 Lockdown Lifted",
      `${reason}\nVerification level set to ${enable ? "Highest (4)" : "None (0)"}.`);
    return enable;
  }

  // ─────────────────────────────────────────────
  //  Role-lock helpers (called by /security rolelock command)
  // ─────────────────────────────────────────────

  function lockRole(guildId, roleId) {
    const sec = getSecurity(guildId);
    if (!sec.lockedRoles.includes(roleId)) sec.lockedRoles.push(roleId);
    saveDB();
  }

  function unlockRole(guildId, roleId) {
    const sec = getSecurity(guildId);
    sec.lockedRoles = sec.lockedRoles.filter(id => id !== roleId);
    saveDB();
  }

  function clearBlacklistRuntime(guildId, userId) {
    const key = `${guildId}:${userId}`;
    userViolations.delete(key);
    userMessageWindows.delete(key);
    userCommandWindows.delete(key);
    duplicateMessageCache.delete(key);
    reactionWindows.delete(key);
  }

  function cleanupRuntime(timestamp = now(), guildId = null) {
    const windows = [userMessageWindows, guildCommandWindows, guildJoinWindows,
      reactionWindows, userCommandWindows, mentionSpikeWindows,
      banWaveWindows, channelEventWindows, emojiDeleteWindows];
    for (const map of windows) {
      for (const [key, times] of map) {
        const belongs = guildId && (key === guildId || key.startsWith(`${guildId}:`));
        if (belongs || !times.length || timestamp - times[times.length - 1] > 3600000) map.delete(key);
      }
    }
    for (const [key, entry] of duplicateMessageCache) {
      if ((guildId && key.startsWith(`${guildId}:`)) || timestamp - entry.ts > 60000) duplicateMessageCache.delete(key);
    }
    for (const [key, entry] of userViolations) {
      if ((guildId && key.startsWith(`${guildId}:`)) || timestamp - (entry.updatedAt || 0) > 86400000) userViolations.delete(key);
    }
    for (const [id, until] of raidModeGuilds) if (id === guildId || until <= timestamp) raidModeGuilds.delete(id);
    for (const [id, bans] of recentBans) {
      const recent = bans.filter(ban => timestamp - ban.ts < 86400000);
      if (id === guildId || !recent.length) recentBans.delete(id);
      else recentBans.set(id, recent);
    }
  }

  function getRuntimeSizes() {
    return { violations: userViolations.size, messages: userMessageWindows.size,
      duplicates: duplicateMessageCache.size, bans: recentBans.size };
  }

  // ─────────────────────────────────────────────
  //  Public API
  // ─────────────────────────────────────────────
  return {
    // Core guards (existing)
    handleMessageGuard,
    handleInteractionGuard,
    handleGuildJoinGuard,
    validateReminderInput,
    isBlacklisted,
    clearBlacklistRuntime,
    cleanupRuntime,
    getRuntimeSizes,
    isNightMode,
    getNightMode,

    // New guards
    handleReactionAdd,
    handleRoleUpdate,
    handleMemberRoleUpdate,
    handleWebhookUpdate,
    handleChannelEvent,
    handleEmojiDelete,
    handleBanAdd,
    checkMentionSpike,
    snapshotUserHistory,

    // Utility
    setLockdown,
    lockRole,
    unlockRole,
    getSecurity,
    stripZalgo,

    // Expose for /security unban-wave command
    recentBans,
  };
})();
