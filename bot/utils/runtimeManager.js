"use strict";
/* ================= CONSOLIDATED RUNTIME MANAGER ================= */

/*
 * Runtime guard helpers for the VM loader.
 *
 * This file is intentionally small and side-effect focused: it patches only the
 * shared Discord client registration path and exposes helpers used by the
 * runtime-loaded event files.
 */
const soezyRuntimeRoot = typeof process !== "undefined" ? process : globalThis;
if (!soezyRuntimeRoot.__soezyRuntimeStats) {
  soezyRuntimeRoot.__soezyRuntimeStats = {
    loadedFiles: [],
    listenerAdds: {},
    listenerSkips: {},
    handlerAdds: {},
    handlerSkips: {},
    duplicateFiles: [],
  };
}
globalThis.__soezyRuntimeStats = soezyRuntimeRoot.__soezyRuntimeStats;

function soezyCountStat(bucket, key) {
  const stats = soezyRuntimeRoot.__soezyRuntimeStats;
  stats[bucket][key] = (stats[bucket][key] || 0) + 1;
}

function soezyRuntimeCallsite() {
  const stack = new Error().stack || "";
  const lines = stack.split("\n").slice(2);
  return (lines.find(line =>
    line.includes("\\events\\") ||
    line.includes("\\handlers\\") ||
    line.includes("/events/") ||
    line.includes("/handlers/")
  ) || lines[0] || "unknown").trim();
}

function soezyGuardAsync(label, fn) {
  const wrapped = function soezyGuardedListener(...args) {
    try {
      const event = /^EVENT ([^ :]+)/.exec(label)?.[1];
      const guildId = args[0]?.guildId || args[0]?.guild?.id || (event === "guildUpdate" ? args[0]?.id : null);
      const backgroundEvents = /^(interactionCreate|messageUpdate|messageDelete|messageDeleteBulk|messageReactionAdd|guildMemberAdd|guildMemberRemove|guildMemberUpdate|presenceUpdate|voiceStateUpdate|channelCreate|channelDelete|channelUpdate|roleCreate|roleDelete|roleUpdate|emojiCreate|emojiDelete|emojiUpdate|stickerCreate|stickerDelete|stickerUpdate|webhooksUpdate|guildBanAdd|guildBanRemove|guildUpdate|autoModerationRuleCreate|autoModerationRuleDelete|autoModerationRuleUpdate|autoModerationActionExecution)$/;
      if (backgroundEvents.test(event) && globalThis.soezyEmergency?.active(guildId)) return;
      const result = fn.apply(this, args);
      if (result && typeof result.catch === "function") {
        result.catch(err => { if (err?.code !== "EMERGENCY_PAUSED") console.error(`[${label}] async listener error:`, err); });
      }
      return result;
    } catch (err) {
      console.error(`[${label}] listener error:`, err);
      return undefined;
    }
  };
  // EventEmitter.removeListener/off recognizes this property, just as it does
  // for native once wrappers. Discord collectors/fetches remove by original fn.
  wrapped.listener = fn;
  return wrapped;
}

function installSoezyClientListenerGuard(targetClient) {
  if (!targetClient || targetClient.__soezyListenerGuardInstalled) return;

  const originalOn = targetClient.on.bind(targetClient);
  const originalOnce = targetClient.once.bind(targetClient);
  const bootKeys = soezyRuntimeRoot.__soezyBootListenerKeys || (soezyRuntimeRoot.__soezyBootListenerKeys = new Set());

  function wrapRegister(kind, original) {
    return function guardedRegister(eventName, listener) {
      if (typeof listener !== "function") return original(eventName, listener);

      const callsite = soezyRuntimeCallsite();
      const isBootRegistration = !!globalThis.__soezyLoadingRuntimeFile;
      const key = `${kind}:${eventName}:${callsite}`;
      const label = `${eventName}:${callsite}`;

      if (isBootRegistration) {
        if (bootKeys.has(key)) {
          soezyCountStat("listenerSkips", eventName);
          console.warn(`[EVENTS] Duplicate ${kind}(${eventName}) skipped at ${callsite}`);
          return targetClient;
        }
        bootKeys.add(key);
      }

      soezyCountStat("listenerAdds", eventName);
      if (kind === "once") {
        const guarded = soezyGuardAsync(`EVENT ${eventName}`, listener);
        let fired = false;
        const onceListener = function (...args) {
          if (fired) return;
          fired = true;
          targetClient.removeListener(eventName, onceListener);
          return guarded.apply(this, args);
        };
        onceListener.listener = listener;
        return originalOn(eventName, onceListener);
      }
      // Do not wrap native once wrappers a second time (would hide .listener).
      return original(eventName, listener.listener ? listener : soezyGuardAsync(`EVENT ${eventName}`, listener));
    };
  }

  targetClient.on = wrapRegister("on", originalOn);
  targetClient.once = wrapRegister("once", originalOnce);
  targetClient.__soezyListenerGuardInstalled = true;
  console.log("[EVENTS] Client listener guard installed.");
}

function soezyInteractionAlreadyAcked(interaction) {
  return !!(interaction?.replied || interaction?.deferred);
}

function soezyIsInteractionGone(err) {
  return err?.code === 10062 || err?.code === 40060 || err?.rawError?.code === 10062 || err?.rawError?.code === 40060;
}

async function soezySafeReply(interaction, payload) {
  try {
    if (!interaction) return null;
    if (interaction.deferred) return await interaction.editReply(payload);
    if (interaction.replied) return await interaction.followUp(payload);
    return await interaction.reply(payload);
  } catch (err) {
    if (soezyIsInteractionGone(err)) return null;
    throw err;
  }
}

async function soezySafeDeferReply(interaction, options) {
  try {
    if (!interaction || soezyInteractionAlreadyAcked(interaction)) return false;
    await interaction.deferReply(options);
    return true;
  } catch (err) {
    if (soezyIsInteractionGone(err)) return false;
    throw err;
  }
}

async function soezySafeDeferUpdate(interaction, options) {
  try {
    if (!interaction || soezyInteractionAlreadyAcked(interaction)) return false;
    await interaction.deferUpdate(options);
    return true;
  } catch (err) {
    if (soezyIsInteractionGone(err)) return false;
    throw err;
  }
}

if (typeof client !== "undefined") {
  installSoezyClientListenerGuard(client);
  require("./utils/memberFetchScheduler").installMemberFetchScheduler(require("discord.js").GuildMemberManager);
}

Object.assign(globalThis, {
  soezyCountStat,
  soezyRuntimeCallsite,
  soezyGuardAsync,
  installSoezyClientListenerGuard,
  soezyInteractionAlreadyAcked,
  soezyIsInteractionGone,
  soezySafeReply,
  soezySafeDeferReply,
  soezySafeDeferUpdate,
});


const startupValidationFs = require("fs");
const startupValidationPath = require("path");
const startupValidationVm = require("vm");

