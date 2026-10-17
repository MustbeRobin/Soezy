"use strict";

const DEFAULT_COMMAND_COOLDOWN_MS = 5_000;
const DEFAULT_INTERACTION_COOLDOWN_MS = 0;
const DUPLICATE_COMMAND_WINDOW_MS = 1_500;
const COOLDOWN_REPLY_DEDUPE_MS = 4_000;
const COOLDOWN_REPLY_DELETE_MS = 5_000;

const COMMAND_COOLDOWN_OVERRIDES = Object.freeze({
  help: 3_000,
  ping: 3_000,
  latency: 3_000,
  purge: 10_000,
  nuke: 15_000,
  clear: 8_000,
  ai: 8_000,
  chat: 8_000,
  giveaway: 180_000,
  gw: 180_000,
  g: 180_000,
  gstart: 180_000,
  gcreate: 180_000,
});

const GIVEAWAY_COMMANDS = new Set(["giveaway", "gw", "g", "gstart", "gcreate"]);
const CONFIG_COMMANDS = new Set([
  "config", "setup", "ticket", "welcome", "goodbye", "boost", "antinuke",
  "antibot", "automod", "antilink", "logging", "wall", "confess", "media",
  "tempvoice", "economy", "autorole", "joindm", "sticky", 
  "birthday", "autoresponder", "autoreact", "embed", "prefix",
]);

const cooldownRuntimeState = globalThis.__soezyCooldownRuntime || (globalThis.__soezyCooldownRuntime = {
  globalUserCooldowns: new Map(),
  commandCooldowns: new Map(),
  interactionCooldowns: new Map(),
  duplicateCommands: new Map(),
  cooldownReplies: new Map(),
  categoryCooldowns: new Map(),
  interactionLocks: new Map(),
  seenInteractions: new Map(),
});

const MUSIC_COOLDOWN_EXEMPT_COMMANDS = new Set([
  "pause", "resume", "unpause", "skip", "s", "next", "queue", "q", "volume", "vol",
]);
const MUSIC_COOLDOWN_EXEMPT_INTERACTIONS = /^music_(pauseplay|skip|prev|queue|volume|lyricspage|lyricslive)_/i;

function normalizeCommandName(commandName) {
  return String(commandName || "").toLowerCase().trim();
}

function hasId(list, id) {
  return Array.isArray(list) && list.includes(id);
}

function canBypassCooldown(userId, guildId, context = {}) {
  if (!userId) return false;
  const cfg = context.config || globalThis.config || {};
  const database = context.db || globalThis.db || {};
  const guild = context.guild || context.member?.guild || {};

  if (hasId(cfg.ownerIds, userId) || hasId(cfg.owners, userId)) return true;
  if (hasId(database.devUsers, userId)) return true;
  if (guild.ownerId === userId) return true;
  if (typeof globalThis.isPremiumUser === "function" && globalThis.isPremiumUser(userId)) return true;
  if (guildId && typeof globalThis.isPremiumGuild === "function" && globalThis.isPremiumGuild(guildId)) return true;
  if (guildId && typeof globalThis.isShopPremium === "function" && globalThis.isShopPremium(userId, guildId)) return true;
  return false;
}

function getCommandCategory(commandName) {
  const command = normalizeCommandName(commandName);
  if (command === "help") return "help";
  if (GIVEAWAY_COMMANDS.has(command)) return "giveaway";
  if (CONFIG_COMMANDS.has(command)) return "config";
  if (["purge", "nuke", "clear"].includes(command)) return "moderation";
  if (["ai", "chat"].includes(command)) return "ai";
  return "default";
}

function getCommandCooldownMs(commandName, options = {}) {
  const command = normalizeCommandName(commandName);
  if (Number.isFinite(options.cooldownMs)) return Math.max(0, options.cooldownMs);
  if (Number.isFinite(options.cooldown)) return Math.max(0, options.cooldown);
  return COMMAND_COOLDOWN_OVERRIDES[command] ?? DEFAULT_COMMAND_COOLDOWN_MS;
}

function isCooldownExemptCommand(commandName, options = {}) {
  const command = normalizeCommandName(commandName);
  return options.cooldownExempt === true || MUSIC_COOLDOWN_EXEMPT_COMMANDS.has(command);
}

function getCommandCooldownKey(userId, commandName, guildId, options = {}) {
  const command = normalizeCommandName(commandName);
  const category = options.category || getCommandCategory(command);
  if (options.scope === "guild" || category === "giveaway") return `guild:${guildId || "global"}:${command}`;
  if (options.scope === "category") return `category:${guildId || "dm"}:${userId || "unknown"}:${category}`;
  return `user:${guildId || "dm"}:${userId || "unknown"}:${command}`;
}

