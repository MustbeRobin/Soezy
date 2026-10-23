"use strict";

// ============================================================
//  dashboard.js  —  Auth · Internal Runtime API · Routes · Socket
// ============================================================
//
//  What lives here:
//    Section 1 — Auth middleware
//                isLoggedIn, requireAuth, requirePageAuth,
//                canManageGuild, requireGuildAccess
//
//    Section 2 — Command scanner
//                Reads bot/commands/** and returns metadata
//                for the /api/commands endpoint
//
//    Section 3 — Runtime service factory  (createBotBridge)
//                Internal Discord client/cache/database access,
//                guild data, config management,
//                audit events, status snapshot
//
//    Section 4 — Dashboard routes  (registerDashboardRoutes)
//                Protected pages + all /api/* endpoints
//
//    Section 5 — Socket.IO handlers  (registerDashboardSocket)
//                guild:join, config:update, real-time broadcast
//
//  Exported:
//    createBotBridge, registerDashboardRoutes,
//    registerDashboardSocket
//    + all auth helpers (used by website.js internals)
// ============================================================

const fs = require("fs");
const path = require("path");
const os = require("os");
const EventEmitter = require("events");
const securitySettings = require("./securityDashboardSettings");
const moduleSettings = require("./dashboardModuleFields");
const { createDashboardActions } = require("./dashboardActions");
const { MAX_STORED_LIST_ENTRIES, active: premiumRecordActive, resolvePlan, securityListLimit } = require("./premiumListLimits");

// ─────────────────────────────────────────────────────────────
//  Section 1: Auth middleware
// ─────────────────────────────────────────────────────────────

function isLoggedIn(request) {
  return Boolean(request.session?.user?.id);
}

function isSnowflake(value) {
  return typeof value === "string" && /^\d{15,25}$/.test(value);
}

const DISCORD_PERMISSION_ADMINISTRATOR = 0x8n;
const DISCORD_PERMISSION_MANAGE_GUILD = 0x20n;

function readDiscordPermissions(guild = {}) {
  try {
    return BigInt(guild.permissions || 0);
  } catch {
    return 0n;
  }
}

function userCanManageDiscordGuild(guild = {}) {
  const permissions = readDiscordPermissions(guild);
  return Boolean(
    guild.owner ||
    guild.isOwner ||
    (permissions & DISCORD_PERMISSION_ADMINISTRATOR) === DISCORD_PERMISSION_ADMINISTRATOR ||
    (permissions & DISCORD_PERMISSION_MANAGE_GUILD) === DISCORD_PERMISSION_MANAGE_GUILD
  );
}

function guildPermissionBadges(guild = {}) {
  const permissions = readDiscordPermissions(guild);
  const badges = [];
  if (guild.owner || guild.isOwner) badges.push("OWNER");
  if ((permissions & DISCORD_PERMISSION_ADMINISTRATOR) === DISCORD_PERMISSION_ADMINISTRATOR || guild.isAdmin) badges.push("ADMIN");
  if ((permissions & DISCORD_PERMISSION_MANAGE_GUILD) === DISCORD_PERMISSION_MANAGE_GUILD || guild.hasManageGuild) badges.push("MANAGE SERVER");
  return badges.length ? badges : ["MANAGE SERVER"];
}

function requireAuth(request, response, next) {
  if (isLoggedIn(request)) return next();
  return response.status(401).json({ ok: false, error: "Login required" });
}

function requirePageAuth(request, response, next) {
  if (isLoggedIn(request)) return next();
  return response.redirect(
    `/login?next=${encodeURIComponent(request.originalUrl || "/dashboard")}`
  );
}

function canManageGuild(request, guildId) {
  if (!isLoggedIn(request) || !isSnowflake(guildId)) return false;
  return (request.session.guilds || []).some(
    g => g.id === guildId && g.canManage === true
  );
}