function maskToken(value = "") {
  const text = String(value || "");
  if (text.length < 12) return "<missing>";
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

function validateStartupEnvironment(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const cfg = options.config || globalThis.config || {};
  const requiredDirs = options.requiredDirs || ["commands", "config", "events", "handlers", "utils", "systems", "logs"];
  const requiredFiles = options.requiredFiles || ["database.json", "config.json", "package.json"];
  const requiredIntents = options.requiredIntents || ["Guilds", "GuildMessages", "MessageContent", "GuildMembers"];
  const errors = [];
  const warnings = [];

  const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || cfg.token;
  if (!token || token === "YOUR_TOKEN_HERE" || token.length < 40) errors.push("Discord bot token is missing or invalid.");
  if (!cfg.clientId && !process.env.DISCORD_CLIENT_ID) warnings.push("DISCORD_CLIENT_ID/config.clientId is not set; slash sync will rely on the logged-in application id.");

  for (const dir of requiredDirs) {
    const resolved = startupValidationPath.resolve(rootDir, dir);
    if (!startupValidationFs.existsSync(resolved) || !startupValidationFs.statSync(resolved).isDirectory()) {
      errors.push(`Missing required folder: ${dir}`);
    }
  }
  for (const file of requiredFiles) {
    const resolved = startupValidationPath.resolve(rootDir, file);
    if (!startupValidationFs.existsSync(resolved)) errors.push(`Missing required file: ${file}`);
  }

  const databasePath = startupValidationPath.resolve(rootDir, "database.json");
  if (startupValidationFs.existsSync(databasePath)) {
    try {
      const raw = startupValidationFs.readFileSync(databasePath, "utf8");
      if (raw.trim()) JSON.parse(raw);
    } catch (err) {
      errors.push(`database.json is not valid JSON: ${err.message}`);
    }
  }

  const intentNames = globalThis.client?.options?.intents?.toArray?.() || [];
  for (const intent of requiredIntents) {
    if (intentNames.length && !intentNames.includes(intent)) warnings.push(`Gateway intent not detected: ${intent}`);
  }

  const result = { ok: errors.length === 0, errors, warnings, token: maskToken(token) };
  for (const warning of warnings) console.warn(`[STARTUP] ${warning}`);
  if (!result.ok) {
    for (const error of errors) console.error(`[STARTUP] ${error}`);
    throw new Error(`Startup validation failed with ${errors.length} error(s).`);
  }
  console.log(`[STARTUP] Environment validated token=${result.token}`);
  return result;
}

function validateRuntimeFiles(files, rootDir = process.cwd()) {
  const seen = new Set();
  const duplicates = [];
  const missing = [];
  const invalid = [];

  for (const file of files || []) {
    const resolved = startupValidationPath.resolve(rootDir, file);
    if (seen.has(resolved)) duplicates.push(file);
    seen.add(resolved);
    if (!startupValidationFs.existsSync(resolved)) {
      missing.push(file);
      continue;
    }
    try {
      new startupValidationVm.Script(startupValidationFs.readFileSync(resolved, "utf8"), { filename: resolved });
    } catch (err) {
      invalid.push({ file, error: err.message });
    }
  }

  if (duplicates.length) console.warn(`[VALIDATION] Duplicate runtime files: ${duplicates.join(", ")}`);
  if (missing.length) console.warn(`[VALIDATION] Missing runtime files: ${missing.join(", ")}`);
  if (invalid.length) console.warn(`[VALIDATION] Invalid runtime files: ${invalid.map(i => `${i.file}: ${i.error}`).join("; ")}`);
  if (!duplicates.length && !missing.length && !invalid.length) console.log("[VALIDATION] Runtime files validated.");

  return { duplicates, missing, invalid };
}

function validateThemeRuntime(files = [], rootDir = process.cwd()) {
  const errors = [];
  const theme = globalThis.__soezyTheme;
  if (!theme || typeof globalThis.getThemeColor !== "function") {
    errors.push("Theme runtime was not initialized. Load utils/theme.js before config/settings.js.");
  } else {
    const color = globalThis.getThemeColor(null);
    if (!Number.isInteger(color) || color < 0 || color > 0xFFFFFF) {
      errors.push(`Theme fallback color is invalid: ${String(color)}`);
    }
  }

  const duplicateDecls = [];
  try {
    const fs = require("fs");
    const path = require("path");
    for (const file of files || []) {
      const resolved = path.resolve(rootDir, file);
      if (!fs.existsSync(resolved)) continue;
      const source = fs.readFileSync(resolved, "utf8");
      if (/\b(?:const|let|var)\s+BOT_COLOR\b/.test(source) && !String(file).replaceAll("\\", "/").endsWith("utils/theme.js")) {
        duplicateDecls.push(file);
      }
    }
  } catch (err) {
    errors.push(`Theme duplicate scan failed: ${err.message}`);
  }

  if (duplicateDecls.length) errors.push(`Duplicate BOT_COLOR declarations: ${duplicateDecls.join(", ")}`);
  if (errors.length) {
    for (const error of errors) console.error(`[THEME] ${error}`);
    throw new Error(`Theme runtime validation failed with ${errors.length} error(s).`);
  }
  console.log("[THEME] Runtime validated.");
  return { ok: true, color: globalThis.getThemeColor(null) };
}

function validateCommandExports(commandCollection) {
  const missing = [];
  for (const [name, command] of commandCollection || []) {
    if (!command?.data?.name) missing.push(name);
  }
  const diagnostics = commandCollection?.diagnostics;
  if (diagnostics?.failedImports?.length) {
    console.warn(`[VALIDATION] Failed command imports: ${diagnostics.failedImports.map(i => `${i.file} (${i.error})`).join("; ")}`);
  }
  if (diagnostics?.missingExports?.length) {
    console.warn(`[VALIDATION] Command files missing exports: ${diagnostics.missingExports.join(", ")}`);
  }
  if (diagnostics?.duplicateNames?.length) {
    console.warn(`[VALIDATION] Duplicate commands skipped: ${diagnostics.duplicateNames.map(i => `${i.name} from ${i.file}`).join(", ")}`);
  }
  if (missing.length) console.warn(`[VALIDATION] Commands with missing data exports: ${missing.join(", ")}`);
  if (!missing.length && !diagnostics?.failedImports?.length && !diagnostics?.missingExports?.length) {
    console.log("[VALIDATION] Command exports validated.");
  }
  return { missing, diagnostics };
}

Object.assign(globalThis, {
  validateRuntimeFiles,
  validateThemeRuntime,
  validateCommandExports,
  validateStartupEnvironment,
});

const HEALTH_TICK_MS = 30_000;
const STALE_PLAYER_MS = 90_000;
let redactNodeHealthError;
try { ({ redactLavalinkError: redactNodeHealthError } = require("./lavalinkConfig")); }
catch { ({ redactLavalinkError: redactNodeHealthError } = require("./utils/lavalinkConfig")); }

class NodeHealthManager {
  constructor() {
    this.client = null;
    this.music = null;
    this.nodes = new Map();
    this.playerMarks = new Map();
    this.interval = null;
  }

  start(client, music) {
    this.client = client;
    this.music = music;
    if (this.interval) return this;
    this.interval = setInterval(() => this.scan("interval").catch(() => {}), HEALTH_TICK_MS);
    this.interval.unref?.();
    this.scan("start").catch(() => {});
    return this;
  }

  bindShoukaku(shoukaku) {
    if (!shoukaku || shoukaku.__soezyHealthBound) return;
    shoukaku.__soezyHealthBound = true;
    shoukaku.on("ready", name => this.markNode(name, { status: "ready", connectedAt: Date.now(), lastFailure: null }));
    shoukaku.on("disconnect", name => this.markNode(name, { status: "disconnected", lastFailure: Date.now(), failures: 1 }));
    shoukaku.on("close", name => this.markNode(name, { status: "closed", lastFailure: Date.now(), failures: 1 }));
    shoukaku.on("error", (name, err) => this.markNode(name, { status: "error", lastError: redactNodeHealthError(err), lastFailure: Date.now(), failures: 1 }));
  }

  getShoukaku() {
    return this.music?.getShoukaku?.() || this.client?._shoukaku || globalThis.__soezyShoukaku || null;
  }

  nodeEntries() {
    const nodes = this.getShoukaku()?.nodes;
    if (!nodes) return [];
    if (typeof nodes.entries === "function") return [...nodes.entries()];
    return Object.entries(nodes);
  }

  markNode(name, patch) {
    const current = this.nodes.get(name) || {
      name,
      status: "unknown",
      reconnectAttempts: 0,
      failures: 0,
      connectedAt: null,
      lastSeen: 0,
      lastFailure: null,
      lastError: null,
      activePlayers: 0,
      stuckPlayers: 0,
      ping: null,
      load: null,
    };
    const next = { ...current, ...patch, lastSeen: Date.now() };
    if (patch.failures) next.failures = current.failures + patch.failures;
    this.nodes.set(name, next);
    return next;
  }

  recordReconnectAttempt(name) {
    const current = this.nodes.get(name) || { name, reconnectAttempts: 0 };
    return this.markNode(name, { reconnectAttempts: (current.reconnectAttempts || 0) + 1 });
  }

  markPlayer(guildId, state) {
    this.playerMarks.set(guildId, { ...this.playerMarks.get(guildId), ...state, updatedAt: Date.now() });
  }

  inspectPlayer(guildId, q) {
    const now = Date.now();
    const position = Number(q?.player?.position || 0);
    const previous = this.playerMarks.get(guildId);
    const playing = Boolean(q?.current && !q?.destroyed && !q?.player?.paused);
    const connected = Boolean(q?.player?.node && q.player.node.state === 1 && !q.nodeDisconnected);
    const track = q?.current?.encoded || q?.current?.url || q?.current?.title || null;
    const progressedAt = !playing || !connected || previous?.position !== position || previous?.track !== track
      ? now : (previous?.progressedAt ?? now);
    const stale = playing && connected && now - progressedAt > STALE_PLAYER_MS;
    this.markPlayer(guildId, {
      position,
      title: q?.current?.title || null,
      node: q?.player?.node?.name || null,
      stale,
      connected,
      track,
      progressedAt,
    });
    return { stale, connected, position };
  }

  async scan(reason = "manual") {
    const queues = this.music?.musicQueues || new Map();
    const nodePlayerCounts = new Map();
    let stuckPlayers = 0;

    for (const [guildId, q] of queues) {
      const nodeName = q?.player?.node?.name || "unknown";
      nodePlayerCounts.set(nodeName, (nodePlayerCounts.get(nodeName) || 0) + 1);
      const status = this.inspectPlayer(guildId, q);
      if (status.stale || !status.connected) stuckPlayers++;
    }

    for (const [name, node] of this.nodeEntries()) {
      const state = node?.state;
      const status = state === 1 ? "ready" : `state:${state}`;
      const stats = node?.stats || {};
      this.markNode(name, {
        status,
        ping: node?.ping ?? stats?.ping ?? null,
        load: stats?.cpu?.systemLoad ?? stats?.frameStats?.deficit ?? null,
        activePlayers: nodePlayerCounts.get(name) || 0,
        stuckPlayers,
        uptime: stats?.uptime ?? null,
        reason,
      });
    }

    for (const guildId of this.playerMarks.keys()) {
      if (!queues.has(guildId)) this.playerMarks.delete(guildId);
    }
    return this.snapshot();
  }

  snapshot() {
    const queues = this.music?.musicQueues || new Map();
    return {
      at: Date.now(),
      nodes: [...this.nodes.values()],
      players: [...this.playerMarks.entries()].map(([guildId, state]) => ({ guildId, ...state })),
      activeQueues: queues.size || 0,
      stuckPlayers: [...this.playerMarks.values()].filter(p => p.stale || p.connected === false).length,
    };
  }

  getHealthiestNode(excludeName = null) {
    const candidates = this.snapshot().nodes
      .filter(n => n.name !== excludeName)
      .filter(n => n.status === "ready" || n.status === "connected")
      .sort((a, b) => (a.stuckPlayers - b.stuckPlayers) || (a.activePlayers - b.activePlayers) || ((a.ping || 0) - (b.ping || 0)));
    return candidates[0] || null;
  }
}

const nodeHealth = globalThis.__soezyNodeHealth || new NodeHealthManager();
globalThis.__soezyNodeHealth = nodeHealth;


function mapSize(value) {
  return value instanceof Map ? value.size : 0;
}

function cleanRuntimeCaches() {
  const started = Date.now();
  const before = {
    collectors: mapSize(globalThis.__soezyCollectors),
    sessions: mapSize(globalThis.__soezyCollectorSessions),
    cooldowns: mapSize(globalThis.__soezyCooldownRuntime?.commandCooldowns),
    duplicates: mapSize(globalThis.__soezyCooldownRuntime?.duplicateCommands),
    interactions: mapSize(globalThis.__soezyCooldownRuntime?.interactionCooldowns),
    fetchQueue: globalThis.__soezyRatelimitRuntime?.fetchQueue?.length || 0,
  };

  try { globalThis.cleanupCollectors?.(); } catch (err) { console.warn("[CLEANUP] collectors:", err.message); }
  try { globalThis.cleanupCollectorSessions?.(); } catch (err) { console.warn("[CLEANUP] sessions:", err.message); }
  try { globalThis.cleanupCommandCooldowns?.(); } catch (err) { console.warn("[CLEANUP] cooldowns:", err.message); }
  try { globalThis.cleanupRatelimitManager?.(); } catch (err) { console.warn("[CLEANUP] rate limits:", err.message); }
  try { globalThis.cleanupLookupCaches?.(); } catch (err) { console.warn("[CLEANUP] lookup caches:", err.message); }
  try { globalThis.soezyApiQueue?.cleanup?.(); } catch (err) { console.warn("[CLEANUP] api queue:", err.message); }
  try { globalThis.cleanupPremiumCache?.(); } catch (err) { console.warn("[CLEANUP] premium cache:", err.message); }
  try { if (typeof soezySecurity !== "undefined") soezySecurity.cleanupRuntime?.(); } catch (err) { console.warn("[CLEANUP] security:", err.message); }
  try { globalThis.soezyConfigSync?.cleanupRuntime?.(); } catch (err) { console.warn("[CLEANUP] config:", err.message); }
  globalThis.__soezySpoilerSessions?.cleanup?.();

  const memory = process.memoryUsage();
  globalThis.setMetric?.("queues", "runtimeCleanupMs", Date.now() - started);
  globalThis.setMetric?.("queues", "heapUsedMb", Math.round(memory.heapUsed / 1024 / 1024));
  globalThis.setMetric?.("queues", "collectors", mapSize(globalThis.__soezyCollectors));
  globalThis.soezyLogger?.debug?.("cleanup", "Runtime caches cleaned", before);
  return before;
}

if (!globalThis.__soezyRuntimeCleanupInterval) {
  globalThis.__soezyRuntimeCleanupInterval = setInterval(cleanRuntimeCaches, 120_000);
  globalThis.__soezyRuntimeCleanupInterval.unref?.();
}

Object.assign(globalThis, { cleanRuntimeCaches });

/* ---- General helpers merged from helpers.js ---- */
function runtimeThemeColor(guildId = null) {
  return globalThis.getThemeColor(guildId);
}
function runtimeEmoji(name) {
  return globalThis.EMOJIS?.[name] || "";
}
function runtimeSystems() {
  return Array.isArray(globalThis.ALL_SYSTEMS) ? globalThis.ALL_SYSTEMS : [];
}
function runtimePrefix(guildId = null) {
  if (typeof getPrefix === "function") return getPrefix(guildId);
  return globalThis.PREFIX || globalThis.DEFAULT_PREFIX || "!";
}

function parseDuration(durationStr) {
  if (!durationStr || typeof durationStr !== 'string') return null;

  // ── Colon format: H:MM  or  H:MM:SS  (e.g. "2:30" = 2 h 30 min, "1:05:30" = 1 h 5 m 30 s)
  const colonMatch = durationStr.trim().match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colonMatch) {
    const hours   = parseInt(colonMatch[1], 10);
    const minutes = parseInt(colonMatch[2], 10);
    const seconds = colonMatch[3] ? parseInt(colonMatch[3], 10) : 0;
    if (minutes < 60 && seconds < 60) {
      const ms = hours * 3600000 + minutes * 60000 + seconds * 1000;
      return ms > 0 ? ms : null;
    }
  }

  const regex = /^(\d+(?:\.\d+)?)\s*(s|sec|second|seconds|m|min|minute|minutes|h|hr|hour|hours|d|day|days|w|week|weeks)$/i;
  const match = durationStr.trim().match(regex);
  
  if (!match) {
    const simpleMatch = durationStr.toLowerCase().match(/^(\d+)([smhdw])$/);
    if (!simpleMatch) return null;
    
    const value = parseInt(simpleMatch[1], 10);
    const unit = simpleMatch[2];
    
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 };
    return value * (multipliers[unit] || 0);
  }
  
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  
  if (value <= 0 || !isFinite(value)) return null;
  
  const multipliers = {
    s: 1000, sec: 1000, second: 1000, seconds: 1000,
    m: 60000, min: 60000, minute: 60000, minutes: 60000,
    h: 3600000, hr: 3600000, hour: 3600000, hours: 3600000,
    d: 86400000, day: 86400000, days: 86400000,
    w: 604800000, week: 604800000, weeks: 604800000
  };
  
  return Math.floor(value * (multipliers[unit] || 0));
}