function isDuplicateCommand(userId, commandName, guildId, options = {}) {
  if (!userId || !commandName) return false;
  if (canBypassCooldown(userId, guildId, options)) return false;
  const now = Date.now();
  const key = `${guildId || "dm"}:${userId}:${normalizeCommandName(commandName)}`;
  const expiresAt = cooldownRuntimeState.duplicateCommands.get(key) || 0;
  cooldownRuntimeState.duplicateCommands.set(key, now + (options.windowMs || DUPLICATE_COMMAND_WINDOW_MS));
  return expiresAt > now;
}

function checkCommandCooldown(userId, commandName, guildId, cooldownMs = null, options = {}) {
  const command = normalizeCommandName(commandName);
  if (!command || canBypassCooldown(userId, guildId, options)) return 0;
  if (isCooldownExemptCommand(command, options)) return 0;
  const duration = cooldownMs ?? getCommandCooldownMs(command, options);
  if (duration <= 0) return 0;

  const now = Date.now();
  const globalKey = `global-user:${guildId || "dm"}:${userId || "unknown"}`;
  const globalExpiresAt = cooldownRuntimeState.globalUserCooldowns.get(globalKey) || 0;
  if (globalExpiresAt > now) {
    console.warn(`[COOLDOWN] global user=${userId || "unknown"} guild=${guildId || "dm"} retry=${globalExpiresAt - now}ms`);
    return globalExpiresAt - now;
  }

  const key = getCommandCooldownKey(userId, command, guildId, options);
  const expiresAt = cooldownRuntimeState.commandCooldowns.get(key) || 0;
  if (expiresAt > now) {
    console.warn(`[COOLDOWN] command user=${userId || "unknown"} guild=${guildId || "dm"} command=${command} retry=${expiresAt - now}ms`);
    return expiresAt - now;
  }

  cooldownRuntimeState.globalUserCooldowns.set(globalKey, now + DEFAULT_COMMAND_COOLDOWN_MS);
  cooldownRuntimeState.commandCooldowns.set(key, now + duration);
  return 0;
}

function checkCommandGate(userId, commandName, guildId, cooldownMs = null, options = {}) {
  return checkCommandCooldown(userId, commandName, guildId, cooldownMs, options);
}

function getInteractionKey(interaction, options = {}) {
  const userId = options.userId || interaction?.user?.id || "unknown";
  const guildId = options.guildId || interaction?.guildId || "dm";
  if (options.scope !== "component") return `${guildId}:${userId}:interaction:global`;
  const rawId = String(options.group || interaction?.customId || interaction?.commandName || "interaction");
  const group = /help|dashboard|select|dropdown|button|toggle|page|pagination|cfg|config|panel/i.test(rawId)
    ? rawId.replace(/\d{17,20}/g, ":id")
    : rawId;
  return `${guildId}:${userId}:interaction:${group}`;
}

function checkInteractionCooldown(interaction, options = {}) {
  if (options.enforce !== true) return { allowed: true, retryAfter: 0 };
  const userId = options.userId || interaction?.user?.id;
  const guildId = options.guildId || interaction?.guildId;
  const rawId = String(interaction?.customId || interaction?.commandName || options.group || "");
  if (options.cooldownExempt === true || MUSIC_COOLDOWN_EXEMPT_INTERACTIONS.test(rawId)) {
    return { allowed: true, retryAfter: 0 };
  }
  if (!userId || canBypassCooldown(userId, guildId, { ...options, member: interaction?.member, guild: interaction?.guild })) {
    return { allowed: true, retryAfter: 0 };
  }
  const now = Date.now();
  const key = options.key || getInteractionKey(interaction, options);
  const windowMs = options.windowMs ?? DEFAULT_INTERACTION_COOLDOWN_MS;
  if (windowMs <= 0) return { allowed: true, retryAfter: 0 };
  const expiresAt = cooldownRuntimeState.interactionCooldowns.get(key) || 0;
  if (expiresAt > now) return { allowed: false, retryAfter: expiresAt - now };
  cooldownRuntimeState.interactionCooldowns.set(key, now + windowMs);
  return { allowed: true, retryAfter: 0 };
}

function isDuplicateInteraction(interaction, options = {}) {
  if (!interaction?.id) return false;
  const now = Date.now();
  const expiresAt = cooldownRuntimeState.seenInteractions.get(interaction.id) || 0;
  cooldownRuntimeState.seenInteractions.set(interaction.id, now + (options.windowMs || 15_000));
  return expiresAt > now;
}

function canRunInteraction(interaction, options = {}) {
  if (isDuplicateInteraction(interaction, options)) {
    return { allowed: false, duplicate: true, retryAfter: options.windowMs || 15_000 };
  }
  return { allowed: true, duplicate: false, retryAfter: 0 };
}

