"use strict";
/* ================= GLOBAL PANEL MANAGER =================
 * Owns interactive panel lifetime, expiry edits, and collector replacement.
 * Older collector/session helpers delegate here so panel expiry does not stack.
 */
(() => {
const DEFAULT_PANEL_DURATION = 5 * 60 * 1000;
const EXPIRED_FOOTER = "Panel expired \u2022 Run command again to reopen.";
const EXPIRED_PLACEHOLDER = "Panel expired \u2022 Run command again";
const SELECT_MENU_TYPES = new Set([3, 5, 6, 7, 8]);
const BUTTON_TYPE = 2;
const TEXT_DISPLAY_TYPE = 10;
const CONTAINER_TYPE = 17;

const panels = globalThis.__soezyPanels || (globalThis.__soezyPanels = new Map());
const panelsByCommand = globalThis.__soezyPanelsByCommand || (globalThis.__soezyPanelsByCommand = new Map());
const expiredPanels = globalThis.__soezyExpiredPanels || (globalThis.__soezyExpiredPanels = new Map());
const panelSessions = globalThis.__soezyPanelSessions || (globalThis.__soezyPanelSessions = new Map());
const activeCollectors = globalThis.__soezyCollectors || (globalThis.__soezyCollectors = new Map());

function now() {
  return Date.now();
}

function asId(value, fallback = null) {
  const text = value == null ? "" : String(value);
  return text || fallback;
}

function rawComponent(component) {
  if (!component) return component;
  try {
    if (typeof component.toJSON === "function") return component.toJSON();
  } catch {}
  try {
    return JSON.parse(JSON.stringify(component));
  } catch {
    return { ...component };
  }
}

function rawComponents(components = []) {
  return (Array.isArray(components) ? components : [components]).filter(Boolean).map(rawComponent);
}

function rawEmbed(embed) {
  try {
    if (typeof embed?.toJSON === "function") return embed.toJSON();
  } catch {}
  try {
    return JSON.parse(JSON.stringify(embed));
  } catch {
    return { ...embed };
  }
}

function componentHasInteractive(component) {
  const raw = rawComponent(component);
  if (!raw) return false;
  if (raw.type === BUTTON_TYPE || SELECT_MENU_TYPES.has(raw.type)) return true;
  if (Array.isArray(raw.components) && raw.components.some(componentHasInteractive)) return true;
  if (raw.accessory && componentHasInteractive(raw.accessory)) return true;
  return false;
}

function payloadHasInteractive(payload = {}) {
  return rawComponents(payload.components || []).some(componentHasInteractive);
}

function messageHasInteractive(message) {
  return Array.isArray(message?.components) && message.components.some(componentHasInteractive);
}

function isPersistentTicketPanel(messageOrComponents) {
  const components = Array.isArray(messageOrComponents)
    ? messageOrComponents
    : messageOrComponents?.components;
  const pending = rawComponents(components || []);
  while (pending.length) {
    const component = pending.pop();
    if (!component) continue;
    if (component.custom_id === "create_ticket" || component.customId === "create_ticket") return true;
    if (Array.isArray(component.components)) pending.push(...component.components);
    if (component.accessory) pending.push(component.accessory);
  }
  return false;
}

function disableComponent(component) {
  const raw = rawComponent(component);
  if (!raw) return raw;
  if (Array.isArray(raw.components)) raw.components = raw.components.map(disableComponent);
  if (raw.accessory) raw.accessory = disableComponent(raw.accessory);
  if (raw.type === BUTTON_TYPE || SELECT_MENU_TYPES.has(raw.type)) raw.disabled = true;
  if (SELECT_MENU_TYPES.has(raw.type)) raw.placeholder = EXPIRED_PLACEHOLDER;
  return raw;
}

function walkComponents(components, visit) {
  for (const component of components || []) {
    if (!component) continue;
    visit(component);
    if (Array.isArray(component.components)) walkComponents(component.components, visit);
    if (component.accessory) walkComponents([component.accessory], visit);
  }
}

function addExpiredFooterToComponents(components = []) {
  const next = rawComponents(components);
  let hasFooter = false;
  let lastText = null;
  walkComponents(next, component => {
    if (component.type === TEXT_DISPLAY_TYPE && typeof component.content === "string") {
      if (component.content.includes(EXPIRED_FOOTER)) hasFooter = true;
      lastText = component;
    }
  });
  if (hasFooter) return next;
  if (lastText && String(lastText.content || "").trim().startsWith("-#")) {
    lastText.content = `-# ${EXPIRED_FOOTER}`;
    return next;
  }
  const firstContainer = next.find(component => component?.type === CONTAINER_TYPE && Array.isArray(component.components));
  if (firstContainer) {
    firstContainer.components.push({ type: TEXT_DISPLAY_TYPE, content: `-# ${EXPIRED_FOOTER}` });
  }
  return next;
}

function addExpiredFooterToEmbeds(embeds = []) {
  return (Array.isArray(embeds) ? embeds : []).map(embed => {
    const raw = rawEmbed(embed);
    raw.footer = { ...(raw.footer || {}), text: EXPIRED_FOOTER };
    return raw;
  });
}

function messageFlags(message) {
  return Number(message?.flags?.bitfield ?? message?.flags ?? 0);
}

function isComponentsV2(message, payload = {}) {
  const v2Flag = globalThis.MessageFlags?.IsComponentsV2 || 0;
  return Boolean((messageFlags(message) | Number(payload.flags || 0)) & v2Flag);
}

function getMessageFromInteraction(interaction) {
  return interaction?.message || null;
}

function inferOwnerIdFromText(text, preferred = null) {
  if (preferred && preferred !== "any") return String(preferred);
  const matches = [...String(text || "").matchAll(/\b\d{17,20}\b/g)].map(match => match[0]);
  if (!matches.length) return "any";
  return matches[matches.length - 1] || "any";
}

function inferCommandFromText(text, fallback = "panel") {
  const raw = String(text || "");
  if (/help_/.test(raw)) return "help";
  if (/dashboard_/.test(raw)) return "dashboard";
  if (/toggle_panel|toggle_enable|toggle_disable/.test(raw)) return "dashboard";
  if (/remainingsetup_|whitelistsetup_|securitywarn_/.test(raw)) return "setup";
  if (/ancfg_|anmod_|antinuke/.test(raw)) return "antinuke";
  if (/amcfg_|ammod_|automod/.test(raw)) return "automod";
  if (/alcfg_|almod_|antilink/.test(raw)) return "antilink";
  if (/abcfg_|abmod_|antibot/.test(raw)) return "antibot";
  if (/secfg_|secmod_|security/.test(raw)) return "security";
  if (/wcfg_|wnmod_|welcome/.test(raw)) return "welcome";
  if (/tkcfg_|ticket/.test(raw)) return "ticket";
  if (/ajcfg_|ajmod_|autojail/.test(raw)) return "autojail";
  if (/stcfg_|sticky/.test(raw)) return "sticky";
  if (/music_/.test(raw)) return "music";
  const customId = raw.match(/"custom_id"\s*:\s*"([^"]+)"/)?.[1] || raw.match(/customId["']?\s*[:=]\s*["']([^"']+)/)?.[1];
  return customId ? customId.split("_")[0] || fallback : fallback;
}

function panelCommandKey({ guildId, ownerId, command, type } = {}) {
  const owner = ownerId && ownerId !== "any" ? String(ownerId) : null;
  if (!owner) return null;
  return `${guildId || "global"}:${owner}:${command || type || "panel"}`;
}

function stopCollector(collector, reason = "replaced") {
  try {
    if (collector && !collector.ended) collector.stop?.(reason);
  } catch {}
}

function unregisterPanel(messageId, reason = "cleanup") {
  const id = asId(messageId);
  if (!id) return false;
  const entry = panels.get(id);
  if (!entry) return false;
  if (entry.timer) clearTimeout(entry.timer);
  if (entry.commandKey && panelsByCommand.get(entry.commandKey) === id) panelsByCommand.delete(entry.commandKey);
  if (activeCollectors.get(id) === entry.collector) activeCollectors.delete(id);
  if (entry.key && activeCollectors.get(entry.key) === entry.collector) activeCollectors.delete(entry.key);
  panels.delete(id);
  if (reason !== "expired") expiredPanels.delete(id);
  return true;
}

async function replyExpired(interaction) {
  if (!interaction || interaction.__soezyPanelExpiredHandled) return true;
  interaction.__soezyPanelExpired = true;
  interaction.__soezyPanelExpiredHandled = true;
  const payload = {
    components: [typeof createWarningContainer === "function"
      ? createWarningContainer("Panel Expired", "Run the command again to reopen this panel.")
      : new ContainerBuilder().addTextDisplayComponents(t => t.setContent("### \u26a0\ufe0f Panel Expired\n\nRun the command again to reopen this panel."))],
    flags: (globalThis.MessageFlags?.IsComponentsV2 || 0) | 64,
  };
  try {
    if (typeof safeReply === "function") {
      await safeReply(interaction, payload);
    } else if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(payload).catch(() => null);
    }
  } catch {}
  return true;
}

function isPanelInteractionExpired(interaction) {
  const messageId = interaction?.message?.id;
  if (!messageId) return false;
  if (isPersistentTicketPanel(interaction.message)) return false;
  if (expiredPanels.has(messageId)) return true;
  const entry = panels.get(messageId);
  return Boolean(entry && entry.expiresAt <= now());
}

async function handleExpiredPanelInteraction(interaction) {
  if (!interaction?.isMessageComponent?.()) return false;
  if (!isPanelInteractionExpired(interaction)) return false;
  await replyExpired(interaction);
  return true;
}

async function expirePanel(messageOrId, reason = "expired") {
  const messageId = typeof messageOrId === "string" ? messageOrId : messageOrId?.id;
  const entry = panels.get(String(messageId || ""));
  const message = typeof messageOrId === "string" ? entry?.message : (messageOrId || entry?.message);
  // Ticket-open panels are public, persistent controls. Never disable them as a
  // temporary menu, including panels registered before this safeguard existed.
  if (isPersistentTicketPanel(message || entry?.components)) {
    unregisterPanel(messageId, "persistent_ticket_panel");
    return false;
  }
  if (entry && !entry.expireHookRan) {
    entry.expireHookRan = true;
    try { entry.meta?.onExpire?.(entry, reason); } catch {}
  }
  if (!message?.edit) {
    unregisterPanel(messageId, "expired");
    if (messageId) expiredPanels.set(String(messageId), { messageId: String(messageId), expiredAt: now(), reason });
    return false;
  }

  const disabledComponents = addExpiredFooterToComponents((message.components || entry?.components || []).map(disableComponent));
  const payload = {};
  if (disabledComponents.length) payload.components = disabledComponents;
  if (Array.isArray(message.embeds) && message.embeds.length) payload.embeds = addExpiredFooterToEmbeds(message.embeds);
  if (isComponentsV2(message, entry?.payload)) payload.flags = messageFlags(message) || globalThis.MessageFlags?.IsComponentsV2;
  if (!payload.components && !payload.embeds) {
    unregisterPanel(message.id, "expired");
    return false;
  }

  await message.edit(payload).catch(() => null);
  expiredPanels.set(String(message.id), { messageId: String(message.id), expiredAt: now(), reason });
  unregisterPanel(message.id, "expired");
  return true;
}

function cleanupExpiredPanelCache(limitMs = 30 * 60 * 1000) {
  const cutoff = now() - limitMs;
  for (const [messageId, entry] of [...expiredPanels.entries()]) {
    if ((entry.expiredAt || 0) <= cutoff) expiredPanels.delete(messageId);
  }
}

function adoptCollector({ message, collector, interaction = null, ownerId = null, command = null, type = "panel", duration = DEFAULT_PANEL_DURATION, key = null, payload = null, components = null, manual = false, meta = {} } = {}) {
  if (!message?.id || !collector) return collector;
  const messageId = String(message.id);
  const payloadText = JSON.stringify(payload?.components || components || message.components || []);
  const resolvedOwner = ownerId || meta.ownerId || meta.userId || interaction?.user?.id || inferOwnerIdFromText(payloadText, null);
  const resolvedCommand = command || meta.command || meta.kind || inferCommandFromText(payloadText, type);
  const commandKey = panelCommandKey({ guildId: message.guildId || message.guild?.id || interaction?.guildId, ownerId: resolvedOwner, command: resolvedCommand, type });
  const existingForMessage = panels.get(messageId);
  if (existingForMessage?.collector && existingForMessage.collector !== collector) stopCollector(existingForMessage.collector, "replaced");
  if (commandKey) {
    const previousMessageId = panelsByCommand.get(commandKey);
    if (previousMessageId && previousMessageId !== messageId) {
      const previous = panels.get(previousMessageId);
      if (previous) {
        stopCollector(previous.collector, "replaced");
        expirePanel(previous.message || previousMessageId, "replaced").catch(() => null);
      }
    }
    panelsByCommand.set(commandKey, messageId);
  }

  const entry = {
    key: key || meta.key || messageId,
    message,
    collector,
    messageId,
    channelId: message.channelId || message.channel?.id || null,
    guildId: message.guildId || message.guild?.id || interaction?.guildId || null,
    ownerId: resolvedOwner || "any",
    command: resolvedCommand,
    type,
    commandKey,
    manual,
    payload,
    components: rawComponents(components || payload?.components || message.components || []),
    createdAt: now(),
    expiresAt: now() + DEFAULT_PANEL_DURATION,
    meta,
  };

  panels.set(messageId, entry);
  activeCollectors.set(messageId, collector);
  if (entry.key) activeCollectors.set(entry.key, collector);
  collector.__soezyPanelEntry = entry;
  collector.__soezyCollectorEntry = { ...(collector.__soezyCollectorEntry || {}), ...entry };
  collector.resetTimer?.({ time: DEFAULT_PANEL_DURATION, idle: DEFAULT_PANEL_DURATION });
  collector.once?.("end", (_collected, endReason) => {
    const current = panels.get(messageId);
    if (current?.collector !== collector) return;
    if (["time", "idle", "expired"].includes(String(endReason || ""))) {
      expirePanel(message, "expired").catch(() => null);
    } else {
      unregisterPanel(messageId, endReason || "ended");
    }
  });
  return collector;
}

function getOriginalCollectorFactory(message) {
  if (message?.__soezyOriginalCreateMessageComponentCollector) return message.__soezyOriginalCreateMessageComponentCollector.bind(message);
  const MessageClass = (() => { try { return require("discord.js").Message; } catch { return null; } })();
  const original = MessageClass?.prototype?.__soezyOriginalCreateMessageComponentCollector || MessageClass?.prototype?.createMessageComponentCollector;
  return original ? original.bind(message) : null;
}

function createPanel({ message, interaction = null, components = null, ownerId = null, duration = DEFAULT_PANEL_DURATION, command = null, type = "panel", filter = null, payload = null, meta = {} } = {}) {
  const targetMessage = message || getMessageFromInteraction(interaction);
  if (!targetMessage?.id) return null;
  const sourceComponents = components || payload?.components || targetMessage.components || [];
  if (!rawComponents(sourceComponents).some(componentHasInteractive)) {
    return null;
  }
  const factory = getOriginalCollectorFactory(targetMessage);
  if (!factory) return null;
  const resolvedOwner = ownerId || meta.ownerId || meta.userId || interaction?.user?.id || inferOwnerIdFromText(JSON.stringify(sourceComponents), null);
  const wrappedFilter = async componentInteraction => {
    if (await handleExpiredPanelInteraction(componentInteraction)) return false;
    return typeof filter === "function" ? filter(componentInteraction) : true;
  };
  const collector = factory({
    time: DEFAULT_PANEL_DURATION,
    idle: DEFAULT_PANEL_DURATION,
    filter: wrappedFilter,
  });
  return adoptCollector({
    message: targetMessage,
    collector,
    interaction,
    ownerId: resolvedOwner,
    command,
    type,
    duration: DEFAULT_PANEL_DURATION,
    payload,
    components: sourceComponents,
    manual: false,
    meta,
  });
}

function registerPanel({ message, interaction = null, payload = null, ownerId = null, command = null, type = "panel", duration = DEFAULT_PANEL_DURATION, meta = {} } = {}) {
  const targetMessage = message || getMessageFromInteraction(interaction);
  if (!targetMessage?.id) return null;
  const existing = panels.get(String(targetMessage.id));
  if (existing) {
    existing.message = targetMessage;
    existing.payload = payload || existing.payload;
    existing.components = rawComponents(payload?.components || targetMessage.components || existing.components || []);
    existing.expiresAt = now() + DEFAULT_PANEL_DURATION;
    existing.collector?.resetTimer?.({ time: DEFAULT_PANEL_DURATION, idle: DEFAULT_PANEL_DURATION });
    return existing;
  }
  return createPanel({ message: targetMessage, interaction, ownerId, command, type, duration, payload, meta });
}

function createManagedCollector(message, options = {}, meta = {}) {
  if (!message?.id) return null;
  const factory = getOriginalCollectorFactory(message);
  if (!factory) return null;
  const originalFilter = options.filter;
  const ownerId = meta.ownerId || meta.userId || options.ownerId || inferOwnerIdFromText(JSON.stringify(message.components || []), null);
  const wrappedFilter = async interaction => {
    if (await handleExpiredPanelInteraction(interaction)) return false;
    if (typeof originalFilter === "function") return originalFilter(interaction);
    return true;
  };
  const collector = factory({ ...options, time: DEFAULT_PANEL_DURATION, idle: DEFAULT_PANEL_DURATION, filter: wrappedFilter });
  return adoptCollector({ message, collector, ownerId, command: meta.command || meta.kind, type: meta.type || "panel", manual: true, meta });
}

function registerCollector(keyOrMessage, collector, meta = {}) {
  if (!collector) return collector;
  const message = meta.message || keyOrMessage?.id && keyOrMessage || collector.message || null;
  if (!message?.id) return collector;
  return adoptCollector({
    message,
    collector,
    ownerId: meta.ownerId || meta.userId,
    command: meta.command || meta.kind || (typeof keyOrMessage === "string" ? keyOrMessage.split(":")[0] : null),
    type: meta.type || meta.kind || "panel",
    key: typeof keyOrMessage === "string" ? keyOrMessage : message.id,
    manual: true,
    meta,
  });
}

function cleanupPanels(options = {}) {
  const current = now();
  const all = options.all === true;
  const guildId = options.guildId ? String(options.guildId) : null;
  const messageId = options.messageId ? String(options.messageId) : null;
  const reason = options.reason || "cleanup";
  let count = 0;
  for (const [id, entry] of [...panels.entries()]) {
    const expired = (entry.expiresAt || 0) <= current;
    const guildMatch = guildId && String(entry.guildId || "") === guildId;
    const messageMatch = messageId && id === messageId;
    if (all || expired || guildMatch || messageMatch) {
      stopCollector(entry.collector, reason);
      if (expired) expirePanel(entry.message || id, "expired").catch(() => null);
      else unregisterPanel(id, reason);
      count++;
    }
  }
  for (const [sessionId, session] of [...panelSessions.entries()]) {
    if ((session.expiresAt || 0) <= current || all) {
      try { session.meta?.onExpire?.(session, reason); } catch {}
      panelSessions.delete(sessionId);
    }
  }
  cleanupExpiredPanelCache();
  return count;
}

function registerPanelSession(sessionId, meta = {}) {
  if (!sessionId) return null;
  const session = {
    sessionId: String(sessionId),
    ownerId: meta.ownerId || meta.userId || null,
    guildId: meta.guildId || null,
    messageId: meta.messageId || null,
    meta,
    createdAt: meta.createdAt || now(),
    expiresAt: now() + DEFAULT_PANEL_DURATION,
  };
  panelSessions.set(session.sessionId, session);
  return session;
}

function validateSessionOwner(sessionId, userId) {
  if (!sessionId || !userId) return false;
  const session = panelSessions.get(String(sessionId));
  if (session?.ownerId) return String(session.ownerId) === String(userId);
  return String(sessionId).split("_")[0] === String(userId);
}

function installCollectorPatch() {
  let MessageClass = null;
  try { MessageClass = require("discord.js").Message; } catch {}
  const proto = MessageClass?.prototype;
  if (!proto?.createMessageComponentCollector || proto.__soezyPanelManagerPatched) return;
  proto.__soezyPanelManagerPatched = true;
  proto.__soezyOriginalCreateMessageComponentCollector = proto.createMessageComponentCollector;
  proto.createMessageComponentCollector = function patchedCreateMessageComponentCollector(options = {}) {
    const originalFilter = options.filter;
    const ownerId = options.ownerId || options.userId || inferOwnerIdFromText(JSON.stringify(this.components || []), null);
    const wrappedFilter = async interaction => {
      if (await handleExpiredPanelInteraction(interaction)) return false;
      if (typeof originalFilter === "function") return originalFilter(interaction);
      return true;
    };
    const collector = proto.__soezyOriginalCreateMessageComponentCollector.call(this, {
      ...options,
      time: DEFAULT_PANEL_DURATION,
      idle: DEFAULT_PANEL_DURATION,
      filter: wrappedFilter,
    });
    return adoptCollector({
      message: this,
      collector,
      ownerId,
      command: options.command || options.kind,
      type: options.type || "panel",
      manual: true,
      meta: options.meta || {},
    });
  };
}

installCollectorPatch();

if (!globalThis.__soezyPanelCleanupTimer) {
  globalThis.__soezyPanelCleanupTimer = setInterval(() => cleanupPanels({ reason: "expired" }), DEFAULT_PANEL_DURATION);
  globalThis.__soezyPanelCleanupTimer.unref?.();
}

const api = {
  DEFAULT_PANEL_DURATION,
  EXPIRED_FOOTER,
  panels,
  activePanels: panels,
  expiredPanels,
  panelSessions,
  createPanel,
  registerPanel,
  adoptCollector,
  registerCollector,
  createManagedCollector,
  registerPanelSession,
  cleanupPanels,
  cleanupCollectors: cleanupPanels,
  clearPanels: (guildId = null, reason = "cleared") => cleanupPanels({ guildId, all: !guildId, reason }),
  expirePanel,
  expireMenu: expirePanel,
  isPanelInteractionExpired,
  handleExpiredPanelInteraction,
  validateSessionOwner,
  messageHasInteractive,
  isPersistentTicketPanel,
  payloadHasInteractive,
  disableComponent,
};

globalThis.soezyPanelManager = api;
Object.assign(globalThis, {
  createPanel,
  registerManagedPanel: registerPanel,
  registerPanel,
  expirePanel,
  expireMenu: expirePanel,
  cleanupPanels,
  isPanelInteractionExpired,
  handleExpiredPanelInteraction,
});

module.exports = api;
})();