function formatDuration(ms) {
  if (ms < 0) ms = 0;
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  return `${seconds}s`;
}

async function safeDelete(msg) {
  try {
    if (!msg || msg.deleted) return;
    await msg.delete();
  } catch (err) {
    if (err.code !== 10008) {
      console.error("Delete failed:", err);
    }
  }
}

function hasComponentsV2Flag(flags) {
  const bits = typeof flags?.bitfield === "number" ? flags.bitfield : Number(flags || 0);
  return !!(bits & MessageFlags.IsComponentsV2);
}

function hasEphemeralFlag(flags) {
  const bits = typeof flags?.bitfield === "number" ? flags.bitfield : Number(flags || 0);
  return !!(bits & 64);
}

function stripEphemeralFromPayload(payload) {
  if (!payload || typeof payload !== "object" || payload.flags === undefined) return payload;
  const bits = typeof payload.flags?.bitfield === "number" ? payload.flags.bitfield : Number(payload.flags || 0);
  if (!Number.isFinite(bits) || !(bits & 64)) return payload;
  const clean = { ...payload };
  const stripped = bits & ~64;
  if (stripped) clean.flags = stripped;
  else delete clean.flags;
  return clean;
}

function serializeDiscordData(value) {
  if (!value) return null;
  if (typeof value.toJSON === "function") {
    try {
      return value.toJSON();
    } catch (err) {
      console.warn("[Payload Sanitizer] Dropped invalid builder:", err.message);
      return null;
    }
  }
  return value;
}

function cleanText(value, max) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  return max ? text.slice(0, max) : text;
}

function cleanEmojiData(emoji) {
  if (!emoji) return undefined;
  if (typeof emoji === "string") {
    const name = cleanText(emoji, 100);
    return name ? { name } : undefined;
  }
  if (typeof emoji !== "object") return undefined;
  const id = cleanText(emoji.id, 32);
  const name = cleanText(emoji.name, 100);
  if (!id && !name) return undefined;
  if (id && !name) return undefined;
  const cleaned = {};
  if (id) cleaned.id = id;
  if (name) cleaned.name = name;
  if (emoji.animated !== undefined) cleaned.animated = !!emoji.animated;
  return cleaned;
}

function cleanSelectOptions(options, maxOptions = 25) {
  if (!Array.isArray(options)) return [];
  return options.slice(0, maxOptions).map(option => {
    if (!option || typeof option !== "object") return null;
    const label = cleanText(option.label, 100);
    const value = cleanText(option.value, 100);
    if (!label || !value) return null;
    const cleaned = { label, value };
    const description = cleanText(option.description, 100);
    const emoji = cleanEmojiData(option.emoji);
    if (description) cleaned.description = description;
    if (emoji) cleaned.emoji = emoji;
    if (option.default !== undefined) cleaned.default = !!option.default;
    return cleaned;
  }).filter(Boolean);
}

function clampSelectValues(component) {
  const optionCount = Array.isArray(component.options) ? component.options.length : 25;
  if (component.min_values !== undefined) {
    component.min_values = Math.max(0, Math.min(Number(component.min_values) || 0, optionCount));
  }
  if (component.max_values !== undefined) {
    component.max_values = Math.max(1, Math.min(Number(component.max_values) || 1, optionCount));
  }
  if (
    component.min_values !== undefined &&
    component.max_values !== undefined &&
    component.min_values > component.max_values
  ) {
    component.min_values = component.max_values;
  }
}