function lockInteraction(interaction, options = {}) {
  const now = Date.now();
  const key = options.key || getInteractionKey(interaction, options);
  const expiresAt = cooldownRuntimeState.interactionLocks.get(key) || 0;
  if (expiresAt > now) return { locked: false, key, retryAfter: expiresAt - now };
  cooldownRuntimeState.interactionLocks.set(key, now + (options.ttl || 10_000));
  return { locked: true, key, retryAfter: 0 };
}

function unlockInteraction(keyOrInteraction) {
  const key = typeof keyOrInteraction === "string" ? keyOrInteraction : getInteractionKey(keyOrInteraction);
  return cooldownRuntimeState.interactionLocks.delete(key);
}

function shouldSendCooldownReply(userId, guildId, commandName) {
  const key = `${guildId || "dm"}:${userId || "unknown"}:${normalizeCommandName(commandName || "unknown")}`;
  const now = Date.now();
  const expiresAt = cooldownRuntimeState.cooldownReplies.get(key) || 0;
  if (expiresAt > now) return false;
  cooldownRuntimeState.cooldownReplies.set(key, now + COOLDOWN_REPLY_DEDUPE_MS);
  return true;
}

async function sendCooldownReply(target, remainingMs, options = {}) {
  if (!shouldSendCooldownReply(options.userId, options.guildId, options.commandName)) return null;
  const seconds = Math.max(1, Math.ceil((Number(remainingMs) || 0) / 1000));
  const label = typeof globalThis.formatDuration === "function" ? globalThis.formatDuration(remainingMs) : `${seconds}s`;
  const warning = typeof globalThis.createWarningContainer === "function"
    ? globalThis.createWarningContainer("Slow Down", `Please wait **${label}** before using this again.`)
    : undefined;
  const flags = (globalThis.MessageFlags?.IsComponentsV2 || 0) | (options.ephemeral ? 64 : 0);
  const payload = warning
    ? { components: [warning], flags }
    : { content: `Please wait ${label} before using this again.`, ephemeral: !!options.ephemeral };

  const send = async () => {
    if (typeof globalThis.safeReply === "function") return globalThis.safeReply(target, payload);
    if (target?.reply) return target.reply(payload).catch(() => null);
    return null;
  };

  const sent = await send();
  if (!options.ephemeral) {
    const timer = setTimeout(() => {
      if (sent?.delete) sent.delete().catch(() => {});
      else if (target?.deleteReply) target.deleteReply().catch(() => {});
    }, options.deleteAfterMs || COOLDOWN_REPLY_DELETE_MS);
    timer.unref?.();
  }
  return sent;
}

function checkCooldown(userId, commandName, cooldownMs = DEFAULT_COMMAND_COOLDOWN_MS) {
  return checkCommandCooldown(userId, commandName, "global", cooldownMs, { scope: "user" });
}

function cleanupCommandCooldowns(now = Date.now()) {
  for (const [key, expiresAt] of cooldownRuntimeState.globalUserCooldowns) if (expiresAt <= now) cooldownRuntimeState.globalUserCooldowns.delete(key);
  for (const [key, expiresAt] of cooldownRuntimeState.commandCooldowns) if (expiresAt <= now) cooldownRuntimeState.commandCooldowns.delete(key);
  for (const [key, expiresAt] of cooldownRuntimeState.interactionCooldowns) if (expiresAt <= now) cooldownRuntimeState.interactionCooldowns.delete(key);
  for (const [key, expiresAt] of cooldownRuntimeState.duplicateCommands) if (expiresAt <= now) cooldownRuntimeState.duplicateCommands.delete(key);
  for (const [key, expiresAt] of cooldownRuntimeState.cooldownReplies) if (expiresAt <= now) cooldownRuntimeState.cooldownReplies.delete(key);
  for (const [key, expiresAt] of cooldownRuntimeState.categoryCooldowns) if (expiresAt <= now) cooldownRuntimeState.categoryCooldowns.delete(key);
  for (const [key, expiresAt] of cooldownRuntimeState.interactionLocks) if (expiresAt <= now) cooldownRuntimeState.interactionLocks.delete(key);
  for (const [key, expiresAt] of cooldownRuntimeState.seenInteractions) if (expiresAt <= now) cooldownRuntimeState.seenInteractions.delete(key);
}

const cooldownApi = {
  checkCooldown,
  checkCommandCooldown,
  checkCommandGate,
  checkInteractionCooldown,
  canRunInteraction,
  isDuplicateInteraction,
  lockInteraction,
  unlockInteraction,
  isDuplicateCommand,
  sendCooldownReply,
  shouldSendCooldownReply,
  canBypassCooldown,
  canBypassCommandCooldown: canBypassCooldown,
  getCommandCooldownMs,
  getCommandCategory,
  cleanupCommandCooldowns,
  isCooldownExemptCommand,
};

globalThis.soezyCooldownManager = cooldownApi;
Object.assign(globalThis, cooldownApi);

module.exports = cooldownApi;