function discordIconUrl(guild) {
  if (!guild?.id || !guild.icon) return null;
  const ext = String(guild.icon).startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext}?size=128`;
}

function publicSessionGuild(guild) {
  const permissions = readDiscordPermissions(guild);
  const icon = discordIconUrl(guild) || guild.iconUrl || guild.icon || null;
  const manageable = userCanManageDiscordGuild(guild) || guild.manageable === true;
  const botPresent = guild.botPresent === true;
  return {
    id: guild.id,
    name: guild.name || `Server ${guild.id}`,
    icon,
    iconUrl: icon,
    owner: Boolean(guild.owner || guild.isOwner),
    isAdmin: Boolean(guild.isAdmin || ((permissions & DISCORD_PERMISSION_ADMINISTRATOR) === DISCORD_PERMISSION_ADMINISTRATOR)),
    hasManageGuild: Boolean(guild.hasManageGuild || ((permissions & DISCORD_PERMISSION_MANAGE_GUILD) === DISCORD_PERMISSION_MANAGE_GUILD)),
    permissionBadges: guildPermissionBadges(guild),
    permissions: permissions.toString(),
    manageable,
    canManage: guild.canManage === true || (manageable && botPresent),
    canInvite: guild.canInvite === true || (manageable && !botPresent),
    botPresent,
    premium: Boolean(guild.premium)
  };
}

async function syncSessionBotPresence(session, botBridge) {
  const source = Array.isArray(session.guilds) ? session.guilds : [];
  let botGuildIds = new Set();
  try {
    botGuildIds = await botBridge.botGuildIds();
  } catch {}

  const synced = source.map(guild => {
    const permissions = readDiscordPermissions(guild);
    const userCanManage = userCanManageDiscordGuild(guild) || guild.manageable === true || guild.canManage === true || guild.canInvite === true;
    const botPresent = botGuildIds.has(guild.id);
    return {
      ...guild,
      permissions: permissions.toString(),
      isOwner: Boolean(guild.owner || guild.isOwner),
      isAdmin: (permissions & DISCORD_PERMISSION_ADMINISTRATOR) === DISCORD_PERMISSION_ADMINISTRATOR || guild.isAdmin === true,
      hasManageGuild: (permissions & DISCORD_PERMISSION_MANAGE_GUILD) === DISCORD_PERMISSION_MANAGE_GUILD || guild.hasManageGuild === true,
      manageable: Boolean(userCanManage),
      botPresent,
      canManage: Boolean(userCanManage && botPresent),
      canInvite: Boolean(userCanManage && !botPresent)
    };
  }).filter(guild => guild.manageable);

  session.guilds = synced;
  if (typeof session.save === "function") {
    await new Promise(resolve => session.save(() => resolve()));
  }
  return synced;
}

function requireGuildAccess(request, response, next) {
  const guildId =
    request.params.guildId ||
    request.params.id ||
    request.body?.guildId;
  if (canManageGuild(request, guildId)) return next();
  return response.status(403).json({ ok: false, error: "You do not have access to this server" });
}

// ─────────────────────────────────────────────────────────────
//  Section 2: Command scanner
// ─────────────────────────────────────────────────────────────

const COMMAND_CATEGORIES = [
  "economy", "fun", "moderation", "music", "owner", "utility", "config"
];

function slashDataToJson(data) {
  if (!data) return {};
  if (typeof data.toJSON === "function") return data.toJSON();
  return data;
}

function optionUsage(options = []) {
  if (!Array.isArray(options) || !options.length) return "";
  return options
    .map(opt => (opt.required ? `<${opt.name || "option"}>` : `[${opt.name || "option"}]`))
    .join(" ");
}

function normalizeCommand(command, category, filePath, botDir) {
  const slash = slashDataToJson(command.data);
  const name = command.name || slash.name || path.basename(filePath, ".js");
  const aliases = command.aliases || command.alias || [];
  const suffix = slash.name && optionUsage(slash.options) ? ` ${optionUsage(slash.options)}` : "";
  return {
    name,
    description: command.description || slash.description || "No description provided.",
    aliases: Array.isArray(aliases) ? aliases : [aliases].filter(Boolean),
    usage: command.usage || (slash.name ? `/${slash.name}${suffix}` : name),
    category: command.category || category,
    premium: Boolean(command.premium || command.premiumOnly || command.isPremium),
    owner: Boolean(command.owner || command.ownerOnly || command.devOnly || category === "owner"),
    file: path.relative(botDir, filePath).replace(/\\/g, "/")
  };
}

function loadCommandFile(filePath) {
  delete require.cache[require.resolve(filePath)];
  const exported = require(filePath);
  return Array.isArray(exported) ? exported : [exported];
}

function scanCommands(botDir) {
  const commandsDir = path.join(botDir, "commands");
  const commands = [];
  const errors = [];

  for (const category of COMMAND_CATEGORIES) {
    const categoryDir = path.join(commandsDir, category);
    if (!fs.existsSync(categoryDir)) continue;
    for (const fileName of fs.readdirSync(categoryDir).filter(f => f.endsWith(".js")).sort()) {
      const filePath = path.join(categoryDir, fileName);
      try {
        for (const command of loadCommandFile(filePath)) {
          if (command && typeof command === "object") {
            commands.push(normalizeCommand(command, category, filePath, botDir));
          }
        }
      } catch (err) {
        errors.push({
          file: path.relative(botDir, filePath).replace(/\\/g, "/"),
          error: err.message
        });
      }
    }
  }

  const categories = [...new Set(commands.map(c => c.category))]
    .sort()
    .map(cat => ({
      id: cat,
      name: cat.replace(/(^|[-_])\w/g, m => m.replace(/[-_]/, "").toUpperCase()),
      count: commands.filter(c => c.category === cat).length
    }));

  commands.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return { categories, commands, errors };
}

// ─────────────────────────────────────────────────────────────
//  Section 3: Internal runtime service
//
//  The website now runs inside the bot process and reads the live
//  Discord client, guild cache, and database directly.
// ─────────────────────────────────────────────────────────────

// ── Local JSON helpers (used in LOCAL mode) ──────────────────

function readJson(filePath, fallback = {}) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw.trim() ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

// ── Prototype-pollution guard ─────────────────────────────────

function isDangerousKey(key) {
  return key === "__proto__" || key === "prototype" || key === "constructor";
}

function setNested(source, dottedPath, value) {
  const parts = String(dottedPath).split(".");
  let cursor = source;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (isDangerousKey(part)) return false;
    if (!cursor[part] || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) {
      cursor[part] = {};
    }
    cursor = cursor[part];
  }
  const last = parts[parts.length - 1];
  if (isDangerousKey(last)) return false;
  cursor[last] = value;
  return true;
}

// ── Value sanitiser ───────────────────────────────────────────

function cleanValue(value) {
  if (typeof value === "string") return value.replace(/\0/g, "").slice(0, 1200).trim();
  if (typeof value === "number") return Math.max(0, Math.min(3000000000, value));
  if (typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return [...new Set(value
      .map(item => String(item || "").replace(/\0/g, "").slice(0, 128).trim())
      .filter(Boolean))]
      .slice(0, 100);
  }
  return undefined;
}

// ── Allowlist of settable config paths ───────────────────────

const ALLOWED_CONFIG_PATHS = new Set([
  // Antinuke
  "antinuke.enabled", "antinuke.systemEnabled", "antinuke.punishment", "antinuke.maxBans", "antinuke.maxKicks",
  "antinuke.maxChannelDelete", "antinuke.maxRoleDelete", "antinuke.timeWindow",
  "antinuke.events.antibot", "antinuke.events.antiban", "antinuke.events.antikick",
  "antinuke.events.antichannelcreate", "antinuke.events.antichanneldelete", "antinuke.events.antichannelupdate",
  "antinuke.events.antirolecreate", "antinuke.events.antiroledelete", "antinuke.events.antiroleupdate",
  "antinuke.events.antiwebhookcreate", "antinuke.events.antiwebhookdelete", "antinuke.events.antiwebhookupdate",
  "antinuke.whitelist", "antinuke.whitelistUsers", "antinuke.whitelistRoles", "antinuke.whitelistChannels",
  // Automod
  "automod.enabled", "automod.systemEnabled",
  "automod.antiSpam.enabled", "automod.antiSpam.maxMessages", "automod.antiSpam.action",
  "automod.antiMassMention.enabled", "automod.antiMassMention.maxMentions", "automod.antiMassMention.action",
  "automod.antiCaps.enabled", "automod.antiCaps.percentage", "automod.antiCaps.action",
  "automod.antiEmoji.enabled", "automod.antiEmoji.maxEmojis", "automod.antiEmoji.action",
  "automod.antiInvite.enabled", "automod.antiInvite.action",
  "automod.antiLink.allowedDomains",
  "automod.whitelistUsers", "automod.whitelistRoles", "automod.whitelistChannels",
  "automodWhitelistUsers", "automodWhitelistRoles", "automodWhitelistChannels",
  // Other protected systems
  "antibot.enabled", "antibot.action", "antibot.whitelistUsers", "antibot.whitelistRoles", "antibot.whitelistChannels",
  "wallSystem.enabled", "wallSystem.systemEnabled", "wallSystem.whitelist", "wallSystem.whitelistRoleId",
  "wallSystem.whitelistUsers", "wallSystem.whitelistRoles", "wallSystem.whitelistChannels",
  "antiRaid.enabled", "antiRaid.whitelistUsers", "antiRaid.whitelistRoles", "antiRaid.whitelistChannels",
  "featureRoleIds.access", "featureRoleIds.antinuke", "featureRoleIds.wall", "featureRoleIds.automod", "featureRoleIds.antibot", "featureRoleIds.antiraid",
  // Anti-link
  "antilink.enabled", "antilink.action",
  // Logging
  "logging.enabled", "logging.channel",
  "logging.channels.message", "logging.channels.moderation", "logging.channels.joinLeave",
  "logging.channels.invite", "logging.channels.voice", "logging.channels.action",
  "logging.channels.admin",
  "logging.events.messageDelete",
  "logging.events.memberJoin", "logging.events.memberLeave",
  "logging.events.memberBan", "logging.events.memberUnban",
  "logging.events.roleCreate", "logging.events.roleDelete",
  "logging.events.channelCreate", "logging.events.channelDelete",
  // Welcome
  "welcome.enabled", "welcome.channel", "welcome.message", "welcome.embedEnabled",
  "welcome.title", "welcome.color", "welcome.image", "welcome.footer", "welcome.autoDelete",
  // Misc modules
  "customRoles.enabled", "customRoles.maxRoles",
  "autoreact.enabled", "giveawaySystem.enabled",
  "verify.enabled", "verify.channel", "verify.role", "verify.title", "verify.message",
  "ticket.enabled", "ticket.channel", "ticket.category", "ticket.supportRole", "ticket.maxTickets",
  "music.enabled", "music.defaultVolume", "music.twentyFourSeven",
  "economy.enabled",
  "security.whitelistUsers", "security.whitelistRoles", "security.whitelistChannels",
  "whitelistUsers", "whitelistRoles", "whitelistChannels", "immuneUsers", "immuneRoles", "immuneChannels",
  "antinuke.whitelist", "antinuke.whitelistUsers", "antinuke.whitelistRoles",
  "automod.whitelistUsers", "automod.whitelistRoles", "automod.whitelistChannels",
  "automod.immuneUsers", "automod.immuneRoles", "automod.immuneChannels",
  "automod.antiSpam.whitelistChannels", "automod.antiSpam.immuneChannels",
  "automod.antiCaps.whitelistChannels", "automod.antiCaps.immuneChannels",
  "automod.antiMassMention.whitelistChannels", "automod.antiMassMention.immuneChannels",
  "automod.antiInvite.whitelistChannels", "automod.antiInvite.immuneChannels",
  "automodWhitelistChannels", "automodImmuneChannels",
  "antilink.whitelist", "antilink.immuneUsers", "antilink.immuneRoles", "antilink.immuneChannels",
  "antilink.whitelistUsers", "antilink.whitelistRoles", "antilink.whitelistChannels",
  "systems.autorole", "systems.embedBuilder",
  "embeds.dashboardDraft.title", "embeds.dashboardDraft.description", "embeds.dashboardDraft.color"
]);

function isProtectedConfigPath(pathKey) {
  if (securitySettings.fields.has(pathKey)) return true;
  const path = String(pathKey || "");
  return /^(?:antinuke|automod|antilink|antibot|antiRaid|wallSystem|security)(?:\.|$)/.test(path) ||
    /^featureRoleIds\.(?:access|antinuke|wall|automod|antibot|antiraid)$/.test(path) ||
    /^(?:whitelist|immune)(?:Users|Roles|Channels)$/.test(path) ||
    /^(?:automodWhitelist|automodImmune)(?:Users|Roles|Channels)$/.test(path);
}

function isOwnerOnlyModulePath(pathKey) {
  const path = String(pathKey || "");
  return /^(?:antinuke|automod|wallSystem|wall)(?:\.|$)/.test(path) ||
    /^featureRoleIds\.(?:antinuke|automod|wall)$/.test(path);
}

function securityListEntityType(pathKey) {
  const path = String(pathKey || "");
  if (/(?:whitelist|immune)(?:Users|Roles|Channels)$/.test(path)) return path.match(/(Users|Roles|Channels)$/)?.[1]?.slice(0, -1).toLowerCase() || null;
  if (/(?:whitelist|immune)$/.test(path) && /(?:antinuke|antiRaid|wallSystem)\./.test(path)) return "user";
  return null;
}

const DASHBOARD_MODULES = [
  { id: "antinuke", label: "Antinuke", path: "antinuke.enabled" },
  { id: "automod", label: "Automod", path: "automod.enabled" },
  { id: "antilink", label: "AntiLink", path: "antilink.enabled" },
  { id: "logging", label: "Logging", path: "logging.enabled" },
  { id: "welcome", label: "Welcome", path: "welcome.enabled" },
  { id: "ticket", label: "Tickets", path: "ticket.enabled" },
  { id: "giveaway", label: "Giveaways", path: "giveawaySystem.enabled" },
  { id: "music", label: "Music", path: "music.enabled" },
  { id: "customRoles", label: "Custom Roles", path: "customRoles.enabled" },
  { id: "verification", label: "Verification", path: "verify.enabled" },
  { id: "economy", label: "Economy", path: "economy.enabled" }
];

const BRIDGE_STATES = Object.freeze({
  ONLINE: "ONLINE",
  CONNECTING: "CONNECTING",
  RECONNECTING: "RECONNECTING",
  OFFLINE: "OFFLINE"
});

// ─────────────────────────────────────────────────────────────
//  Database writes update the in-process bot database object and
//  persist the same database.json file used by commands/events.
// ─────────────────────────────────────────────────────────────


// ── Runtime service factory ───────────────────────────────────

function databaseHealthStatus({ store, databaseStat, guildCount, runtimeDb }) {
  const redisClient = store?.client;
  if (redisClient && typeof redisClient.isReady === "boolean") {
    const connected = redisClient.isReady;
    return {
      ok: connected,
      connected,
      mode: "redis",
      guilds: Number(guildCount) || 0,
      revision: String(store.revision ?? "0"),
      pendingWrites: Boolean(store.batch || store.activeWrite || store.writeRequested),
      updatedAt: null,
      bytes: 0,
      file: null
    };
  }

  const fileAvailable = Boolean(databaseStat);
  return {
    ok: fileAvailable || Boolean(guildCount) || Boolean(runtimeDb),
    connected: fileAvailable ? true : null,
    mode: fileAvailable ? "json" : "internal",
    guilds: Number(guildCount) || 0,
    updatedAt: databaseStat ? databaseStat.mtimeMs : null,
    bytes: databaseStat ? databaseStat.size : 0,
    file: fileAvailable ? "database.json" : null
  };
}

function createBotBridge({ config = {}, logger = console } = {}) {
  for (const key of securitySettings.fields.keys()) ALLOWED_CONFIG_PATHS.add(key);
  for (const key of moduleSettings.fields.keys()) ALLOWED_CONFIG_PATHS.add(key);
  // ── Internal bot runtime source ────────────────────────────
  const botSettings = config.bot || {};
  const oauthSettings = config.oauth || {};
  const runtimeEvents = new EventEmitter();

  const botDir = path.resolve(
    botSettings.dir || process.env.SOEZY_BOT_DIR || path.join(__dirname, "..")
  );

  // Local paths (only used in LOCAL mode)
  const configPath = path.join(botDir, "config.json");
  const databasePath = path.join(botDir, "database.json");


  // Bot config — in REMOTE mode read from env, fallback to local file
  const fileBotConfig = readJson(configPath, {});
  const botConfig = {
    ...fileBotConfig,
    clientId: fileBotConfig.clientId || oauthSettings.clientId || process.env.DISCORD_CLIENT_ID || "",
    clientSecret: fileBotConfig.clientSecret || oauthSettings.clientSecret || process.env.DISCORD_CLIENT_SECRET || "",
    token: fileBotConfig.token || botSettings.token || process.env.DISCORD_BOT_TOKEN || ""
  };

  const botToken = botSettings.token || process.env.DISCORD_BOT_TOKEN || botConfig.token || "";
  let botIdentityCache = null;
  let botIdentityFetchedAt = 0;
  const apiLatencySampleIntervalMs = Math.max(5000, Number(process.env.SOEZY_API_LATENCY_SAMPLE_MS || 30000));
  const apiLatencyTimeoutMs = Math.max(500, Number(process.env.SOEZY_API_LATENCY_TIMEOUT_MS || 3000));
  let discordApiLatency = null;
  let discordApiLatencySampledAt = 0;
  let discordApiLatencyInFlight = null;
  const bridgeOfflineAfterMs = Number(process.env.BRIDGE_OFFLINE_AFTER_MS || botSettings.bridgeOfflineAfterMs || 120000);
  const bridgeMonitorMs = Math.max(1000, Number(process.env.BRIDGE_MONITOR_MS || botSettings.statusMs || 5000));
  let bridgeMonitorTimer = null;
  let bridgeState = {
    state: BRIDGE_STATES.CONNECTING,
    online: false,
    hasClient: false,
    ready: false,
    reconnects: 0,
    since: Date.now(),
    startedAt: Date.now(),
    lastCheckedAt: null,
    lastOnlineAt: null,
    lastError: null
  };

  function timeoutAfter(ms, fallback) {
    return new Promise(resolve => setTimeout(() => resolve(fallback), ms));
  }

  function dbGuildSnapshot(db = loadDatabase()) {
    return Object.entries(db.guilds || {}).map(([id, guild]) => normalizeGuild({ id, ...guild }));
  }

  function getRuntimeClient() {
    if (typeof botSettings.getClient === "function") return botSettings.getClient() || null;
    return process.__soezyDiscordClient || global.client || global.bot || globalThis.client || globalThis.bot || null;
  }

  async function discordApiResponseLatency() {
    const now = Date.now();
    if (now - discordApiLatencySampledAt < apiLatencySampleIntervalMs) return discordApiLatency;
    if (discordApiLatencyInFlight) return discordApiLatencyInFlight;
    discordApiLatencySampledAt = now;

    discordApiLatencyInFlight = (async () => {
      if (typeof fetch !== "function" || typeof AbortController !== "function") {
        discordApiLatency = null;
        return null;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), apiLatencyTimeoutMs);
      timeout.unref?.();
      const startedAt = process.hrtime.bigint();
      try {
        const response = await fetch("https://discord.com/api/v10/gateway", {
          method: "GET",
          headers: { accept: "application/json" },
          signal: controller.signal
        });
        await response.arrayBuffer();
        discordApiLatency = response.ok
          ? Math.round(Number(process.hrtime.bigint() - startedAt) / 1e6)
          : null;
      } catch {
        discordApiLatency = null;
      } finally {
        clearTimeout(timeout);
      }
      return discordApiLatency;
    })().finally(() => {
      discordApiLatencyInFlight = null;
    });
    return discordApiLatencyInFlight;
  }

  function runtimeReady() {
    const client = getRuntimeClient();
    return Boolean(client?.isReady?.() || client?.readyAt || client?.user);
  }

  function bridgeSnapshot({ check = true } = {}) {
    if (check) checkBridge();
    return {
      state: bridgeState.state,
      online: bridgeState.online,
      hasClient: bridgeState.hasClient,
      ready: bridgeState.ready,
      reconnects: bridgeState.reconnects,
      since: bridgeState.since,
      startedAt: bridgeState.startedAt,
      lastCheckedAt: bridgeState.lastCheckedAt,
      lastOnlineAt: bridgeState.lastOnlineAt,
      lastError: bridgeState.lastError,
      mode: "internal"
    };
  }

  function updateBridgeState(nextState, details = {}) {
    const now = Date.now();
    const previousState = bridgeState.state;
    const changed = previousState !== nextState;
    const online = nextState === BRIDGE_STATES.ONLINE;
    bridgeState = {
      ...bridgeState,
      ...details,
      state: nextState,
      online,
      since: changed ? now : bridgeState.since,
      lastCheckedAt: now,
      lastOnlineAt: online ? now : bridgeState.lastOnlineAt,
      reconnects: previousState === BRIDGE_STATES.ONLINE && nextState === BRIDGE_STATES.RECONNECTING
        ? bridgeState.reconnects + 1
        : bridgeState.reconnects
    };

    if (changed) {
      if (nextState === BRIDGE_STATES.ONLINE) logger.info?.("Bridge Connected");
      else logger.info?.(`Bridge ${nextState}`);
      runtimeEvents.emit("bridge", bridgeSnapshot({ check: false }));
    }

    return bridgeState;
  }

  function checkBridge() {
    const client = getRuntimeClient();
    const ready = runtimeReady();
    const hasClient = Boolean(client);
    let lastError = null;
    if (client?.ws?.status !== undefined && ready === false) {
      lastError = `Discord websocket status ${client.ws.status}`;
    }

    if (ready) {
      return updateBridgeState(BRIDGE_STATES.ONLINE, {
        hasClient,
        ready,
        lastError: null
      });
    }

    const waitedMs = Date.now() - bridgeState.startedAt;
    const nextState = bridgeState.lastOnlineAt
      ? BRIDGE_STATES.RECONNECTING
      : waitedMs >= bridgeOfflineAfterMs
        ? BRIDGE_STATES.OFFLINE
        : BRIDGE_STATES.CONNECTING;

    return updateBridgeState(nextState, {
      hasClient,
      ready,
      lastError
    });
  }

  function startBridgeMonitor(intervalMs = bridgeMonitorMs) {
    if (bridgeMonitorTimer) return () => clearInterval(bridgeMonitorTimer);
    checkBridge();
    bridgeMonitorTimer = setInterval(checkBridge, Math.max(1000, Number(intervalMs) || bridgeMonitorMs));
    bridgeMonitorTimer.unref?.();
    return () => {
      clearInterval(bridgeMonitorTimer);
      bridgeMonitorTimer = null;
    };
  }

  logger.info?.(`Runtime API: internal Discord client (${botDir})`);

  // ── Discord REST helper ───────────────────────────────────

  async function discordBotFetch(route, timeoutMs = 5000) {
    if (!botToken) throw new Error("Missing Discord bot token");
    const res = await fetch(`https://discord.com/api/v10${route}`, {
      headers: { Authorization: `Bot ${botToken}` },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) throw new Error(`Discord bot API ${res.status}`);
    return res.json();
  }

  function avatarUrl(user) {
    if (!user?.id || !user.avatar) return null;
    const ext = String(user.avatar).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
  }

  function guildIconUrl(guild) {
    if (!guild?.id || !guild.icon) return null;
    const ext = String(guild.icon).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.${ext}?size=128`;
  }

  function numberOrZero(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function sumGuilds(guilds, key) {
    return (guilds || []).reduce((sum, guild) => sum + numberOrZero(guild?.[key]), 0);
  }

  function mergeGuildLists(...lists) {
    const merged = new Map();
    for (const list of lists) {
      for (const guild of list || []) {
        const normalized = normalizeGuild(guild);
        if (!normalized.id) continue;
        merged.set(normalized.id, { ...(merged.get(normalized.id) || {}), ...normalized });
      }
    }
    return [...merged.values()];
  }

  function normalizeGuild(guild = {}) {
    const id = String(guild.id || guild.guild_id || "");
    const icon = guild.icon || null;
    return {
      id,
      name: guild.name || (id ? `Server ${id}` : "Server"),
      icon,
      iconUrl: guild.iconUrl || guildIconUrl({ id, icon }),
      ownerId: guild.ownerId || guild.owner_id || null,
      memberCount: numberOrZero(guild.memberCount ?? guild.member_count ?? guild.approximate_member_count),
      channelCount: numberOrZero(guild.channelCount ?? guild.channel_count ?? (Array.isArray(guild.channels) ? guild.channels.length : 0)),
      roleCount: numberOrZero(guild.roleCount ?? guild.role_count ?? (Array.isArray(guild.roles) ? guild.roles.length : 0)),
      shardId: guild.shardId ?? null
    };
  }

  let liveGuildStatsCache = null;
  let liveGuildStatsFetchedAt = 0;

  async function discordGuildStats(seedGuilds = []) {
    const now = Date.now();
    if (liveGuildStatsCache && now - liveGuildStatsFetchedAt < 60 * 1000) return liveGuildStatsCache;
    const client = getRuntimeClient();
    if (client?.guilds?.cache?.size) {
      const guilds = [...client.guilds.cache.values()].map(guild => normalizeGuild({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        ownerId: guild.ownerId,
        memberCount: guild.memberCount,
        channelCount: guild.channels?.cache?.size,
        roleCount: guild.roles?.cache?.size,
        shardId: guild.shardId
      }));
      const stats = {
        guilds,
        servers: guilds.length,
        users: sumGuilds(guilds, "memberCount"),
        channels: sumGuilds(guilds, "channelCount"),
        roles: sumGuilds(guilds, "roleCount")
      };
      liveGuildStatsCache = stats;
      liveGuildStatsFetchedAt = now;
      return stats;
    }
    if (!botToken) return null;

    const seedById = new Map((seedGuilds || [])
      .map(guild => [String(guild?.id || ""), guild])
      .filter(([id]) => id));
    const ownGuilds = await discordBotFetch("/users/@me/guilds?with_counts=true&limit=200").catch(() => []);
    const ownById = new Map((Array.isArray(ownGuilds) ? ownGuilds : [])
      .map(guild => [String(guild?.id || ""), guild])
      .filter(([id]) => id));

    let ids = [...new Set([
      ...seedById.keys(),
      ...ownById.keys()
    ])];
    if (!ids.length) {
      ids = [...ownById.keys()];
    }

    let guilds = ids.map(id => normalizeGuild({
      ...(seedById.get(id) || {}),
      ...(ownById.get(id) || {})
    })).filter(guild => guild.id);

    if (!guilds.length || sumGuilds(guilds, "memberCount") === 0) {
      const detailed = await Promise.all(ids.slice(0, 100)
        .map(id => discordBotFetch(`/guilds/${id}?with_counts=true`).catch(() => null)));
      const normalized = detailed.filter(Boolean).map(normalizeGuild).filter(guild => guild.id);
      if (normalized.length) guilds = normalized;
    }

    const fallbackGuilds = guilds.length ? guilds : (seedGuilds || []).map(normalizeGuild).filter(guild => guild.id);
    const stats = {
      guilds: fallbackGuilds,
      servers: fallbackGuilds.length,
      users: sumGuilds(fallbackGuilds, "memberCount"),
      channels: sumGuilds(fallbackGuilds, "channelCount"),
      roles: sumGuilds(fallbackGuilds, "roleCount")
    };
    liveGuildStatsCache = stats;
    liveGuildStatsFetchedAt = now;
    return stats;
  }

  async function botIdentity() {
    const now = Date.now();
    if (botIdentityCache && now - botIdentityFetchedAt < 5 * 60 * 1000) return botIdentityCache;
    const client = getRuntimeClient();

    if (client?.user) {
      try { await client.user.fetch(true); } catch {}
      let avatar = null;
      try {
        avatar = client.user.displayAvatarURL?.({ size: 128, extension: client.user.avatar?.startsWith?.("a_") ? "gif" : "png" }) ||
          client.user.avatarURL?.({ size: 128 });
      } catch {}
      botIdentityCache = {
        clientId: client.user.id || botConfig.clientId || "",
        username: client.user.globalName || client.user.username || botConfig.username || "Soezy",
        avatar,
        banner: client.user.bannerURL?.({ size: 1024 }) || null,
        verified: true
      };
      botIdentityFetchedAt = now;
      return botIdentityCache;
    }

    let identity = {
      clientId: botConfig.clientId || "",
      username: botConfig.username || botConfig.name || "Soezy",
      avatar: botConfig.avatar || botConfig.avatarUrl || null,
      verified: botConfig.verified ?? null
    };

    try {
      if (botToken) {
        const user = await discordBotFetch("/users/@me");
        identity = {
          clientId: user.id || identity.clientId,
          username: user.global_name || user.username || identity.username,
          avatar: avatarUrl(user) || identity.avatar,
          banner: user.banner ? `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${user.banner.startsWith("a_") ? "gif" : "png"}?size=1024` : null,
          verified: user.verified ?? identity.verified
        };
      }
    } catch (err) {
      logger.warn?.("Bot identity lookup failed", { error: err.message });
    }

    botIdentityCache = identity;
    botIdentityFetchedAt = now;
    return identity;
  }

  // ── Database helpers (mode-aware) ─────────────────────────

  /**
   * loadDatabase() is SYNCHRONOUS for both modes.
   * In REMOTE mode it returns the in-memory cache that is
   * refreshed from the bot API every 10 seconds in the background.
   */
  function loadDatabase() {
    const runtimeDb = getRuntimeClient()?._db;
    if (runtimeDb && typeof runtimeDb === "object" && !Array.isArray(runtimeDb)) {
      if (!runtimeDb.guilds) runtimeDb.guilds = {};
      return runtimeDb;
    }
    const localDb = () => {
      const db = readJson(databasePath, {});
      if (!db.guilds) db.guilds = {};
      return db;
    };
    throw Object.assign(new Error("Bot runtime is unavailable; refusing stale database access."), { status: 503 });
  }

  /**
   * saveDatabase() is ASYNC in REMOTE mode (HTTP POST to bot API).
   * In LOCAL mode it's effectively sync (wrapped in a resolved promise
   * for a uniform call signature in updateConfig).
   */
  async function saveDatabase(db, guildId = null) {
    if (!db.guilds) db.guilds = {};
    const client = getRuntimeClient();
    if (client) {
      client._db = db;
    }
    if (typeof client?._saveDatabase === "function") {
      if (!await client._saveDatabase(guildId)) throw new Error("Database save is pending because storage is unavailable. Please retry shortly.");
    } else {
      throw Object.assign(new Error("Bot database writer is unavailable."), { status: 503 });
    }
    runtimeEvents.emit("database", db);
  }

  // ── Guild helpers ─────────────────────────────────────────

  function ensureGuild(db, guildId) {
    if (!db.guilds) db.guilds = {};
    if (!db.guilds[guildId]) db.guilds[guildId] = {};
    const g = db.guilds[guildId];
    if (!g.antinuke) g.antinuke = { enabled: false, events: {}, punishment: "ban", maxBans: 3, maxKicks: 3, maxChannelDelete: 3, maxRoleDelete: 3, timeWindow: 10000 };
    if (!g.automod) g.automod = { enabled: false, antiSpam: {}, antiMassMention: {}, antiCaps: {}, antiEmoji: {}, antiInvite: {} };
    if (!g.antilink) g.antilink = { enabled: false, action: "delete" };
    if (!g.antibot) g.antibot = { enabled: false, whitelist: [], action: "kick" };
    g.antibot.whitelistUsers = [...new Set([...(Array.isArray(g.antibot.whitelist) ? g.antibot.whitelist : []), ...(Array.isArray(g.antibot.whitelistUsers) ? g.antibot.whitelistUsers : [])].map(String))];
    g.antibot.whitelist = g.antibot.whitelistUsers;
    if (!g.logging) g.logging = { enabled: false, channels: {}, events: {} };
    if (!g.security) g.security = { enabled: false, whitelistUsers: [], whitelistRoles: [] };
    if (!Array.isArray(g.whitelistUsers)) g.whitelistUsers = [];
    if (!Array.isArray(g.whitelistRoles)) g.whitelistRoles = [];
    if (!Array.isArray(g.whitelistChannels)) g.whitelistChannels = [];
    if (!Array.isArray(g.immuneUsers)) g.immuneUsers = g.whitelistUsers;
    if (!Array.isArray(g.immuneRoles)) g.immuneRoles = g.whitelistRoles;
    if (!Array.isArray(g.immuneChannels)) g.immuneChannels = g.whitelistChannels;
    if (!Array.isArray(g.security.whitelistUsers)) g.security.whitelistUsers = g.whitelistUsers;
    if (!Array.isArray(g.security.whitelistRoles)) g.security.whitelistRoles = g.whitelistRoles;
    if (!Array.isArray(g.security.whitelistChannels)) g.security.whitelistChannels = g.whitelistChannels;
    if (!Array.isArray(g.security.immuneChannels)) g.security.immuneChannels = g.whitelistChannels;
    if (!Array.isArray(g.automodWhitelistChannels)) g.automodWhitelistChannels = g.automod?.whitelistChannels || g.automod?.immuneChannels || [];
    if (!Array.isArray(g.automodImmuneChannels)) g.automodImmuneChannels = g.automodWhitelistChannels;
    g.automod.whitelistChannels = g.automod.immuneChannels = [...new Set([...g.automodWhitelistChannels, ...g.automodImmuneChannels])];
    g.automodWhitelistChannels = g.automodImmuneChannels = g.automod.whitelistChannels;
    for (const key of ["antiSpam", "antiCaps", "antiMassMention", "antiInvite"]) {
      if (!g.automod[key]) g.automod[key] = {};
      g.automod[key].whitelistChannels = [...new Set([...(g.automod[key].whitelistChannels || []), ...(g.automod[key].immuneChannels || [])])];
      g.automod[key].immuneChannels = g.automod[key].whitelistChannels;
    }
    if (!g.welcome) g.welcome = { enabled: false, message: "Welcome {user} to {server}!" };
    if (!g.customRoles) g.customRoles = { enabled: false, maxRoles: 1, users: {} };
    if (!g.autoreact) g.autoreact = { enabled: true, triggers: {} };
    if (!g.giveawaySystem) g.giveawaySystem = { enabled: true };
    if (!g.verify) g.verify = { enabled: false, title: "Verification Required", message: "Click the button below to verify!" };
    if (!g.ticket) g.ticket = { enabled: false, maxTickets: 5 };
    if (!g.music) g.music = { enabled: true, defaultVolume: 100, twentyFourSeven: false };
    if (g.music.twentyFourSeven === undefined) g.music.twentyFourSeven = false;
    if (!g.economy) g.economy = { enabled: true };
    if (!g.systems) g.systems = {};
    if (!g.embeds) g.embeds = {};
    return g;
  }

  function canManageSecurity(guildId, actorId) {
    const id = String(actorId || "");
    if (!id || !isSnowflake(guildId)) return false;
    if (globalThis.soezyOwnerManager?.isBotOwner?.(id) === true || globalThis.isConfiguredBotOwner?.(id) === true) return true;
    const trustedOwners = [
      ...(Array.isArray(config.ownerIds) ? config.ownerIds : []),
      ...(Array.isArray(config.owners) ? config.owners : []),
      ...(Array.isArray(config.bot?.ownerIds) ? config.bot.ownerIds : []),
      ...(Array.isArray(config.bot?.owners) ? config.bot.owners : []),
      ...(Array.isArray(botConfig.ownerIds) ? botConfig.ownerIds : []),
      ...(Array.isArray(botConfig.owners) ? botConfig.owners : []),
    ].map(String);
    if (trustedOwners.includes(id)) return true;
    const entry = loadDatabase().guilds?.[String(guildId)];
    return (Array.isArray(entry?.extraOwners) ? entry.extraOwners : []).map(String).includes(id);
  }

  function isConfiguredBotOwner(actorId) {
    const id = String(actorId || "");
    if (!id) return false;
    if (globalThis.soezyOwnerManager?.isBotOwner?.(id) === true || globalThis.isConfiguredBotOwner?.(id) === true) return true;
    const owners = [
      ...(Array.isArray(config.ownerIds) ? config.ownerIds : []),
      ...(Array.isArray(config.owners) ? config.owners : []),
      ...(Array.isArray(config.bot?.ownerIds) ? config.bot.ownerIds : []),
      ...(Array.isArray(config.bot?.owners) ? config.bot.owners : []),
      ...(Array.isArray(botConfig.ownerIds) ? botConfig.ownerIds : []),
      ...(Array.isArray(botConfig.owners) ? botConfig.owners : []),
    ].map(String);
    return owners.includes(id);
  }

  function isGuildOwner(guildId, actorId) {
    const guild = getRuntimeClient()?.guilds?.cache?.get?.(String(guildId));
    return Boolean(guild?.ownerId && String(guild.ownerId) === String(actorId || ""));
  }

  async function validateSecurityList(guildId, pathKey, value) {
    const plural = String(pathKey).match(/(Users|Roles|Channels)$/)?.[1];
    const singularRole = /(?:^|\.)whitelistRoleId$/.test(pathKey) || /^featureRoleIds\./.test(pathKey);
    const singularUser = /(?:^|\.)whitelist$/.test(pathKey);
    const type = singularRole ? "role" : singularUser ? "user" : plural ? plural.slice(0, -1).toLowerCase() : null;
    if (!type) return value;
    const ids = Array.isArray(value) ? value : [value];
    if (value === null || value === "") return null;
    if (ids.some(id => !/^\d{17,22}$/.test(String(id || "")))) throw Object.assign(new Error("Whitelist entries must be valid Discord IDs."), { status: 400 });
    if (pathKey === "antibot.whitelistUsers") {
      const client = getRuntimeClient();
      if (typeof client?.users?.fetch !== "function") throw Object.assign(new Error("Discord bot account verification is unavailable."), { status: 503 });
      for (const id of ids) {
        const bot = await client.users.fetch(String(id)).catch(() => null);
        if (!bot?.bot) throw Object.assign(new Error("Anti-Bot trusted entries must be valid Discord bot IDs."), { status: 400 });
      }
      return [...new Set(ids.map(String))];
    }
    const guild = getRuntimeClient()?.guilds?.cache?.get?.(String(guildId));
    if (guild) {
      const manager = type === "user" ? guild.members : type === "role" ? guild.roles : guild.channels;
      for (const id of ids) {
        const found = manager.cache.get(String(id)) || await manager.fetch(String(id)).catch(() => null);
        if (!found) throw Object.assign(new Error(`The selected ${type} is not in this server.`), { status: 400 });
        if (type === "user" && found.user?.bot) throw Object.assign(new Error("Bot accounts cannot be added to this user whitelist."), { status: 400 });
      }
    }
    return Array.isArray(value) ? [...new Set(ids.map(String))] : String(value);
  }

  const configUpdateQueues = new Map();
  function updateConfig(guildId, updates, actorId) {
    const key = String(guildId || "");
    const previous = configUpdateQueues.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(() => applyConfigUpdate(key, updates, actorId));
    configUpdateQueues.set(key, current);
    current.then(
      () => { if (configUpdateQueues.get(key) === current) configUpdateQueues.delete(key); },
      () => { if (configUpdateQueues.get(key) === current) configUpdateQueues.delete(key); }
    );
    return current;
  }

  function moduleSummary(g) {
    return {
      antinuke: !!g.antinuke?.enabled,
      automod: !!g.automod?.enabled,
      logging: !!g.logging?.enabled,
      welcome: !!g.welcome?.enabled,
      customRoles: !!g.customRoles?.enabled,
      autoreact: g.autoreact?.enabled !== false,
      giveaway: g.giveawaySystem?.enabled !== false,
      verification: !!g.verify?.enabled,
      ticket: !!g.ticket?.enabled,
      music: g.music?.enabled !== false
    };
  }

  function securityScore(g) {
    const checks = [
      g.antinuke?.enabled, g.automod?.enabled, g.logging?.enabled,
      g.verify?.enabled, g.antilink?.enabled, g.antibot?.enabled,
      g.antiRaid?.enabled, g.welcome?.enabled
    ];
    return Math.min(98, 42 + checks.filter(Boolean).length * 7);
  }

  function safeConfig(guildId, actorId = null) {
    const db = loadDatabase();
    const g = ensureGuild(db, guildId);
    const mayReadProtected = canManageSecurity(guildId, actorId);
    const owner = isGuildOwner(guildId, actorId);
    const websiteActions = ["sticky", "roleicon", "prefix", "autorole", "community", "ticketPanel", "botprofile", "antiBetrayal"];
    if (isConfiguredBotOwner(actorId)) websiteActions.push("botstatus");
    return {
      dashboardCapabilities: { extendedModuleSettings: true, websiteActions },
      ...(mayReadProtected ? {
        securitySchema: securitySettings.schema(g),
        securityAccess: true,
        badWordEnabled: g.badWordEnabled,
        badWords: g.badWords,
        nsfwProtection: g.nsfwProtection,
        accountAge: g.accountAge,
        antinuke: g.antinuke,
        automod: g.automod,
        antilink: g.antilink,
        antibot: g.antibot,
        wallSystem: g.wallSystem,
        antiRaid: g.antiRaid,
        security: g.security,
        whitelistUsers: g.whitelistUsers,
        whitelistRoles: g.whitelistRoles,
        whitelistChannels: g.whitelistChannels,
        immuneUsers: g.immuneUsers,
        immuneRoles: g.immuneRoles,
        immuneChannels: g.immuneChannels,
        featureRoleIds: g.featureRoleIds || {},
      } : owner ? {
        securitySchema: {
          antinuke: securitySettings.schema(g).antinuke,
          automod: securitySettings.schema(g).automod,
        },
        securityAccess: false,
        badWordEnabled: g.badWordEnabled,
        badWords: g.badWords,
        badWordConfig: g.badWordConfig,
        nsfwProtection: g.nsfwProtection,
        nsfwConfig: g.nsfwConfig,
        accountAge: g.accountAge,
        antinuke: g.antinuke,
        automod: g.automod,
        antibot: g.antibot,
        wallSystem: g.wallSystem,
        featureRoleIds: Object.fromEntries(Object.entries(g.featureRoleIds || {}).filter(([key]) => ["antinuke", "automod", "wall"].includes(key))),
      } : {
        antinuke: { enabled: g.antinuke?.systemEnabled === true || g.antinuke?.enabled === true, systemEnabled: g.antinuke?.systemEnabled === true || g.antinuke?.enabled === true },
        automod: { enabled: g.automod?.systemEnabled === true || g.automod?.enabled === true, systemEnabled: g.automod?.systemEnabled === true || g.automod?.enabled === true },
        antilink: { enabled: g.antilink?.enabled === true },
        antibot: { enabled: g.antibot?.enabled === true },
        wallSystem: { enabled: g.wallSystem?.systemEnabled === true || g.wallSystem?.enabled === true, systemEnabled: g.wallSystem?.systemEnabled === true || g.wallSystem?.enabled === true },
        antiRaid: { enabled: g.antiRaid?.enabled === true },
        security: { enabled: g.security?.enabled === true },
      }),
      logging: g.logging,
      welcome: g.welcome,
      customRoles: g.customRoles,
      autoreact: g.autoreact,
      giveawaySystem: g.giveawaySystem,
      verify: g.verify,
      ticket: g.ticket,
      music: g.music,
      economy: g.economy,
      systems: g.systems,
      stickySystem: g.stickySystem,
      autoRoles: g.autoRoles,
      embeds: { dashboardDraft: g.embeds?.dashboardDraft || {} }
    };
  }

  // ── Public API methods ────────────────────────────────────

  async function botGuilds() {
    const client = getRuntimeClient();
    if (client?.guilds?.cache?.size) {
      return [...client.guilds.cache.values()].map(guild => normalizeGuild({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        ownerId: guild.ownerId,
        memberCount: guild.memberCount,
        channelCount: guild.channels?.cache?.size,
        roleCount: guild.roles?.cache?.size,
        shardId: guild.shardId
      }));
    }
    const db = loadDatabase();
    let guilds = Object.entries(db.guilds || {}).map(([id, guild]) => normalizeGuild({ id, ...guild }));
    if (!guilds.length || sumGuilds(guilds, "memberCount") === 0) {
      const live = await discordGuildStats(guilds).catch(() => null);
      if (live?.guilds?.length) guilds = live.guilds;
    }
    return guilds;
  }

  async function botGuildIds() {
    try {
      const ids = new Set((await botGuilds()).map(guild => guild.id).filter(Boolean));
      if (ids.size) return ids;
    } catch (err) {
      logger.warn?.("Bot guild cache lookup failed", { error: err.message });
    }
    const db = loadDatabase();
    return new Set(Object.keys(db.guilds || {}));
  }

  async function botGuild(guildId) {
    return (await botGuilds()).find(guild => guild.id === guildId) || null;
  }

  async function publicGuild(guildId, actorId = null) {
    const db = loadDatabase();
    const g = ensureGuild(db, guildId);
    const modules = moduleSummary(g);
    const premiumRecord = db.premium?.guilds?.[guildId] || g.premium || null;
    const premiumActive = premiumRecordActive(premiumRecord);
    let discord = null;
    let live = null;
    let commandTotal = 0;
    try { live = await botGuild(guildId); } catch { }
    try { discord = await discordBotFetch(`/guilds/${guildId}?with_counts=true`); } catch { }
    try { commandTotal = (await scanBotCommands()).commands.length; } catch { }
    const activeModules = Object.values(modules).filter(Boolean).length;
    return {
      id: guildId,
      name: live?.name || discord?.name || g.name || `Server ${guildId}`,
      icon: live?.iconUrl || (discord?.icon
        ? `https://cdn.discordapp.com/icons/${guildId}/${discord.icon}.${String(discord.icon).startsWith("a_") ? "gif" : "png"}?size=128`
        : null),
      ownerId: live?.ownerId || discord?.owner_id || null,
      stats: {
        members: live?.memberCount ?? discord?.approximate_member_count ?? g.memberCount ?? 0,
        channels: live?.channelCount ?? g.channelCount ?? 0,
        roles: live?.roleCount ?? g.roleCount ?? 0,
        commands: commandTotal,
        modules: activeModules,
        securityScore: securityScore(g),
        uptime: Math.floor(process.uptime()),
        sync: runtimeReady() ? "Internal" : "Starting"
      },
      modules,
      risk: activeModules >= 7 ? "Low" : activeModules >= 4 ? "Medium" : "Elevated",
      botPresent: Boolean(
        getRuntimeClient()?.guilds?.cache?.has?.(guildId) ||
        live ||
        (!runtimeReady() && db.guilds?.[guildId])
      ),
      premium: {
        active: premiumActive,
        plan: premiumRecord?.plan || null,
        expiresAt: premiumRecord?.expiresAt || null
      },
      entitlements: {
        securityListLimit: securityListLimit(db, actorId, guildId),
        plan: resolvePlan(db, actorId, guildId) || "free"
      }
    };
  }

  async function guildsForSession(session) {
    const guilds = [];
    for (const guild of session.guilds || []) {
      if (guild.canManage || canManageSecurity(guild.id, session.user?.id)) guilds.push(await publicGuild(guild.id, session.user?.id));
    }
    return guilds;
  }

  async function applyConfigUpdate(guildId, updates, actorId) {
    const db = loadDatabase();
    const g = ensureGuild(db, guildId);
    const applied = {};
    for (const [pathKey, rawValue] of Object.entries(updates || {})) {
      if (!ALLOWED_CONFIG_PATHS.has(pathKey)) throw Object.assign(new Error(`Unknown setting: ${pathKey}`), { status: 400 });
      if (isOwnerOnlyModulePath(pathKey)) {
        const guild = getRuntimeClient()?.guilds?.cache?.get?.(String(guildId));
        if (!guild?.ownerId || String(guild.ownerId) !== String(actorId || "")) {
          throw Object.assign(new Error("Only the Discord server owner can update AntiNuke, AutoMod, or Wall settings."), { status: 403 });
        }
      }
      if (isProtectedConfigPath(pathKey) && !canManageSecurity(guildId, actorId) && !(isOwnerOnlyModulePath(pathKey) && isGuildOwner(guildId, actorId))) {
        throw Object.assign(new Error("Only the Discord server owner can update protected settings."), { status: 403 });
      }
      securitySettings.validate(pathKey, rawValue);
      moduleSettings.validate(pathKey, rawValue);
      let clean = moduleSettings.fields.has(pathKey) ? moduleSettings.clean(pathKey, rawValue) : cleanValue(rawValue);
      if (clean === undefined) continue;
      if (pathKey === "automod.antiLink.allowedDomains") {
        const { normalizeDomain } = require("../handlers/automod/antiLinkFilter");
        if (!Array.isArray(clean) || clean.length > MAX_STORED_LIST_ENTRIES) {
          throw Object.assign(new Error(`Allowed domains must be a list of up to ${MAX_STORED_LIST_ENTRIES} entries.`), { status: 400 });
        }
        const domains = clean.map(normalizeDomain);
        if (domains.some(domain => !domain)) throw Object.assign(new Error("Enter valid domain names or URLs, one per line."), { status: 400 });
        clean = [...new Set(domains)];
      }
      if (isProtectedConfigPath(pathKey)) clean = await validateSecurityList(guildId, pathKey, clean);
      const roleListPath = pathKey === "security.whitelistRoles" || pathKey === "whitelistRoles" || pathKey === "immuneRoles";
      const domainListPath = pathKey === "automod.antiLink.allowedDomains";
      if (roleListPath || domainListPath) {
        const current = domainListPath ? (g.automod?.antiLink?.allowedDomains || []) : (g.security?.whitelistRoles || g.whitelistRoles || []);
        const currentEntries = new Set(Array.isArray(current) ? current.map(String) : []);
        const nextEntries = Array.isArray(clean) ? clean.map(String) : [];
        const limit = securityListLimit(db, actorId, guildId);
        if (nextEntries.length > limit && nextEntries.some(entry => !currentEntries.has(entry))) {
          const plan = resolvePlan(db, actorId, guildId) || "free";
          const cap = limit >= MAX_STORED_LIST_ENTRIES ? String(MAX_STORED_LIST_ENTRIES) : String(limit);
          const label = domainListPath ? "Allowed domains" : "Trusted roles";
          throw Object.assign(new Error(`${label} are limited to ${cap} entries on the ${plan} plan. Upgrade the server or account premium to add more.`), { status: 403 });
        }
      }
      applied[pathKey] = clean;
    }
    // Validate the complete patch before mutating live guild state.
    for (const [pathKey, clean] of Object.entries(applied)) setNested(g, pathKey, clean);
    securitySettings.applyAliases(g, applied);
    if (Object.hasOwn(applied, "antibot.whitelistUsers")) g.antibot.whitelist = g.antibot.whitelistUsers;
    const roleMap = require("./featureRoleMap");
    for (const [pathKey, value] of Object.entries(applied)) {
      const match = pathKey.match(/^featureRoleIds\.(access|antinuke|wall|automod|antibot|antiraid)$/);
      if (match) {
        const duplicate = value && Object.entries(g.featureRoleIds || {}).some(([other, existing]) => other !== match[1] && String(existing || "") === String(value));
        if (duplicate) throw Object.assign(new Error("A whitelist role cannot be mapped to more than one protection."), { status: 400 });
        roleMap.setFeatureRoleId(g, match[1], value);
      }
    }
    for (const [pathKey, dbKey] of [["antinuke.enabled", "antinuke"], ["antinuke.systemEnabled", "antinuke"], ["automod.enabled", "automod"], ["automod.systemEnabled", "automod"], ["wallSystem.enabled", "wallSystem"], ["wallSystem.systemEnabled", "wallSystem"]]) {
      if (!Object.prototype.hasOwnProperty.call(applied, pathKey)) continue;
      const enabled = applied[pathKey] === true;
      g[dbKey] ||= {};
      g[dbKey].enabled = g[dbKey].systemEnabled = enabled;
      const feature = dbKey === "wallSystem" ? "wall" : dbKey;
      db.guildSystems ||= {};
      db.guildSystems[guildId] ||= {};
      db.guildSystems[guildId][feature] = enabled;
      g.features ||= {};
      g.features[feature] = enabled;
      if (feature === "automod") {
        g.security ||= {};
        g.security.enabled = enabled;
        db.guildSystems[guildId].security = enabled;
        g.features.security = enabled;
      }
      if (feature === "wall") {
        g.wall ||= {};
        g.wall.enabled = enabled;
      }
    }
    for (const [pathKey, enabled] of Object.entries(applied)) {
      const eventMatch = pathKey.match(/^antinuke\.events\.([a-zA-Z0-9]+)$/);
      if (eventMatch && typeof enabled === "boolean") {
        g.antinuke.features ||= {};
        g.antinuke.features[eventMatch[1]] = { ...(g.antinuke.features[eventMatch[1]] || {}), enabled };
      }
      const automodMatch = pathKey.match(/^automod\.(antiSpam|antiMassMention|antiCaps|antiInvite|antiLink)\.enabled$/);
      if (automodMatch && typeof enabled === "boolean") {
        g.automod.features ||= {};
        g.automod.features[automodMatch[1]] = { ...(g.automod.features[automodMatch[1]] || {}), enabled };
      }
    }
    if (applied["security.whitelistUsers"]) {
      g.whitelistUsers = applied["security.whitelistUsers"];
      g.immuneUsers = g.whitelistUsers;
    }
    if (applied["security.whitelistRoles"]) {
      g.whitelistRoles = applied["security.whitelistRoles"];
      g.immuneRoles = g.whitelistRoles;
    }
    if (applied.whitelistUsers || applied.immuneUsers) {
      g.security.whitelistUsers = applied.whitelistUsers || applied.immuneUsers;
      g.whitelistUsers = g.security.whitelistUsers;
      g.immuneUsers = g.security.whitelistUsers;
    }
    if (applied.whitelistRoles || applied.immuneRoles) {
      g.security.whitelistRoles = applied.whitelistRoles || applied.immuneRoles;
      g.whitelistRoles = g.security.whitelistRoles;
      g.immuneRoles = g.security.whitelistRoles;
    }
    if (Object.keys(applied).length) {
      const reset = require("./securityDisableFeatures");
      if (applied["antinuke.enabled"] === false || applied["antinuke.systemEnabled"] === false) reset.disableAntiNukeFeatures(g, securitySettings.antinuke?.map(item => item.id) || [], db.guildSystems?.[guildId]);
      if (applied["automod.enabled"] === false || applied["automod.systemEnabled"] === false) reset.disableAutoModFeatures(g, db.guildSystems?.[guildId]);
      if (applied["wallSystem.enabled"] === false || applied["wallSystem.systemEnabled"] === false) reset.disableWallFeatures(g);
      await saveDatabase(db, guildId);
      const requiresNativeAutomodSync = Object.keys(applied).some(key => /^(automod|security|badWord|nsfw|accountAge|antibot|antilink)/.test(key));
      let nativeAutomodSync = null;
      if (typeof botSettings.onConfigUpdated === "function") {
        try {
          const updateResult = await botSettings.onConfigUpdated(guildId, applied);
          if (requiresNativeAutomodSync) {
            nativeAutomodSync = updateResult?.nativeAutomodSync || {
              status: "synced",
              message: "Discord AutoMod rules are synchronized."
            };
            if (nativeAutomodSync.status === "synced" && g.nativeAutomod?.lastError) {
              delete g.nativeAutomod.lastError;
            }
          }
        } catch (error) {
          if (!requiresNativeAutomodSync) throw error;
          const knownDiscordCodes = new Set([50001, 50013, 30035, 50035, 429]);
          const message = knownDiscordCodes.has(Number(error?.code))
            ? require("./nativeAutomodService").apiError(error)
            : "Discord AutoMod could not synchronize. Settings are saved; check the bot connection and permissions, then retry.";
          g.nativeAutomod ||= {};
          g.nativeAutomod.lastError = message;
          nativeAutomodSync = {
            status: "failed",
            message: `Settings were saved, but Discord AutoMod sync failed: ${message}`
          };
          console.error(`[DASHBOARD] guild=${guildId}: ${nativeAutomodSync.message}`);
        }
        // The sync updates managed-rule IDs and status after the settings write.
        // Persist those fields too, including a failure marker when Discord rejects the sync.
        await saveDatabase(db, guildId);
      }
      const response = {
        guild: await publicGuild(guildId, actorId),
        config: safeConfig(guildId, actorId),
        applied,
        updatedAt: Date.now()
      };
      if (nativeAutomodSync) response.nativeAutomodSync = nativeAutomodSync;
      return response;
    }
    return {
      guild: await publicGuild(guildId, actorId),
      config: safeConfig(guildId, actorId),
      applied,
      updatedAt: Date.now()
    };
  }

  function auditEvents(guildId) {
    const db = loadDatabase();
    const g = ensureGuild(db, guildId);
    const cases = [
      ...(g.banLogs || []).slice(-4).map(i => ({ type: "Ban", detail: i.reason || "Ban logged", at: i.at || Date.now() })),
      ...(g.kickLogs || []).slice(-4).map(i => ({ type: "Kick", detail: i.reason || "Kick logged", at: i.at || Date.now() })),
      ...(g.modCases || []).slice(-6).map(i => ({ type: i.action || "Case", detail: i.reason || "Moderation case", at: i.createdAt || Date.now() }))
    ].slice(-10).reverse();
    return cases.length ? cases : [
      { type: "Sync", detail: "Dashboard connected to bot database", at: Date.now() },
      { type: "Security", detail: `Security score recalculated at ${securityScore(g)}%`, at: Date.now() - 25000 }
    ];
  }

  async function status() {
    const dbForSnapshot = loadDatabase();
    const identity = await botIdentity();
    const fallbackGuilds = await botGuilds().catch(() => dbGuildSnapshot(dbForSnapshot));
    const liveStats = await discordGuildStats(fallbackGuilds).catch(() => null);
    const fallbackStats = {
      servers: liveStats?.servers || fallbackGuilds.length,
      users: liveStats?.users || sumGuilds(fallbackGuilds, "memberCount"),
      channels: liveStats?.channels || sumGuilds(fallbackGuilds, "channelCount")
    };
    let commandCount = 0;
    try {
      const scanned = scanCommands(botDir);
      commandCount = scanned.commands.length;
    } catch { /* commands dir may not be mounted on remote web hosts */ }
    const bridge = bridgeSnapshot();
    const withLiveIdentity = (base = {}, sync = "Live") => ({
      ...base,
      online: base.online !== false,
      servers: numberOrZero(base.servers) || fallbackStats.servers,
      guilds: numberOrZero(base.guilds ?? base.servers) || fallbackStats.servers,
      guildCount: numberOrZero(base.guilds ?? base.servers) || fallbackStats.servers,
      users: numberOrZero(base.users) || fallbackStats.users,
      userCount: numberOrZero(base.users) || fallbackStats.users,
      channels: numberOrZero(base.channels) || fallbackStats.channels,
      commands: numberOrZero(base.commands) || commandCount,
      clientId: identity.clientId || base.clientId || "",
      runtimeClientId: base.clientId || "",
      botUsername: identity.username,
      botAvatar: identity.avatar,
      botBanner: identity.banner || null,
      botVerified: identity.verified,
      bridge,
      bridgeState: bridge.state,
      sync
    });

    const client = getRuntimeClient();
    const apiLatency = await discordApiResponseLatency();
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    return withLiveIdentity({
      online: runtimeReady(),
      antiBetrayalReady: Boolean(client?._antiBetrayal),
      stale: !runtimeReady(),
      servers: fallbackStats.servers,
      users: fallbackStats.users,
      channels: fallbackStats.channels,
      commands: commandCount,
      clientId: identity.clientId,
      botUsername: identity.username,
      botAvatar: identity.avatar,
      botBanner: identity.banner || null,
      ping: Number.isFinite(client?.ws?.ping) ? Math.round(client.ws.ping) : null,
      latency: Number.isFinite(client?.ws?.ping) ? Math.round(client.ws.ping) : null,
      apiLatency,
      uptime: Math.floor(process.uptime()),
      shards: client?.shard?.count || botSettings.shards || Number(process.env.SOEZY_SHARDS || 1),
      clusters: botSettings.clusters || Number(process.env.SOEZY_CLUSTERS || 1),
      memory: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        heapTotal: memory.heapTotal,
        external: memory.external,
        systemFree: os.freemem(),
        systemTotal: os.totalmem()
      },
      cpu: {
        user: cpu.user,
        system: cpu.system,
        cores: os.cpus().length,
        loadavg: os.loadavg()
      }
    }, bridge.online ? "Internal" : bridge.state);
  }

  async function health() {
    const db = loadDatabase();
    const guildCount = Object.keys(db.guilds || {}).length;
    const runtimeClient = getRuntimeClient();
    let databaseStat = null;
    try { databaseStat = fs.statSync(databasePath); } catch {}

    let botStatus = {};
    try {
      botStatus = await Promise.race([
        status(),
        timeoutAfter(3500, {
          ok: false,
          online: false,
          sync: "Starting",
          error: "Bot status timed out"
        })
      ]);
    } catch (err) {
      botStatus = { ok: false, online: false, error: err.message };
    }

    const botOnline = Boolean(botStatus.online);
    const bridge = bridgeSnapshot();

    return {
      ok: true,
      timestamp: Date.now(),
      status: "ok",
      online: true,
      webOnline: true,
      botOnline,
      guilds: Number(botStatus.servers ?? guildCount),
      guildCount: Number(botStatus.servers ?? guildCount),
      users: Number(botStatus.users ?? 0),
      userCount: Number(botStatus.users ?? 0),
      commands: Number(botStatus.commands ?? 0),
      latency: botStatus.latency ?? botStatus.ping ?? null,
      apiLatency: botStatus.apiLatency ?? null,
      uptime: botStatus.uptime ?? null,
      bridge,
      bridgeOnline: bridge.online,
      bridgeConnected: bridge.online,
      bridgeState: bridge.state,
      bot: botStatus,
      database: databaseHealthStatus({
        store: globalThis.soezyDatabase,
        databaseStat,
        guildCount,
        runtimeDb: runtimeClient?._db
      }),
      system: {
        mode: "internal",
        online: botOnline,
        web: true,
        bot: Boolean(getRuntimeClient()),
        api: true,
        bridge: bridge.state,
        lastError: botStatus.error || null
      },
      api: {
        online: true,
        mode: "express",
        internal: true
      },
      websocket: {
        enabled: true,
        connected: bridge.online,
        mode: "socket.io",
        url: null
      },
      cache: {
        guilds: guildCount,
        remoteCacheReady: false,
        runtimeReady: botOnline
      }
    };
  }

  async function scanBotCommands() {
    return scanCommands(botDir);
  }

  function onStatus(handler) {
    runtimeEvents.on("status", handler);
    return () => runtimeEvents.off("status", handler);
  }

  function onHealth(handler) {
    runtimeEvents.on("health", handler);
    return () => runtimeEvents.off("health", handler);
  }

  function onDatabase(handler) {
    runtimeEvents.on("database", handler);
    return () => runtimeEvents.off("database", handler);
  }

  function onBridge(handler) {
    runtimeEvents.on("bridge", handler);
    return () => runtimeEvents.off("bridge", handler);
  }

  function close() {
    if (bridgeMonitorTimer) {
      clearInterval(bridgeMonitorTimer);
      bridgeMonitorTimer = null;
    }
    runtimeEvents.removeAllListeners();
  }

  const dashboardAction = createDashboardActions({
    getClient: getRuntimeClient, loadDatabase, saveDatabase, canManageSecurity,
    botPrefix: botConfig.prefix || ",", onCommunityUpdated: botSettings.onCommunityUpdated,
    isBotOwner: isConfiguredBotOwner,
    applyBotPresence: presence => {
      if (typeof globalThis.__soezyApplyBotPresence !== "function") throw new Error("Bot presence updater is unavailable.");
      return globalThis.__soezyApplyBotPresence(presence);
    },
  });
  return {
    dashboardAction,
    allowedConfigPaths: ALLOWED_CONFIG_PATHS,
    auditEvents,
    bridge: bridgeSnapshot,
    botConfig,
    botDir,
    cleanValue,
    canManageSecurity,
    isGuildOwner,
    isProtectedConfigPath,
    botIdentity,
    botGuildIds,
    botGuilds,
    guildsForSession,
    loadDatabase,
    publicGuild,
    safeConfig,
    scanBotCommands,
    status,
    health,
    updateConfig,
    startBridgeMonitor,
    onStatus,
    onHealth,
    onDatabase,
    onBridge,
    close
  };
}

// ─────────────────────────────────────────────────────────────
//  Section 4: Dashboard routes
// ─────────────────────────────────────────────────────────────


module.exports = { createBotBridge, databaseHealthStatus };