function sanitizeComponentData(component) {
  const data = serializeDiscordData(component);
  if (!data || typeof data !== "object") return null;

  const cleaned = { ...data };
  if (cleaned.id === undefined || cleaned.id === null) delete cleaned.id;

  if (cleaned.emoji) {
    const emoji = cleanEmojiData(cleaned.emoji);
    if (emoji) cleaned.emoji = emoji;
    else delete cleaned.emoji;
  }

  if (Array.isArray(cleaned.components)) {
    cleaned.components = cleaned.components
      .map(child => sanitizeComponentData(child))
      .filter(Boolean);
  }

  // Action rows must contain at least one valid component.
  if (cleaned.type === 1) {
    const children = Array.isArray(cleaned.components) ? cleaned.components : [];
    const firstSelect = children.find(child => [3, 5, 6, 7, 8].includes(child?.type));
    cleaned.components = firstSelect
      ? [firstSelect]
      : children.filter(child => child?.type === 2).slice(0, 5);
    return cleaned.components?.length ? cleaned : null;
  }

  // Buttons need a label or emoji, plus custom_id/url depending on style.
  if (cleaned.type === 2) {
    const label = cleanText(cleaned.label, 80);
    if (label) cleaned.label = label;
    else delete cleaned.label;

    const hasEmoji = !!cleaned.emoji;
    const style = Number(cleaned.style);
    const customId = cleanText(cleaned.custom_id, 100);
    const url = cleanText(cleaned.url, 512);

    if (!label && !hasEmoji) return null;
    if (style === ButtonStyle.Link || style === 5) {
      if (!url) return null;
      cleaned.url = url;
      delete cleaned.custom_id;
    } else {
      if (!customId) return null;
      cleaned.custom_id = customId;
      delete cleaned.url;
    }
    return cleaned;
  }

  // Select menus need a custom_id. String selects also need at least one option.
  if ([3, 5, 6, 7, 8].includes(cleaned.type)) {
    const customId = cleanText(cleaned.custom_id, 100);
    if (!customId) return null;
    cleaned.custom_id = customId;

    const placeholder = cleanText(cleaned.placeholder, 150);
    if (placeholder) cleaned.placeholder = placeholder;
    else delete cleaned.placeholder;

    if (cleaned.type === 3) {
      cleaned.options = cleanSelectOptions(cleaned.options);
      if (!cleaned.options.length) return null;
    }
    clampSelectValues(cleaned);
    return cleaned;
  }

  // Components V2 containers/sections with child components cannot be empty.
  if ([9, 17].includes(cleaned.type) && Array.isArray(cleaned.components) && cleaned.components.length === 0) {
    return null;
  }

  return cleaned;
}

function sanitizeComponents(components) {
  if (!Array.isArray(components)) return [];
  return components.map(component => sanitizeComponentData(component)).filter(Boolean);
}

function sanitizeEmbeds(embeds) {
  if (!Array.isArray(embeds)) return [];
  return embeds.map(embed => {
    const data = serializeDiscordData(embed);
    if (!data || typeof data !== "object") return null;
    return data;
  }).filter(Boolean);
}

function createFallbackV2Component() {
  try {
    return new ContainerBuilder()
      .addTextDisplayComponents(text => text.setContent("\u200b"))
      .toJSON();
  } catch {
    return null;
  }
}

function hasSendablePayload(payload) {
  return (
    (typeof payload.content === "string" && payload.content.length > 0) ||
    (Array.isArray(payload.embeds) && payload.embeds.length > 0) ||
    (Array.isArray(payload.components) && payload.components.length > 0) ||
    (Array.isArray(payload.files) && payload.files.length > 0) ||
    (Array.isArray(payload.attachments) && payload.attachments.length > 0) ||
    (Array.isArray(payload.sticker_ids) && payload.sticker_ids.length > 0)
  );
}

function normalizeComponentsV2Payload(payload) {
  if (!payload || typeof payload !== "object") return payload;

  const clean = { ...payload };
  const isV2 = hasComponentsV2Flag(clean.flags);

  if (Array.isArray(clean.components)) {
    clean.components = sanitizeComponents(clean.components).map(require("./utils/configPanelLayout").trimConfigDropdownFooter);
    if (!clean.components.length) delete clean.components;
  }

  if (Array.isArray(clean.embeds)) {
    clean.embeds = sanitizeEmbeds(clean.embeds);
    if (!clean.embeds.length) delete clean.embeds;
  }

  if (clean.content === null || clean.content === undefined) delete clean.content;
  if (clean.poll === null || clean.poll === undefined) delete clean.poll;
  if (clean.stickers === null || clean.stickers === undefined) delete clean.stickers;

  // Components V2 messages cannot be combined with legacy content/embeds/polls.
  if (isV2) {
    delete clean.content;
    delete clean.embeds;
    delete clean.poll;
    delete clean.stickers;
    if (!Array.isArray(clean.components) || clean.components.length === 0) {
      const fallback = createFallbackV2Component();
      if (fallback) clean.components = [fallback];
    }
  }

  if (!hasSendablePayload(clean)) clean.content = "\u200b";
  return clean;
}

const _soezyPatchedSendTargets = new WeakSet();
const _soezyPatchedEditTargets = new WeakSet();

function patchMessageEditTarget(target) {
  if (!target || typeof target.edit !== "function" || _soezyPatchedEditTargets.has(target)) return target;
  const originalEdit = target.edit.bind(target);
  target.edit = async function (payload) {
    const result = await originalEdit(normalizeComponentsV2Payload(payload));
    patchMessageEditTarget(result);
    return result;
  };
  _soezyPatchedEditTargets.add(target);
  return target;
}

function patchMessageSendTarget(target) {
  if (!target || typeof target.send !== "function" || _soezyPatchedSendTargets.has(target)) return target;
  const originalSend = target.send.bind(target);
  target.send = async function (payload) {
    const sent = await originalSend(normalizeComponentsV2Payload(payload));
    patchMessageEditTarget(sent);
    return sent;
  };
  _soezyPatchedSendTargets.add(target);
  return target;
}

function patchGuildMessageTargets(guild) {
  try {
    guild?.channels?.cache?.forEach(channel => patchMessageSendTarget(channel));
  } catch { }
}

function getOrdinalSuffix(num) {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}

function autoDeleteReply(msg, text, timeout = 10000) {
  return msg.reply(text).then(m => {
    setTimeout(() => m.delete().catch(() => {}), timeout);
  }).catch(() => {});
}

