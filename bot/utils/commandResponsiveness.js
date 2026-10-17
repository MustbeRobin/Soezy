/* ================= COMMAND RESPONSIVENESS UX ================= */
(() => {
const { MessageFlags } = require("discord.js");

const root = typeof process !== "undefined" ? process : globalThis;
const PREFIX_THINK_DELAY_MS = 1000;
const COMPONENT_LOADING_DELAY_MS = 1000;
const SLOW_LOG_MS = 1000;
const COMPONENT_IN_FLIGHT_TTL_MS = 8000;
const COMPONENT_TYPES_WITH_DISABLED = new Set([2, 3, 5, 6, 7, 8]);
const LINK_BUTTON_STYLE = 5;
const COMPONENT_DISABLE_EXEMPT_CUSTOM_IDS = new Set([
  "create_ticket",
  "ticket_claim",
  "ticket_close",
]);

const commandTimings = root.__soezyCommandTimingSamples || (root.__soezyCommandTimingSamples = []);
const componentInFlight = root.__soezyComponentInFlight || (root.__soezyComponentInFlight = new Map());

const PUBLIC_SLASH_DEFER_COMMANDS = new Set([
  "play", "p", "skip", "stop", "pause", "resume", "queue", "q", "np", "nowplaying",
  "lyrics", "loop", "replay", "autoplay", "leave", "dc", "join", "247", "24/7",
]);

const SLOW_SLASH_COMMAND_HINTS = new Set([
  "play", "skip", "stop", "queue", "lyrics", "loop", "replay", "autoplay", "leave", "dc", "join", "247", "24/7",
  "antinuke", "antibot", "automod", "antilink", "security", "dashboard", "whitelist", "wall",
  "ticket", "welcome", "goodbye", "boost", "logging", "sticky", "autorole", "role", "massrole",
  "humanrole", "botrole", "mod", "moderation", "settings", "config", "sync", "premium",
]);

const FAST_PREFIX_COMMANDS = new Set([
  "ping", "latency", "prefix", "setprefix", "help", "h", "commands", "invite", "support",
]);

function getContextGuild(context) {
  return context?.guild || context?.message?.guild || context?.interaction?.guild || null;
}

function getContextClient(context) {
  return context?.client || context?.message?.client || context?.interaction?.client || globalThis.client || null;
}

function getGuildId(context) {
  return context?.guildId ||
    context?.guild?.id ||
    context?.message?.guildId ||
    context?.message?.guild?.id ||
    context?.interaction?.guildId ||
    context?.interaction?.guild?.id ||
    null;
}

function getBotDisplayName(context) {
  const guild = getContextGuild(context);
  const client = getContextClient(context);
  const botId = client?.user?.id || globalThis.client?.user?.id;
  const member = guild?.members?.me || (botId ? guild?.members?.cache?.get?.(botId) : null);
  const name = member?.displayName || client?.user?.username || globalThis.client?.user?.username || "Soezy";
  return String(name || "Soezy").replace(/\s+/g, " ").trim().slice(0, 80) || "Soezy";
}

function thinkingText(context, mode = "thinking") {
  const verb = mode === "processing" ? "processing your request" : "thinking";
  return `${getBotDisplayName(context)} is ${verb}...`;
}

function loadingPayload(context, text = null) {
  const guildId = getGuildId(context);
  const description = text || thinkingText(context);
  if (typeof createLoadingContainer === "function") {
    return {
      components: [createLoadingContainer("Processing", description, guildId)],
      flags: MessageFlags.IsComponentsV2,
    };
  }
  return {
    content: description,
    allowedMentions: { repliedUser: false },
  };
}

function markTiming(sample) {
  const elapsed = Date.now() - sample.startedAt;
  if (elapsed < SLOW_LOG_MS) return elapsed;
  const record = {
    source: sample.source || "unknown",
    name: sample.name || "unknown",
    guildId: sample.guildId || "dm",
    userId: sample.userId || "unknown",
    elapsed,
    at: Date.now(),
  };
  commandTimings.push(record);
  if (commandTimings.length > 300) commandTimings.splice(0, commandTimings.length - 300);
  console.log(`[PERF] ${record.source}:${record.name} guild=${record.guildId} user=${record.userId} ms=${record.elapsed}`);
  return elapsed;
}

function shouldPrefixShowThinking(commandName) {
  const name = String(commandName || "").toLowerCase();
  return !!name && !FAST_PREFIX_COMMANDS.has(name);
}

function startPrefixCommand(message, commandName, options = {}) {
  if (!message || !commandName) return null;
  if (message.__soezyResponsivenessTracker) return message.__soezyResponsivenessTracker;

  const tracker = {
    source: "message",
    name: String(commandName || "unknown").toLowerCase(),
    guildId: message.guildId || message.guild?.id || null,
    userId: message.author?.id || null,
    startedAt: Date.now(),
    timer: null,
    loadingMessage: null,
    finished: false,
    sendStarted: false,
    async finish() {
      if (tracker.finished) return;
      tracker.finished = true;
      if (tracker.timer) clearTimeout(tracker.timer);
      markTiming(tracker);
      const loading = tracker.loadingMessage;
      tracker.loadingMessage = null;
      if (loading?.deletable !== false && typeof loading?.delete === "function") {
        await loading.delete().catch(() => {});
      }
    },
    async progress(text) {
      if (!tracker.loadingMessage?.edit) return;
      await tracker.loadingMessage.edit(loadingPayload(message, text)).catch(() => {});
    },
  };

  message.__soezyResponsivenessTracker = tracker;

  const originalReply = message.reply?.bind(message);
  if (originalReply && !message.__soezyResponsivenessReplyWrapped) {
    message.__soezyResponsivenessReplyWrapped = true;
    message.reply = async function (payload) {
      await tracker.finish();
      return originalReply(payload);
    };
  }

  if (shouldPrefixShowThinking(commandName)) {
    tracker.timer = setTimeout(async () => {
      if (tracker.finished || tracker.sendStarted) return;
      tracker.sendStarted = true;
      try {
        const sent = await originalReply(loadingPayload(message, thinkingText(message)));
        if (tracker.finished) await sent?.delete?.().catch(() => {});
        else tracker.loadingMessage = sent;
      } catch {}
    }, options.delayMs || PREFIX_THINK_DELAY_MS);
    tracker.timer.unref?.();
  }

  return tracker;
}

async function finishPrefixMessage(message) {
  const tracker = message?.__soezyResponsivenessTracker;
  if (!tracker) return;
  message.__soezyResponsivenessTracker = null;
  await tracker.finish();
}

function shouldAutoDeferSlash(commandName) {
  const name = String(commandName || "").toLowerCase();
  if (!name) return false;
  if (SLOW_SLASH_COMMAND_HINTS.has(name)) return true;
  return [...SLOW_SLASH_COMMAND_HINTS].some(hint => name.includes(hint));
}

function slashDeferOptions(commandName) {
  const name = String(commandName || "").toLowerCase();
  if (PUBLIC_SLASH_DEFER_COMMANDS.has(name)) return {};
  return { flags: 64 };
}

async function maybeDeferSlash(interaction, commandName) {
  if (!interaction?.isChatInputCommand?.() || interaction.deferred || interaction.replied) return false;
  if (!shouldAutoDeferSlash(commandName)) return false;
  try {
    await interaction.deferReply(slashDeferOptions(commandName));
    return true;
  } catch (err) {
    console.warn(`[RESPONSIVENESS] slash defer failed /${commandName}: ${err.message}`);
    return false;
  }
}

function cloneComponentData(component) {
  if (!component) return component;
  if (typeof component.toJSON === "function") return component.toJSON();
  return JSON.parse(JSON.stringify(component));
}

function disableComponentTree(component) {
  const raw = cloneComponentData(component);
  if (!raw || typeof raw !== "object") return raw;
  if (Array.isArray(raw.components)) raw.components = raw.components.map(disableComponentTree).filter(Boolean);
  if (COMPONENT_TYPES_WITH_DISABLED.has(raw.type) && raw.style !== LINK_BUTTON_STYLE) raw.disabled = true;
  return raw;
}

function cloneComponents(components) {
  if (!Array.isArray(components)) return null;
  return components.map(cloneComponentData).filter(Boolean);
}

function disabledComponents(components) {
  if (!Array.isArray(components)) return null;
  return components.map(disableComponentTree).filter(Boolean);
}

function interactionLabel(interaction) {
  if (interaction?.isChatInputCommand?.()) return interaction.commandName || "slash";
  if (interaction?.customId) return interaction.customId.split(":")[0].slice(0, 80);
  return String(interaction?.type || "interaction");
}

function componentKey(interaction) {
  if (!interaction || interaction.isChatInputCommand?.()) return null;
  const customId = interaction.customId || interaction.commandName || interaction.type || "unknown";
  return `${interaction.guildId || "dm"}:${interaction.user?.id || "unknown"}:${interaction.message?.id || "no-message"}:${customId}`;
}

function claimComponentInteraction(interaction) {
  const key = componentKey(interaction);
  if (!key) return { allowed: true, key: null };
  const now = Date.now();
  for (const [activeKey, expiresAt] of componentInFlight) {
    if (expiresAt <= now) componentInFlight.delete(activeKey);
  }
  const existing = componentInFlight.get(key);
  if (existing && existing > now) return { allowed: false, key };
  componentInFlight.set(key, now + COMPONENT_IN_FLIGHT_TTL_MS);
  return { allowed: true, key };
}

function releaseComponentInteraction(key) {
  if (key) componentInFlight.delete(key);
}

function startInteractionTracking(interaction, options = {}) {
  if (!interaction) return null;
  if (interaction.__soezyResponsivenessTracker) return interaction.__soezyResponsivenessTracker;

  const inFlight = claimComponentInteraction(interaction);
  const tracker = {
    source: interaction.isChatInputCommand?.() ? "slash" : "interaction",
    name: interactionLabel(interaction),
    guildId: interaction.guildId || interaction.guild?.id || null,
    userId: interaction.user?.id || null,
    startedAt: Date.now(),
    finished: false,
    finalResponseSent: false,
    sourceMessageUpdated: false,
    loadingTimer: null,
    restoreComponents: null,
    inFlightKey: inFlight.key,
    inFlightAllowed: inFlight.allowed,
    async finish() {
      if (tracker.finished) return;
      tracker.finished = true;
      if (tracker.loadingTimer) clearTimeout(tracker.loadingTimer);
      releaseComponentInteraction(tracker.inFlightKey);
      markTiming(tracker);
      if (tracker.restoreComponents && !tracker.sourceMessageUpdated && interaction.message?.edit) {
        await interaction.message.edit({ components: tracker.restoreComponents, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      }
    },
  };

  interaction.__soezyResponsivenessTracker = tracker;

  function wrapResponseTarget(target, method, bindTarget = null) {
    if (!target || typeof target[method] !== "function") return;
    const flag = `__soezyResponsivenessWrapped_${method}`;
    if (target[flag]) return;
    const original = bindTarget ? target[method].bind(bindTarget) : target[method];
    target[method] = async function (...args) {
      if (method === "update") tracker.sourceMessageUpdated = true;
      tracker.finalResponseSent = method !== "followUp";
      const result = await original(...args);
      if (method !== "followUp") await tracker.finish();
      return result;
    };
    target[flag] = true;
  }

  const responseMethods = ["reply", "editReply", "followUp", "update", "showModal", "deferUpdate"];
  for (const method of responseMethods) {
    wrapResponseTarget(interaction.__soezyOriginalResponses, method);
    wrapResponseTarget(interaction, method, interaction);
  }

  if (!interaction.isChatInputCommand?.() && !COMPONENT_DISABLE_EXEMPT_CUSTOM_IDS.has(String(interaction.customId || "")) && interaction.message?.edit && interaction.message?.components?.length) {
    tracker.loadingTimer = setTimeout(async () => {
      if (tracker.finished || tracker.finalResponseSent) return;
      const original = cloneComponents(interaction.message.components);
      const disabled = disabledComponents(interaction.message.components);
      if (!disabled?.length) return;
      tracker.restoreComponents = original;
      await interaction.message.edit({ components: disabled, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
    }, options.componentDelayMs || COMPONENT_LOADING_DELAY_MS);
    tracker.loadingTimer.unref?.();
  }

  return tracker;
}

function getRecentSlowCommands() {
  return commandTimings.slice(-50);
}

const api = {
  startPrefixCommand,
  finishPrefixMessage,
  startInteractionTracking,
  maybeDeferSlash,
  claimComponentInteraction,
  releaseComponentInteraction,
  thinkingText,
  loadingPayload,
  getBotDisplayName,
  markTiming,
  getRecentSlowCommands,
};

Object.assign(globalThis, {
  soezyCommandResponsiveness: api,
  soezyStartPrefixCommandUx: startPrefixCommand,
  soezyFinishPrefixMessageUx: finishPrefixMessage,
  soezyStartInteractionUx: startInteractionTracking,
  soezyMaybeDeferSlashUx: maybeDeferSlash,
  soezyCommandThinkingText: thinkingText,
});

module.exports = api;
})();
