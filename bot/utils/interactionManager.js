/* ================= CONSOLIDATED INTERACTION MANAGER ================= */
(() => {
const UNKNOWN_OR_REPLIED = new Set([10062, 40060, 50027]);

function coercePlainReplyPayload(payload = {}) {
  if (!payload || typeof payload !== "object") return payload;
  if (!payload.content || payload.components?.length || payload.embeds?.length) return payload;
  const text = String(payload.content).slice(0, 1800);
  const flags = (payload.flags || 0) | (globalThis.MessageFlags?.IsComponentsV2 || 0);
  return {
    ...payload,
    content: undefined,
    components: typeof createInfoContainer === "function" ? [createInfoContainer("Notice", text)] : payload.components,
    flags,
  };
}

function errorCode(err) {
  return err?.code || err?.rawError?.code || err?.cause?.code || null;
}

function isExpiredInteraction(interaction) {
  if (!interaction?.createdTimestamp) return false;
  return Date.now() - interaction.createdTimestamp > 14 * 60 * 1000;
}

function isInteractionGone(err) {
  return UNKNOWN_OR_REPLIED.has(errorCode(err));
}

function normalizePayload(payload = {}) {
  const coerced = typeof coercePlainReplyPayload === "function" ? coercePlainReplyPayload(payload) : payload;
  return typeof normalizeComponentsV2Payload === "function" ? normalizeComponentsV2Payload(coerced) : coerced;
}

function stripEphemeral(payload = {}) {
  return typeof stripEphemeralFromPayload === "function" ? stripEphemeralFromPayload(payload) : payload;
}

async function safeReply(interaction, payload = {}) {
  try {
    if (!interaction || isExpiredInteraction(interaction)) return null;
    const clean = normalizePayload(payload);
    const original = interaction.__soezyOriginalResponses || {};
    if (interaction.deferred) return await (original.editReply || interaction.editReply)?.(stripEphemeral(clean));
    if (interaction.replied) return await (original.followUp || interaction.followUp)?.(clean);
    return await (original.reply || interaction.reply)?.(clean);
  } catch (err) {
    if (isInteractionGone(err)) return null;
    console.error("[interactionSafety.safeReply]", err.message);
    return null;
  }
}

async function safeEdit(target, payload = {}) {
  try {
    if (!target) return null;
    const clean = stripEphemeral(normalizePayload(payload));
    const original = target.__soezyOriginalResponses || {};
    if (original.editReply || target.editReply) return await (original.editReply || target.editReply)(clean);
    if (target.edit) return await target.edit(clean);
    return null;
  } catch (err) {
    if (isInteractionGone(err)) return null;
    console.error("[interactionSafety.safeEdit]", err.message);
    return null;
  }
}

async function safeEditReply(interaction, payload = {}) {
  return safeEdit(interaction, payload);
}

async function safeUpdate(interaction, payload = {}) {
  try {
    if (!interaction || isExpiredInteraction(interaction)) return null;
    const clean = stripEphemeral(normalizePayload(payload));
    const original = interaction.__soezyOriginalResponses || {};
    if (interaction.deferred || interaction.replied) return await safeEdit(interaction, clean);
    if (original.update || interaction.update) return await (original.update || interaction.update)(clean);
    return await safeReply(interaction, clean);
  } catch (err) {
    if (isInteractionGone(err)) return null;
    console.error("[interactionSafety.safeUpdate]", err.message);
    return null;
  }
}

async function safeFollowUp(interaction, payload = {}) {
  try {
    if (!interaction || isExpiredInteraction(interaction)) return null;
    const clean = normalizePayload(payload);
    const original = interaction.__soezyOriginalResponses || {};
    if (interaction.replied || interaction.deferred) return await (original.followUp || interaction.followUp)?.(clean);
    return await safeReply(interaction, clean);
  } catch (err) {
    if (isInteractionGone(err)) return null;
    console.error("[interactionSafety.safeFollowUp]", err.message);
    return null;
  }
}

async function safeDefer(interaction, options = {}) {
  try {
    if (!interaction || interaction.deferred || interaction.replied || isExpiredInteraction(interaction)) return false;
    const original = interaction.__soezyOriginalResponses || {};
    await (original.deferReply || interaction.deferReply)?.(options);
    return true;
  } catch (err) {
    if (isInteractionGone(err)) return false;
    console.error("[interactionSafety.safeDefer]", err.message);
    return false;
  }
}

async function safeAutoDefer(interaction, options = {}) {
  if (!interaction || interaction.deferred || interaction.replied || isExpiredInteraction(interaction)) return false;
  if (interaction.isAutocomplete?.()) return false;
  if (options.skipModal !== false && (interaction.isButton?.() || interaction.isStringSelectMenu?.())) {
    return safeDeferUpdate(interaction, options.updateOptions || {});
  }
  return safeDefer(interaction, options.replyOptions || { flags: options.ephemeral === false ? undefined : 64 });
}

async function safeDeferUpdate(interaction, options = {}) {
  try {
    if (!interaction || interaction.deferred || interaction.replied || isExpiredInteraction(interaction)) return false;
    const original = interaction.__soezyOriginalResponses || {};
    await (original.deferUpdate || interaction.deferUpdate)?.(options);
    return true;
  } catch (err) {
    if (isInteractionGone(err)) return false;
    console.error("[interactionSafety.safeDeferUpdate]", err.message);
    return false;
  }
}

function isPersistentTicketPanel(message) {
  const components = Array.isArray(message?.components) ? message.components : [];
  const pending = [...components];

  while (pending.length) {
    const component = pending.pop();
    if (!component) continue;
    const data = typeof component.toJSON === "function" ? component.toJSON() : component;
    if (data.custom_id === "create_ticket" || data.customId === "create_ticket") return true;
    if (Array.isArray(data.components)) pending.push(...data.components);
    if (data.accessory) pending.push(data.accessory);
  }

  return false;
}

function scheduleMenuExpiration(message, options = {}) {
  if (!message?.id || message.__soezyMenuExpired || isPersistentTicketPanel(message)) return null;
  if (typeof globalThis.createPanel === "function") {
    return globalThis.createPanel({
      message,
      ownerId: options.userId || options.ownerId || "any",
      command: options.command || options.panelType,
      type: options.panelType || options.type || "panel",
      payload: { components: message.components },
      meta: options,
    });
  }
  return null;
}

Object.assign(globalThis, {
  safeReply,
  safeEdit,
  safeEditReply,
  safeUpdate,
  safeFollowUp,
  safeDefer,
  safeAutoDefer,
  safeDeferUpdate,
  safeDeferReply: safeDefer,
  safeDeferUpdate,
  scheduleMenuExpiration,
  isExpiredInteraction,
  isInteractionGone,
});


/* ---- Response guards merged from interactionHelpers.js ---- */
function installInteractionResponseGuards(interaction) {
  if (!interaction || interaction.__soezyResponseGuardsInstalled) return interaction;
  interaction.__soezyResponseGuardsInstalled = true;

  const original = {
    reply: interaction.reply?.bind(interaction),
    editReply: interaction.editReply?.bind(interaction),
    followUp: interaction.followUp?.bind(interaction),
    deferReply: interaction.deferReply?.bind(interaction),
    deferUpdate: interaction.deferUpdate?.bind(interaction),
    update: interaction.update?.bind(interaction),
  };
  interaction.__soezyOriginalResponses = original;

  if (original.deferReply) {
    interaction.deferReply = async options => {
      if (interaction.replied || interaction.deferred) return false;
      try {
        await original.deferReply(options);
        return true;
      } catch (err) {
        if (typeof soezyIsInteractionGone === "function" && soezyIsInteractionGone(err)) return false;
        throw err;
      }
    };
  }
  if (original.deferUpdate) {
    interaction.deferUpdate = async options => {
      if (interaction.replied || interaction.deferred) return false;
      try {
        await original.deferUpdate(options);
        return true;
      } catch (err) {
        if (typeof soezyIsInteractionGone === "function" && soezyIsInteractionGone(err)) return false;
        throw err;
      }
    };
  }
  if (original.reply) {
    interaction.reply = async payload => {
      const clean = normalizeInteractionPayload(payload);
      const isEphemeral = hasEphemeralFlag(clean?.flags);
      try {
        const sent = interaction.deferred && original.editReply
          ? await original.editReply(stripEphemeralFromPayload(clean))
          : interaction.replied && original.followUp
            ? await original.followUp(clean)
            : await original.reply(clean);
        patchMessageEditTarget(sent);
        if (typeof scheduleMenuExpiration === "function") scheduleMenuExpiration(sent, { ownerId: interaction.user?.id, command: interaction.commandName || interaction.customId });
        if (!isEphemeral && isMarkedAutoDeletePayload(clean)) {
          setTimeout(() => interaction.deleteReply?.().catch(() => {}), 30000);
        }
        finishInteractionExecution(interaction);
        return sent;
      } catch (err) {
        if (typeof soezyIsInteractionGone === "function" && soezyIsInteractionGone(err)) return null;
        throw err;
      }
    };
  }
  if (original.editReply) {
    interaction.editReply = async payload => {
      try {
        const edited = await original.editReply(stripEphemeralFromPayload(normalizeInteractionPayload(payload)));
        patchMessageEditTarget(edited);
        if (typeof scheduleMenuExpiration === "function") scheduleMenuExpiration(edited, { ownerId: interaction.user?.id, command: interaction.commandName || interaction.customId });
        finishInteractionExecution(interaction);
        return edited;
      } catch (err) {
        if (typeof soezyIsInteractionGone === "function" && soezyIsInteractionGone(err)) return null;
        throw err;
      }
    };
  }
  if (original.followUp) {
    interaction.followUp = async payload => {
      try {
        const sent = await original.followUp(normalizeInteractionPayload(payload));
        patchMessageEditTarget(sent);
        if (typeof scheduleMenuExpiration === "function") scheduleMenuExpiration(sent, { ownerId: interaction.user?.id, command: interaction.commandName || interaction.customId });
        return sent;
      } catch (err) {
        if (typeof soezyIsInteractionGone === "function" && soezyIsInteractionGone(err)) return null;
        throw err;
      }
    };
  }
  if (original.update) {
    interaction.update = async payload => {
      const clean = stripEphemeralFromPayload(normalizeInteractionPayload(payload));
      try {
        const updated = (interaction.deferred || interaction.replied) && original.editReply
          ? await original.editReply(clean)
          : await original.update(clean);
        patchMessageEditTarget(updated);
        if (typeof scheduleMenuExpiration === "function") scheduleMenuExpiration(updated, { ownerId: interaction.user?.id, command: interaction.commandName || interaction.customId });
        return updated;
      } catch (err) {
        if (typeof soezyIsInteractionGone === "function" && soezyIsInteractionGone(err)) return null;
        throw err;
      }
    };
  }
  return interaction;
}

function normalizeInteractionPayload(payload) {
  const coerced = typeof coercePlainReplyPayload === "function" ? coercePlainReplyPayload(payload) : payload;
  return typeof normalizeComponentsV2Payload === "function" ? normalizeComponentsV2Payload(coerced) : coerced;
}

function isMarkedAutoDeletePayload(payload) {
  return !!(
    payload?.components?.some(c => _autoDeletePayloads?.has?.(c)) ||
    payload?.embeds?.some(e => _autoDeletePayloads?.has?.(e))
  );
}

function finishInteractionExecution(interaction) {
  if (!interaction?.__soezyCommandExecutionKey) return;
  endCommandExecution(interaction.__soezyCommandExecutionKey);
  interaction.__soezyCommandExecutionKey = null;
}

async function withRuntimeGuard(label, target, fn, fallbackMessage = "An unexpected error occurred. Please try again.") {
  try {
    return await fn();
  } catch (err) {
    soezyLogger?.error?.("runtime", `${label} failed`, { error: err.message });
    if (typeof recordApiFailure === "function") recordApiFailure(label, err);
    if (target && typeof safeReply === "function") {
      await safeReply(target, {
        components: [createErrorContainer("Something Went Wrong", fallbackMessage)],
        flags: MessageFlags.IsComponentsV2 | 64,
      });
    }
    return null;
  }
}

Object.assign(globalThis, { installInteractionResponseGuards, normalizeInteractionPayload, withRuntimeGuard });

/* ---- Collector/session lifecycle helpers ---- */
const COLLECTOR_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 5 * 60 * 1000;
const activeCollectors = globalThis.__soezyCollectors || (globalThis.__soezyCollectors = new Map());
const collectorSessions = globalThis.__soezyCollectorSessions || (globalThis.__soezyCollectorSessions = new Map());

function resolveCollectorMessageId(keyOrMessage, collector = null, meta = {}) {
  return meta.messageId ||
    meta.message?.id ||
    keyOrMessage?.id ||
    collector?.message?.id ||
    collector?.options?.message?.id ||
    (typeof keyOrMessage === "string" && !keyOrMessage.includes(":") ? keyOrMessage : null);
}

function registerCollectorSession(sessionId, meta = {}) {
  if (!sessionId) return null;
  const now = Date.now();
  const session = {
    sessionId: String(sessionId),
    ownerId: meta.ownerId || meta.userId || null,
    guildId: meta.guildId || null,
    messageId: meta.messageId || null,
    meta,
    createdAt: meta.createdAt || now,
    expiresAt: meta.expiresAt || now + (meta.ttlMs || SESSION_TTL_MS),
  };
  collectorSessions.set(session.sessionId, session);
  return session;
}

function stopRegisteredCollector(entry, reason = "replaced") {
  const collector = entry?.collector || entry;
  try {
    if (collector && !collector.ended) collector.stop?.(reason);
  } catch {}
}

function registerCollector(keyOrMessage, collector, meta = {}) {
  if (!collector) return collector;
  if (collector.__soezyPanelEntry) return collector;
  if (globalThis.soezyPanelManager?.registerCollector && !collector.__soezyPanelEntry) {
    return globalThis.soezyPanelManager.registerCollector(keyOrMessage, collector, meta);
  }
  const now = Date.now();
  const messageId = resolveCollectorMessageId(keyOrMessage, collector, meta);
  const key = String(meta.key || keyOrMessage?.id || keyOrMessage || messageId || `collector:${now}`);
  const guildId = meta.guildId || meta.message?.guildId || meta.message?.guild?.id || collector.message?.guildId || collector.message?.guild?.id || null;
  const sessionId = meta.sessionId || meta.ownerSessionId || null;

  if (messageId) {
    const oldCollector = activeCollectors.get(messageId);
    if (oldCollector && oldCollector !== collector) stopRegisteredCollector(oldCollector, "replaced");
  }
  if (activeCollectors.has(key)) {
    const oldEntry = activeCollectors.get(key);
    if (oldEntry?.collector !== collector) stopRegisteredCollector(oldEntry, "replaced");
  }

  const entry = {
    key,
    collector,
    messageId,
    guildId,
    sessionId,
    ownerId: meta.ownerId || meta.userId || null,
    meta,
    createdAt: now,
    expiresAt: now + (meta.ttlMs || COLLECTOR_TTL_MS),
  };
  collector.__soezyCollectorEntry = entry;

  activeCollectors.set(key, collector);
  if (messageId) activeCollectors.set(messageId, collector);
  if (sessionId) registerCollectorSession(sessionId, { ...meta, guildId, messageId });

  collector.resetTimer?.({ time: meta.timeMs || COLLECTOR_TTL_MS, idle: meta.idleMs || COLLECTOR_TTL_MS });
  collector.on?.("collect", () => {
    collector.resetTimer?.({ time: meta.timeMs || COLLECTOR_TTL_MS, idle: meta.idleMs || COLLECTOR_TTL_MS });
  });

  collector.once?.("end", () => {
    const byKey = activeCollectors.get(key);
    if ((byKey?.__soezyCollectorEntry?.collector || byKey?.collector || byKey) === collector) activeCollectors.delete(key);
    if (messageId) {
      const byMessage = activeCollectors.get(messageId);
      if ((byMessage?.__soezyCollectorEntry?.collector || byMessage?.collector || byMessage) === collector) activeCollectors.delete(messageId);
    }
  });
  return collector;
}

function createManagedCollector(message, options = {}, meta = {}) {
  if (globalThis.soezyPanelManager?.createManagedCollector) {
    return globalThis.soezyPanelManager.createManagedCollector(message, options, meta);
  }
  return null;
}

function cleanupCollectorSessions(now = Date.now()) {
  let removed = 0;
  for (const [sessionId, session] of collectorSessions) {
    if ((session.expiresAt || 0) <= now) {
      collectorSessions.delete(sessionId);
      removed++;
    }
  }
  return removed;
}

function cleanupCollectors(options = {}) {
  if (globalThis.soezyPanelManager?.cleanupPanels) {
    const normalized = typeof options === "string" ? { guildId: options } : options;
    return globalThis.soezyPanelManager.cleanupPanels(normalized || {});
  }
  const now = Date.now();
  const guildId = typeof options === "string" ? options : options.guildId || null;
  const messageId = options.messageId || null;
  const all = options.all === true;
  const reason = options.reason || "cleanup";
  let stopped = 0;
  const seen = new Set();

  for (const [key, value] of [...activeCollectors.entries()]) {
    const entry = value?.__soezyCollectorEntry || value;
    const collector = entry?.collector || value;
    if (!collector) {
      activeCollectors.delete(key);
      continue;
    }
    if (collector.ended || collector._ended) {
      activeCollectors.delete(key);
      continue;
    }
    if (seen.has(collector)) continue;
    const expired = (entry.expiresAt || 0) <= now;
    const guildMatch = guildId && entry.guildId === guildId;
    const messageMatch = messageId && entry.messageId === messageId;
    if (all || guildMatch || messageMatch || expired) {
      seen.add(collector);
      stopRegisteredCollector(value, reason);
      stopped++;
    }
  }

  cleanupCollectorSessions(now);
  if (typeof globalThis.cleanupPanelCollectors === "function") globalThis.cleanupPanelCollectors(now, reason);
  return stopped;
}

function clearCollectors(guildId = null, reason = "cleared") {
  return cleanupCollectors({ guildId, all: !guildId, reason });
}

function validateSessionOwner(sessionId, userId) {
  if (!sessionId || !userId) return false;
  const session = collectorSessions.get(String(sessionId));
  if (session?.ownerId) return session.ownerId === userId;
  return String(sessionId).split("_")[0] === String(userId);
}

if (!globalThis.__soezyCollectorCleanupTimer) {
  globalThis.__soezyCollectorCleanupTimer = setInterval(() => cleanupCollectors({ reason: "expired" }), 5 * 60 * 1000);
  globalThis.__soezyCollectorCleanupTimer.unref?.();
}

Object.assign(globalThis, {
  activeCollectors,
  registerCollector,
  createManagedCollector,
  registerCollectorSession,
  cleanupCollectors,
  clearCollectors,
  cleanupCollectorSessions,
  validateSessionOwner,
});

const interactionManagerApi = {
  safeReply,
  safeEdit,
  safeEditReply,
  safeUpdate,
  safeFollowUp,
  safeDefer,
  safeAutoDefer,
  safeDeferUpdate,
  safeDeferReply: safeDefer,
  scheduleMenuExpiration,
  isExpiredInteraction,
  isInteractionGone,
  coercePlainReplyPayload,
  installInteractionResponseGuards,
  normalizeInteractionPayload,
  withRuntimeGuard,
  activeCollectors,
  registerCollector,
  createManagedCollector,
  registerCollectorSession,
  cleanupCollectors,
  clearCollectors,
  cleanupCollectorSessions,
  validateSessionOwner,
};

Object.assign(globalThis, interactionManagerApi);
Object.assign(globalThis, { soezyInteractionManager: interactionManagerApi });
Object.assign(globalThis, {
  buildSuccessContainer: (...args) => createSuccessContainer(...args),
  buildErrorContainer: (...args) => createErrorContainer(...args),
});
module.exports = interactionManagerApi;
})();