function getMediaType(url, contentType = "") {
  const ext = url.split(".").pop()?.toLowerCase().split("?")[0];
  if (contentType.includes("video") || ["mp4", "webm", "mov", "avi"].includes(ext)) return "video";
  if (contentType.includes("gif") || ext === "gif") return "gif";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";
  return "image";
}

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith("https") ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      response.on("data", chunk => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    }).on("error", reject);
  });
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const SOEZY_NO_PREFIX_FULL_COMMANDS = new Set([
      // ── Utility / Info ──
      "help","h","commands","ping","latency","botinfo","info","stats","about","bot",
      "botinvite","bi","invite","inv","invites","invs","listinvites","vote",
      "prefix","setprefix","timezone","tz","settimezone","stz","checktimezone","ctz","system","command","cmd",
      "userinfo","ui","whois","user","serverinfo","si","server","guild",
      "roleinfo","ri","channelinfo","ci","membercount","mc","members",
      "avatar","av","pfp","globalavatar","gav","banner","bann","bn","globalbanner","gbanner","gbn","translate","poll","remind","reminder","remindme",
      "find","finduser","lookup","search","modlog","audit",
      "activity","msggraph","serverreport","sreport","retentionreport","retention",
      "snipe","snipeall","sall","snipes","editsnipe","esnipe","editsnipeall","esall","editsnipes","clearsnipe","snipeclear",
      

      // ── Moderation ──
      "ban","kick","mute","timeout","unmute","untimeout","warn","unban",
      "warnings","warns","infractions","clearwarns","clearwarnings","delwarns",
      "removewarn","delwarn","unwarn","purge","clear","prune","cuc","clearuserchannel","cl","vcclean","spoiler","autojail","setup-auto-jail","disable-auto-jail","auto-jail-status","nuke",
  "saj","auto-jail-setup","daj","auto-jail-disable","ajs","auto-jail-stats",
      "slowmode","slow","lock","unlock","hide","unhide","delete",
      "nick","setnick","move","vcmute","vcunmute","deafen","undeafen",
      "fakeban","fban","fakekick","fkick","fakemute","fmute",
      "quarantine","q8","jail","release","unquarantine","unjail",
      "shadowmute","shadowunmute","shadowmuted","warnpunish","warnescalate",
      "muteevasion","antievasion","antiraid","raidmode",
      "verify","verification",
      "badword","bw","badwordwhitelist","bwwhitelist","badwordimmune","bwimmune","filterwhitelist","filterimmune","whitelist","wl","immune",
      "nsfwword","nsfwwords","nsfw","nsfwwhitelist","nsfwimmune","nsfwfilter",
      "antilinkwhitelist","alwhitelist","antinlinkwhitelist","antinlinlwhitelist","antilinkimmune","alimmune","antinlinkimmune","antinlinlimmune","automodwhitelist","amwhitelist","automodimmune","amimmune",
      "disablechannel","disablechan","enablechannel","enablechan","disabledchannels",
      "modstats","casehistory","cases","auditexport",
      "massdm","anonymousdm","anondm","servermail","smail",

      // ── Server Setup / Config ──
      "welcome","greet","goodbye","bye","boost","joindm","antinuke","antibot","antilink","antinlink","antinlinl","automod","automode",
      "logs","logging","dashboard","dash","panel",
      "gtoggle","globaltoggle","genable","gdisable","autorole","ar","humanrole","humanroles","botrole","botroles","massrole","massroles","memberrole","memberroles",
      "tempvoice","tv","voice","vc","permit","extraowner","eo","ignore",
      "media","mediaonly","sticky","autorespond","autoresponder","aresponder","autoreact",
      "buttonroles","reactionroles","connectionroles","customroles",
      "buttonrole","br","customrole","cr",
      "reactionrole","rr","reactrole","embed",
      "ticket","tickets","counting","count","wall",
      "confession","confess","birthday","bday","afk","gafk","safk","gafkon","gafkoff","safkon","safkoff",
      "vanityrole","vr","tagrole","tgr","levelrole","birthdayrole",
      "premiumchannel","lockchannel","premiumrole","vouchsystem","vouch",
      "custombg","theme","botpfp","rotateavatar","rotavatar",
      "setbotavatar","setbotbanner","botset","setname","setavatar","setbanner","botsetreset",

      // ── Economy / Shop ──
      "economy","eco","daily","work",
      "mypoints","points","pts","invitepoints","invitepts","ipoints",
      "shop","buy","additem","addshopitem","removeitem","delitem","deleteitem",
      "myitems","activeitems","myperks","heist",
      "blackjack","bj","slots","slot",
      "givepoints","givept","bugapprove","bugaccept","voteapprove","va",
      "clearpoints","clearpts","resetpoints","resetpts",
      "lb","msglb","msgs","messages","message",

      // ── Giveaways ──
      "giveaway","gw","gcreate","gstart","gend","greroll","gall",

      // ── Fun / Social (action) ──
      "hug","kiss","slap","bite","punch","pat","headpat","cuddle","snuggle",
      "bonk","boop","feed","lick","poke","yeet","holdhands","handhold","tickle","kill",
      "wave","hi","wink","blush","laugh","lol","cry","dance","smile",
      "highfive","hi5","stare","pout","confused","huh","sleep","sleepy","zzz",
      "peck","horny","angry","blushkiss","instantkiss","instanthug","instantslap",
      "run","thumbsup","thumbs","facepalm","shrug","nom",

      // ── Fun / Games / Random ──
      "8ball","eightball","ask","coinflip","cf","flip","coin","dice","roll","die",
      "choose","pick","decide","rps","reverse","mock","ship","love","match","rate",
      "meme","roast","pickupline","gayrate","simprate","howhot","iq","cuterate","hornyrate","lesbianrate","prettyrate","babyrate","crazyrate","susrate","simpcheck","lovemeter","joke","fact","quote","fun","trivia","quiz",
      "emojis","emojilist","listemojis","stickers","stickerlist","liststickers",
      "steal","stealsticker","ss","stealemoji","addemoji","ae","deleteemoji","delemoji","removeemoji",
      "enlarge","jumbo","big","bigemoji",
      "ttt","tictactoe","hangman","hm","wordle","hint",
      "connect4","c4","scramble","wordchain","wc","fasttype","numberguess","guessnumber","ng","selfie",

      // ── No-prefix / Premium / Owner ──
      "npx","premium","prem","owner",
      "dev","fixdb","del",
      "totalservers","totalserver","totleserver","totle","tserver","ts","link",
]);
function getNoPrefixFullCommands() {
  if (typeof filterNoPrefixCommands === "function") return filterNoPrefixCommands(SOEZY_NO_PREFIX_FULL_COMMANDS);
  return SOEZY_NO_PREFIX_FULL_COMMANDS;
}

const SOEZY_MENTION_REQUIRED_COMMANDS = new Set([
        // Moderation (require target user/role/channel)
        "ban","kick","mute","timeout","unmute","untimeout",
        "nick","setnick","move","vcmute","vcunmute","deafen","undeafen",
        "fakeban","fban","fakekick","fkick","fakemute","fmute",
        "unban","warn","autojail","setup-auto-jail",
        "warnings","warns","infractions",
        "clearwarns","clearwarnings","delwarns",
        "removewarn","delwarn","unwarn",
        "quarantine","q8","jail",
        "release","unquarantine","unjail",
        "shadowmute","shadowunmute",
        "muteevasion","antievasion",
        // Fun / social (require a target user)
        "hug","kiss","slap","bite","punch",
        "pat","headpat","cuddle","snuggle",
        "bonk","boop","feed","lick","poke",
        "yeet","holdhands","handhold","tickle","kill",
        "highfive","hi5","stare","wink",
        "ship","love","match","rate",
        // Economy actions targeting another user
        // (bal commands removed)
        // Info commands (require a mention to be useful)
        "roleinfo","ri","channelinfo","ci",
        // Mass DM (requires a @role)
        "massdm",
]);
function getMentionRequiredCommands() { return SOEZY_MENTION_REQUIRED_COMMANDS; }

const SOEZY_NUMBER_REQUIRED_COMMANDS = new Set([
        "purge","clear","prune","cl",
        "slowmode","slow",
]);
function getNumberRequiredCommands() { return SOEZY_NUMBER_REQUIRED_COMMANDS; }

const SOEZY_SENTENCE_INDICATOR_WORDS = new Set([
        "is","are","was","were","be","been","being","am",
        "the","a","an","this","that","these","those","my","your","our","their","his","her","its",
        "in","on","at","to","for","of","with","by","from","into","onto","upon","about","above",
        "below","under","over","between","through","against","around","without","within",
        "working","running","going","doing","making","setting","getting","having","saying","seeing",
        "not","no","never","always","already","just","still","also","too","very","so","now","here",
        "it","he","she","they","we","you","me","him","her","us","them",
        "but","and","or","if","when","how","why","what","where","who","which","that",
        "good","bad","great","fine","nice","cool","awesome","okay","ok","yes","yep","nope",
        "fixed","done","set","broken","enabled","disabled","updated","changed","added","removed",
        "lol","lmao","bruh","omg","wtf","imo","tbh","btw","ngl","rn","fr","fr",
        // ── Hinglish / Urdu / common non-English conversational words ──
        "kar","karo","karna","karta","karti","kare","karein","karke",
        "rha","rhi","rhe","raha","rahi","rahe",
        "hai","hain","ho","hoga","hogi","hoge","tha","thi","the",
        "aur","lekin","magar","kyun","kya","kab","kahan","kaun","kaise",
        "nhi","nahi","mat","mera","tera","apna","uska","unka","humara",
        "yaar","bhai","bro","dude","yeh","woh","iss","us",
        "de","dena","do","deta","deti","dete","deke",
        "le","lena","leta","leti","lete","lo","leke",
        "bol","bolo","bolta","bolti","bolte",
        "aa","aao","aya","ayi","aye","ja","jao","gaya","gayi","gaye",
        "band","chalu","shuru","khatam","theek","sahi","galat",
        "abhi","phir","fir","dobara","pehle","baad","jaldi","dheere",
        "sirf","bas","thoda","zyada","bahut","bilkul","haan","naa",
]);
function getSentenceIndicatorWords() { return SOEZY_SENTENCE_INDICATOR_WORDS; }

const SOEZY_NO_ARGS_COMMANDS = new Set([
        "daily","work","ping","latency","botinfo","info","stats","about","bot",
        "coinflip","cf","flip","coin","dice","roll","die",
        "meme","joke","fact","quote","fun",
        "mypoints","points","pts","myitems","activeitems","myperks",
        "lb","msgs","messages","message",
        "snipe","snipeall","sall","editsnipe","esnipe","editsnipeall","esall","clearsnipe","snipeclear",
        "serverinfo","si","server","guild","membercount","mc","members",
        "selfie","trivia","quiz",
        "dashboard","dash","panel","autojail","disable-auto-jail","auto-jail-status",
  "daj","auto-jail-disable","ajs","auto-jail-stats",
]);
function getNoArgsCommands() { return SOEZY_NO_ARGS_COMMANDS; }

const SOEZY_NOARG_FILLER_WORDS = new Set([
        "pls","please","now","bot","quick","fast","asap","go","run",
        "!", "!!", "?",
]);
function getNoArgFillerWords() { return SOEZY_NOARG_FILLER_WORDS; }

const SOEZY_SUBCOMMAND_REQUIRED = Object.freeze({
        "embed":          ["config","create","edit","send","delete","list"],
        "welcome":        ["config","setup","set","test","enable","disable","reset","channel","message","image","card"],
        "greet":          ["setup"],
        "goodbye":        ["config","set","test","enable","disable","reset","channel","setchannel","removechannel","remove","show","status","message","image","card"],
        "bye":            ["config","set","test","enable","disable","reset","channel","setchannel","removechannel","remove","show","status","message","image","card"],
        "boost":          ["config","set","test","enable","disable","reset","channel","message"],
        "joindm":         ["config","set","test","enable","disable","reset","message"],
        "logging":        ["config"],
        "automod":        ["config", "enable", "disable"],
        "automode":       ["config", "enable", "disable"],
        "antilink":       ["config","settings","status","enable","disable","whitelist","wl","unwhitelist","unwl","setwhitelist","setwl","removewhitelist","removewl","whitelistlist","wllist","immunerole","set","reset","add","remove","list"],
        "antinlink":      ["config","settings","status","enable","disable","whitelist","wl","unwhitelist","unwl","setwhitelist","setwl","removewhitelist","removewl","whitelistlist","wllist","immunerole","set","reset","add","remove","list"],
        "antinlinl":      ["config","settings","status","enable","disable","whitelist","wl","unwhitelist","unwl","setwhitelist","setwl","removewhitelist","removewl","whitelistlist","wllist","immunerole","set","reset","add","remove","list"],
        "antinuke":       ["config","settings","status","enable","disable","whitelist","wl","unwhitelist","unwl","setwhitelist","setwl","removewhitelist","removewl","whitelistlist","wllist","maxbans","maxkicks","events","snapshot","restore","autorestore","set","reset","list"],
        "delete":         ["category"],
        "antibot":        ["config","settings","status","enable","disable","whitelist","wl","unwhitelist","unwl","setlogs","action","set","reset"],
        "whitelist":      ["user","role","channel","channels","all","add","remove","list","addrole","adduser","addchannel","removerole","removeuser","removechannel","ar","au","ac","rr","ru","rc"],
        "wl":             ["user","role","channel","channels","all","add","remove","list","addrole","adduser","addchannel","removerole","removeuser","removechannel","ar","au","ac","rr","ru","rc"],
        "immune":         ["user","role","channel","channels","all","add","remove","list","addrole","adduser","addchannel","removerole","removeuser","removechannel","ar","au","ac","rr","ru","rc"],
        "antiraid":       ["config","set","enable","disable","reset","on","off"],
        "raidmode":       ["config","set","enable","disable","reset","on","off"],
        "ticket":         ["config","set","enable","disable","reset","panel","add","remove","close","reopen","delete","list"],
        "tickets":        ["config","set","enable","disable","reset","panel","add","remove","close","reopen","delete","list"],
        "sticky":         ["set","remove","list","config"],
        "autorespond":    ["add","remove","list","config","enable","disable"],
        "autoresponder":  ["add","remove","list","config","enable","disable"],
        "aresponder":     ["add","remove","list","config","enable","disable"],
        "autoreact":      ["add","remove","list","config","enable","disable"],
        "tempvoice":      ["config","set","enable","disable","reset"],
        "tv":             ["config","set","enable","disable","reset"],
        "customroles":    ["config","set","enable","disable","reset","add","remove","list"],
        "customrole":     ["config","set","enable","disable","reset","add","remove","list"],
        "buttonroles":    ["config","set","add","remove","list","create","edit","delete"],
        "buttonrole":     ["config","set","add","remove","list","create","edit","delete"],
        "connectionroles":["config","set","add","remove","list"],
        "reactionrole":   ["add","remove","list","create","edit","delete"],
        "rr":             ["add","remove","list","config","create","edit","delete"],
        "counting":       ["config","set","enable","disable","reset","channel"],
        "count":          ["config","set","enable","disable","reset","channel"],
        "confession":     ["config","set","enable","disable","reset","channel"],
        "confess":        ["config","set","enable","disable","reset","channel"],
        "wall":           ["config","set","enable","disable","reset","channel"],
        "birthday":       ["config","set","enable","disable","reset","channel","role","check"],
        "bday":           ["config","set","enable","disable","reset","channel","role","check"],
        "hl":             ["add","remove","list","clear"],
        "media":          ["config","set","enable","disable","reset","add","remove","list","setlogs","uploadlogs","setuploadlogs","deletelogs","setdeletelogs","removelogs","removeuploadlogs","removedeletelogs","bypass","setchannel"],
        "mediaonly":      ["config","set","enable","disable","reset","add","remove","list","setlogs","uploadlogs","setuploadlogs","deletelogs","setdeletelogs","removelogs","removeuploadlogs","removedeletelogs","bypass","setchannel"],
        "giveaway":       ["start","end","reroll","list","delete","create"],
        "gw":             ["start","end","reroll","list","delete","create"],
        "npx":            ["add","list"],
        "premium":        ["add","remove","list","config","give","check","bio"],
        "prem":           ["add","remove","list","config","give","check","bio"],
        "shop":           ["add","remove","list","buy","config"],
        "additem":        [],
        "addshopitem":    [],
        "removeitem":     [],
        "economy":        ["config","set","enable","disable","reset"],
        "eco":            ["config","set","enable","disable","reset"],
        "poll":           [],  // !poll <question> | opt1 | opt2  — takes free-form text, no subcommand keyword
        "dashboard":      [],  // standalone — no subcommand needed
        "dash":           [],  // standalone — no subcommand needed
        "panel":          [],  // standalone — no subcommand needed
        "system":         ["enable","disable","list"],
        "autorole":       ["add","remove","list","config","enable","disable"],
        "ar":             ["add","remove","list","config","enable","disable"],
        "humanrole":      ["add","remove"],
        "humanroles":     ["add","remove"],
        "botrole":        ["add","remove"],
        "botroles":       ["add","remove"],
        "massrole":       ["add","remove"],
        "massroles":      ["add","remove"],
        "memberrole":     ["add","remove"],
        "memberroles":    ["add","remove"],
        "vanityrole":     ["config","set","enable","disable","reset","add","remove"],
        "vr":             ["config","set","enable","disable","reset","add","remove"],
        "tagrole":        ["config","set","enable","disable","reset","add","remove"],
        "tgr":            ["config","set","enable","disable","reset","add","remove"],
        "vouchsystem":    ["config","set","enable","disable","reset"],
        "vouch":          ["config","set","enable","disable","reset","add","remove","list"],
        "badword":        ["add","remove","list","config","enable","disable"],
        "bw":             ["add","remove","list","config","enable","disable"],
        "nsfwword":       ["add","remove","list","config","enable","disable"],
        "nsfwwords":      ["add","remove","list","config","enable","disable"],
        "verify":         ["config","enable","disable","setup"],
        "verification":   ["config","enable","disable","setup"],
        "accountage":     ["enable","disable","setdays","setaction","setchannel"],
        "agegate":        ["enable","disable","setdays","setaction","setchannel"],
        "hangman":        ["start","stop","list"],
        "hm":             ["start","stop","list"],
        "wordle":         ["start","stop"],
        "scramble":       ["start","stop"],
        "wordchain":      ["start","stop"],
        "wc":             ["start","stop"],
        "connect4":       ["start","stop"],
        "c4":             ["start","stop"],
        "ttt":            ["start","stop"],
        "tictactoe":      ["start","stop"],
        "bs":             ["start","stop","join"],
        "botset":         ["name","avatar","banner","reset","status"],
        "rotateavatar":   ["add","remove","list","config","start","stop"],
        "rotavatar":      ["add","remove","list","config","start","stop"],
        "heist":          ["start","join","stop"],
        "invite":         [],  // no args needed
        "invites":        [],  // no args needed
        "setprefix":      ["config","settings","status","current","set","change","update","reset","default"],
        "prefix":         ["config","settings","status","current","set","change","update","reset","default"],
        "del":            ["dm"],
        "dev":            ["add","remove","list"],
        "botadmin":       ["add","remove","list"],
        "botpartner":     ["add","remove","list"],
        "fixdb":          [],
});
function getSubcommandRequiredCommands() { return SOEZY_SUBCOMMAND_REQUIRED; }
function bold(text) {
  return `**${text}**`;
}

function formatSuccess(text) {
  return `${runtimeEmoji("success")} ${bold(text)}`;
}

function formatError(text) {
  return `${runtimeEmoji("error")} ${bold(text)}`;
}

function formatWarning(text) {
  return `${runtimeEmoji("warning")} ${bold(text)}`;
}

function formatInfo(text) {
  return `${runtimeEmoji("info")} ${bold(text)}`;
}

// ================= FUN COMMAND HANDLER =================
// Command configuration with metadata
const funCommands = {
  // Commands that require a target user
  hug: {
    requiresTarget: true,
    allowSelf: false,
    selfMessage: "You can't hug yourself!",
    description: (author, target) => `${author} hugs ${target}!`,
    action: "hug"
  },
  kiss: {
    requiresTarget: true,
    allowSelf: false,
    selfMessage: "You can't kiss yourself!",
    description: (author, target) => `${author} kisses ${target}!`,
    action: "kiss"
  },
  pat: {
    aliases: ["headpat"],
    requiresTarget: true,
    allowSelf: false,
    selfMessage: "You can't pat yourself!",
    description: (author, target) => `${author} pats ${target}!`,
    action: "pat"
  },
  slap: {
    requiresTarget: true,
    allowSelf: true,
    selfMessage: "Why would you slap yourself?",
    description: (author, target) => `${author} slaps ${target}!`,
    action: "slap"
  },
  cuddle: {
    aliases: ["snuggle"],
    requiresTarget: true,
    allowSelf: false,
    selfMessage: "You can't cuddle yourself!",
    description: (author, target) => `${author} cuddles ${target}!`,
    action: "cuddle"
  },
  poke: {
    requiresTarget: true,
    allowSelf: true,
    selfMessage: "Stop poking yourself!",
    description: (author, target) => `${author} pokes ${target}!`,
    action: "poke"
  },
  wave: {
    aliases: ["hi"],
    requiresTarget: false,
    description: (author, target) => target ? `${author} waves at ${target}!` : `${author} waves!`,
    action: "wave"
  },
  bite: {
    requiresTarget: true,
    allowSelf: true,
    selfMessage: "Ouch! Don't bite yourself!",
    description: (author, target) => `${author} bites ${target}!`,
    action: "bite"
  },
  cry: {
    requiresTarget: false,
    description: (author) => `${author} is crying!`,
    action: "cry"
  },
  dance: {
    requiresTarget: false,
    description: (author) => `${author} is dancing!`,
    action: "dance"
  },
  blush: {
    requiresTarget: false,
    description: (author) => `${author} is blushing!`,
    action: "blush"
  },
  smile: {
    requiresTarget: false,
    description: (author) => `${author} is smiling!`,
    action: "smile"
  },
  highfive: {
    aliases: ["hi5"],
    requiresTarget: true,
    allowSelf: true,
    selfMessage: "You can't high five yourself!",
    description: (author, target) => `${author} high fives ${target}!`,
    action: "highfive"
  },
  bonk: {
    requiresTarget: true,
    allowSelf: true,
    selfMessage: "Don't bonk yourself!",
    description: (author, target) => `${author} bonks ${target}! Go to horny jail!`,
    action: "bonk"
  },
  yeet: {
    requiresTarget: true,
    allowSelf: true,
    selfMessage: "You yeet yourself into the sky!",
    description: (author, target) => `${author} yeets ${target}!`,
    action: "yeet"
  },
  punch: {
    requiresTarget: true,
    allowSelf: true,
    selfMessage: "Why punch yourself?",
    description: (author, target) => `${author} punches ${target}!`,
    action: "punch"
  },
  kill: {
    requiresTarget: true,
    allowSelf: true,
    selfMessage: "Please don't!",
    description: (author, target) => `${author} attacks ${target}!`,
    action: "kill"
  },
  wink: {
    requiresTarget: false,
    description: (author, target) => target ? `${author} winks at ${target}!` : `${author} winks!`,
    action: "wink"
  },
  pout: {
    requiresTarget: false,
    description: (author) => `${author} is pouting!`,
    action: "pout"
  },
  laugh: {
    aliases: ["lol"],
    requiresTarget: false,
    description: (author) => `${author} is laughing!`,
    action: "laugh"
  },
  confused: {
    aliases: ["huh"],
    requiresTarget: false,
    description: (author) => `${author} is confused!`,
    action: "confused"
  },
  sleep: {
    aliases: ["zzz"],
    requiresTarget: false,
    description: (author) => `${author} is sleeping!`,
    action: "sleep"
  },
  run: {
    requiresTarget: false,
    description: (author) => `${author} is running away!`,
    action: "run"
  },
  lick: {
    requiresTarget: true,
    allowSelf: true,
    selfMessage: "You can't lick yourself!",
    description: (author, target) => `${author} licks ${target}!`,
    action: "lick"
  },
  stare: {
    requiresTarget: false,
    description: (author, target) => target ? `${author} stares at ${target}!` : `${author} is staring...`,
    action: "stare"
  },
  thumbsup: {
    aliases: ["thumbs"],
    requiresTarget: false,
    description: (author) => `${author} gives a thumbs up!`,
    action: "thumbsup"
  },
  facepalm: {
    aliases: ["fp"],
    requiresTarget: false,
    description: (author) => `${author} facepalms!`,
    action: "facepalm"
  },
  shrug: {
    requiresTarget: false,
    description: (author) => `${author} shrugs!`,
    action: "shrug"
  },
  boop: {
    requiresTarget: true,
    allowSelf: true,
    selfMessage: "You booped your own nose!",
    description: (author, target) => `${author} boops ${target}'s nose!`,
    action: "boop"
  },
  nom: {
    requiresTarget: true,
    allowSelf: true,
    selfMessage: "You can't nom yourself!",
    description: (author, target) => `${author} noms ${target}!`,
    action: "nom"
  },
  handhold: {
    aliases: ["holdhands"],
    requiresTarget: true,
    allowSelf: true,
    selfMessage: "You hold your own hand...",
    description: (author, target) => `${author} holds ${target}'s hand!`,
    action: "handhold"
  },
  tickle: {
    requiresTarget: true,
    allowSelf: true,
    selfMessage: "You tickle yourself and giggle!",
    description: (author, target) => `${author} tickles ${target}!`,
    action: "tickle"
  },
  feed: {
    requiresTarget: true,
    allowSelf: true,
    selfMessage: "You feed yourself!",
    description: (author, target) => `${author} feeds ${target}!`,
    action: "feed"
  }
};

// Build command lookup with aliases
const commandLookup = {};
Object.keys(funCommands).forEach(cmdName => {
  const cmdConfig = funCommands[cmdName];
  commandLookup[cmdName] = cmdConfig;
  
  // Add aliases
  if (cmdConfig.aliases) {
    cmdConfig.aliases.forEach(alias => {
      commandLookup[alias] = cmdConfig;
    });
  }
});

// ================= UNIFIED FUN COMMAND HANDLER =================
// This should be placed in your main message handler
function handleFunCommand(cmd, msg, prefix = runtimePrefix(msg.guildId)) {
  const guildId = msg.guildId;
  const cmdConfig = commandLookup[cmd];
  
  if (!cmdConfig) {
    return false; // Not a fun command
  }
  
  // Check if fun commands are enabled
  if (!guildData(guildId).fun?.enabled) {
    return msg.reply({
      embeds: [new EmbedBuilder().setDescription("Fun commands are disabled!").setColor(runtimeThemeColor())]
    });
  }
  
  const target = msg.mentions.users.first();
  
  // Handle commands that require a target
  if (cmdConfig.requiresTarget && !target) {
    return msg.reply({
      embeds: [new EmbedBuilder().setDescription(`Usage: \`${prefix}${cmd} @user\``).setColor(runtimeThemeColor())]
    });
  }
  
  // Handle self-targeting
  if (target && target.id === msg.author.id) {
    if (cmdConfig.allowSelf === false) {
      return msg.reply({
        embeds: [new EmbedBuilder().setDescription(cmdConfig.selfMessage).setColor(runtimeThemeColor())]
      });
    } else if (cmdConfig.selfMessage) {
      return msg.reply({
        embeds: [new EmbedBuilder().setDescription(cmdConfig.selfMessage).setColor(runtimeThemeColor())]
      });
    }
  }
  
  // Get the GIF and create embed
  const gifUrl = getRandomGif(cmdConfig.action);
  if (!gifUrl) {
    return msg.reply({
      embeds: [new EmbedBuilder().setDescription(`The ${cmd} GIF is unavailable right now. Please try again shortly.`).setColor(runtimeThemeColor())]
    });
  }
  const ARROW = "<a:zyarrow:1487457493549453339>";
  const EXCL  = "";
  const embed = new EmbedBuilder()
    .setDescription(`${ARROW} ${cmdConfig.description(msg.author, target)} ${EXCL}`)
    .setImage(gifUrl)
    .setColor(runtimeThemeColor())
    .setTimestamp();
  
  return msg.reply({ embeds: [embed] });
}

/* ================= COMMAND ENABLE/DISABLE FUNCTIONS ================= */

function isCommandDisabled(guildId, command) {
  const cmds = guildData(guildId).disabledCommands;
  if (Array.isArray(cmds)) return cmds.includes(command.toLowerCase());
  if (cmds && typeof cmds === "object") return cmds[command.toLowerCase()] === true;
  return false;
}

function disableCommand(guildId, command) {
  const g = guildData(guildId);
  const cmd = command.toLowerCase();
  if (!g.disabledCommands || typeof g.disabledCommands !== "object" || Array.isArray(g.disabledCommands)) {
    g.disabledCommands = Array.isArray(g.disabledCommands)
      ? Object.fromEntries(g.disabledCommands.map(name => [String(name).toLowerCase(), true]))
      : {};
  }
  g.disabledCommands[cmd] = true;
  saveDB();
  if (typeof refreshGuildConfig === "function") refreshGuildConfig(guildId, "disableCommand");
  console.log(`[CONFIG] Command disabled guild=${guildId} command=${cmd}`);
}

function enableCommand(guildId, command) {
  const g = guildData(guildId);
  const cmd = command.toLowerCase();
  if (Array.isArray(g.disabledCommands)) {
    g.disabledCommands = g.disabledCommands.filter(c => c !== cmd);
  } else if (g.disabledCommands && typeof g.disabledCommands === "object") {
    delete g.disabledCommands[cmd];
  } else {
    g.disabledCommands = {};
  }
  saveDB();
  if (typeof refreshGuildConfig === "function") refreshGuildConfig(guildId, "enableCommand");
  console.log(`[CONFIG] Command enabled guild=${guildId} command=${cmd}`);
}

function getDisabledCommands(guildId) {
  const cmds = guildData(guildId).disabledCommands;
  if (Array.isArray(cmds)) return cmds;
  if (cmds && typeof cmds === "object") return Object.keys(cmds).filter(name => cmds[name] === true);
  return [];
}

/* ================= SYSTEM ENABLE/DISABLE FUNCTIONS ================= */

function ensureFeatureStores(guildId = null) {
  if (!db.global || typeof db.global !== "object") db.global = {};
  if (!db.global.features || typeof db.global.features !== "object") db.global.features = {};
  if (!db.globalSystems || typeof db.globalSystems !== "object") db.globalSystems = {};
  for (const [key, value] of Object.entries(db.globalSystems)) {
    if (db.global.features[key] === undefined && typeof value === "boolean") db.global.features[key] = value;
  }
  if (!guildId) return null;
  const gd = guildData(guildId);
  if (!gd.features || typeof gd.features !== "object") gd.features = {};
  if (!db.guildSystems || typeof db.guildSystems !== "object") db.guildSystems = {};
  if (!db.guildSystems[guildId] || typeof db.guildSystems[guildId] !== "object") db.guildSystems[guildId] = {};
  for (const [key, value] of Object.entries(db.guildSystems[guildId])) {
    if (gd.features[key] === undefined && typeof value === "boolean") gd.features[key] = value;
  }
  return gd;
}

function isSystemEnabled(guildId, system) {
  const key = system.toLowerCase();
  if (typeof globalThis.getFeatureState === "function") return globalThis.getFeatureState(guildId, key);
  const gd = ensureFeatureStores(guildId) || {};
  const gs = db.guildSystems?.[guildId] || {};

  if (gs[key] === true || gs[key] === false) {
    if (gd.features && gd.features[key] !== gs[key]) gd.features[key] = gs[key];
    return gs[key];
  }
  if (gd.features && typeof gd.features[key] === "boolean") return gd.features[key];

  // Check per-system guildData flags FIRST — these are the authoritative source.
  // Per-system commands (e.g. ,wall enable/disable) write here directly.
  const fallbackMap = {
    ticket:        gd.ticket?.enabled,
    counting:      gd.countingSystem?.enabled,
    confession:    gd.confession?.enabled,
    economy:       gd.economy?.enabled,
    giveaway:      gd.giveawaySystem?.enabled,
    sticky:        gd.stickySystem?.enabled,
    afk:           gd.afk?.enabled,
    antibot:       gd.antibot?.enabled,
    antinuke:      gd.antinuke?.enabled,
    antilink:      gd.antilink?.enabled,
    automod:       gd.automod?.enabled,
    security:      gd.security?.enabled,
    media:         gd.media?.enabled,
    welcome:       gd.welcome?.enabled,
    goodbye:       gd.goodbye?.enabled,
    boost:         gd.boost?.enabled,
    logging:       gd.logging?.enabled,
    birthday:      gd.birthday?.enabled,
    invites:       gd.inviteSystem?.enabled,
    wall:          gd.wallSystem?.enabled,
    autoresponder: gd.autoresponder?.enabled,
    autoreact:     gd.autoreact?.enabled,
    customroles:   gd.customRoles?.enabled ?? gd.customroles?.enabled,
    fun:           gd.fun?.enabled,
    tempvoice:     gd.tempVoice?.enabled ?? gd.tempvoice?.enabled,
    joindm:        gd.joinDm?.enabled,
    accountage:    gd.accountAge?.enabled,
  };
  if (key in fallbackMap && fallbackMap[key] !== undefined) return fallbackMap[key] === true;
  if (db.global?.features && typeof db.global.features[key] === "boolean") return db.global.features[key];
  if (db.globalSystems && typeof db.globalSystems[key] === "boolean") return db.globalSystems[key];

  // Default: only fun/economy are enabled until configured.
  return key === "fun" || key === "economy";
}

function toggleSystem(system, enabled, guildId) {
  if (!guildId) return false;
  const key = system.toLowerCase();
  if (typeof globalThis.setFeatureState === "function") return globalThis.setFeatureState(guildId, key, enabled);
  const validSystems = runtimeSystems().map(s => s.name);
  // Also allow linked child systems that aren't top-level entries (e.g. autoreact, joindm)
  const linkedChildren = runtimeSystems().flatMap(s => s.linked || []);
  if (!validSystems.includes(key) && !linkedChildren.includes(key)) return false;
  const gd = ensureFeatureStores(guildId);
  if (!gd) return false;
  gd.features[key] = enabled;
  db.guildSystems[guildId][key] = enabled;

  // Sync to per-system guildData enabled flags so all commands stay in sync
  const systemMap = {
    ticket:        () => { if (!gd.ticket) gd.ticket = {};                 gd.ticket.enabled = enabled; },
    counting:      () => { if (!gd.countingSystem) gd.countingSystem = {}; gd.countingSystem.enabled = enabled; },
    confession:    () => { if (!gd.confession) gd.confession = {};         gd.confession.enabled = enabled; },
    economy:       () => { if (!gd.economy) gd.economy = {};               gd.economy.enabled = enabled; },
    giveaway:      () => { if (!gd.giveawaySystem) gd.giveawaySystem = {}; gd.giveawaySystem.enabled = enabled; },
    sticky:        () => { if (!gd.stickySystem) gd.stickySystem = {};     gd.stickySystem.enabled = enabled; },
    afk:           () => { if (!gd.afk) gd.afk = {};                       gd.afk.enabled = enabled; },
    antibot:       () => { if (!gd.antibot) gd.antibot = {};               gd.antibot.enabled = enabled; },
    antinuke:      () => { if (!gd.antinuke) gd.antinuke = {};             gd.antinuke.systemEnabled = gd.antinuke.enabled = enabled; },
    antilink:      () => { if (!gd.antilink) gd.antilink = {};             gd.antilink.enabled = enabled; },
    automod:       () => { if (!gd.automod) gd.automod = {}; gd.automod.systemEnabled = gd.automod.enabled = enabled; },
    security:      () => { if (!gd.security) gd.security = {}; gd.security.enabled = enabled; },
    welcome:       () => { if (!gd.welcome) gd.welcome = {};               gd.welcome.enabled = enabled; },
    goodbye:       () => { if (!gd.goodbye) gd.goodbye = {};               gd.goodbye.enabled = enabled; },
    boost:         () => { if (!gd.boost) gd.boost = {};                   gd.boost.enabled = enabled; },
    logging:       () => { if (!gd.logging) gd.logging = {};               gd.logging.enabled = enabled; },
    birthday:      () => { if (!gd.birthday) gd.birthday = {};             gd.birthday.enabled = enabled; },
    invites:       () => { if (!gd.inviteSystem) gd.inviteSystem = {};     gd.inviteSystem.enabled = enabled; },
    wall:          () => { if (!gd.wallSystem) gd.wallSystem = {};         gd.wallSystem.systemEnabled = gd.wallSystem.enabled = enabled; },
    tempvoice:     () => { if (!gd.tempvoice) gd.tempvoice = {}; gd.tempvoice.enabled = enabled; if (!gd.tempVoice) gd.tempVoice = { enabled: false, createChannel: null, privateCreateChannel: null, category: null, channels: {}, defaultName: "{user}'s Channel", defaultLimit: 0 }; gd.tempVoice.enabled = enabled; },
    joindm:        () => { if (!gd.joinDm) gd.joinDm = {};                 gd.joinDm.enabled = enabled; },
    fun:           () => { if (!gd.fun) gd.fun = {};                       gd.fun.enabled = enabled; },
    autoresponder: () => { if (!gd.autoresponder) gd.autoresponder = {};   gd.autoresponder.enabled = enabled; },
    autoreact:     () => { if (!gd.autoreact) gd.autoreact = {};           gd.autoreact.enabled = enabled; },
    customroles:   () => { if (!gd.customroles) gd.customroles = {}; gd.customroles.enabled = enabled; if (!gd.customRoles) gd.customRoles = { enabled: false, maxRoles: 1, users: {} }; gd.customRoles.enabled = enabled; },
    accountage:    () => { if (!gd.accountAge) gd.accountAge = {};         gd.accountAge.enabled = enabled; },
    media:         () => { if (!gd.media) gd.media = {};                   gd.media.enabled = enabled; },
  };
  if (systemMap[key]) systemMap[key]();

  saveDB();
  if (typeof refreshGuildConfig === "function") refreshGuildConfig(guildId, `toggleSystem:${key}`);
  if (typeof refreshPanelState === "function") refreshPanelState(guildId);
  console.log(`[CONFIG] System ${enabled ? "enabled" : "disabled"} guild=${guildId} system=${key}`);
  return true;
}

function isSystemEnabledGlobal(system) {
  ensureFeatureStores();
  const key = system.toLowerCase();
  if (typeof globalThis.getFeatureState === "function") return globalThis.getFeatureState(null, key, { global: true });
  if (typeof db.global.features[key] === "boolean") return db.global.features[key];
  if (typeof db.globalSystems[key] === "boolean") return db.globalSystems[key];
  return true;
}

function toggleSystemGlobal(system, enabled) {
  const key = system.toLowerCase();
  if (typeof globalThis.setFeatureState === "function") return globalThis.setFeatureState(null, key, enabled, { global: true });
  const validSystems = runtimeSystems().map(s => s.name);
  const linkedChildren = runtimeSystems().flatMap(s => s.linked || []);
  if (!validSystems.includes(key) && !linkedChildren.includes(key)) return false;
  ensureFeatureStores();
  db.global.features[key] = enabled;
  db.globalSystems[key] = enabled;
  saveDB();
  if (typeof syncRuntimeState === "function") syncRuntimeState(null, `toggleSystemGlobal:${key}`);
  console.log(`[CONFIG] System ${enabled ? "enabled" : "disabled"} global system=${key}`);
  return true;
}



const runtimeManagerApi = {
  installSoezyClientListenerGuard,
  soezySafeReply,
  soezySafeDeferReply,
  soezySafeDeferUpdate,
  validateRuntimeFiles,
  validateThemeRuntime,
  validateCommandExports,
  validateStartupEnvironment,
  nodeHealth,
  cleanRuntimeCaches,
};

Object.assign(globalThis, {
  soezyRuntimeManager: runtimeManagerApi,
  soezyNodeHealth: nodeHealth,
});

module.exports = runtimeManagerApi;
