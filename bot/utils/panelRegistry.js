"use strict";
/* ================= OPEN PANEL REGISTRY COMPAT =================
 * Open panel tracking is unified through utils/panelManager.js.
 */
(() => {
const manager = globalThis.soezyPanelManager;
const OPEN_PANEL_TTL_MS = manager?.DEFAULT_PANEL_DURATION || 5 * 60 * 1000;
const openPanels = manager?.activePanels || globalThis.__soezyPanels || (globalThis.__soezyPanels = new Map());

function inferPanelTypeFromPayload(payload = {}) {
  const text = JSON.stringify(payload.components || []);
  if (/toggle_panel_select|toggle_enable_all|toggle_disable_all/.test(text)) return "toggle";
  if (/antinuke_event_select|antinuke_enable_all|antinuke_disable_all/.test(text)) return "antinuke_events";
  if (/dashboard_select|dashboard_home/.test(text)) return "dashboard";
  if (/help_category_|help_/.test(text)) return "help";
  return null;
}

function inferPanelOwnerFromPayload(payload = {}) {
  const text = JSON.stringify(payload.components || []);
  const matches = [...text.matchAll(/\b\d{17,20}\b/g)].map(match => match[0]);
  return matches[matches.length - 1] || null;
}

function registerOpenPanel(meta = {}) {
  if (!meta.messageId && !meta.message?.id) return null;
  const panelType = meta.panelType || meta.type || inferPanelTypeFromPayload(meta.payload) || "panel";
  if (meta.message && manager?.registerPanel) {
    return manager.registerPanel({
      message: meta.message,
      payload: meta.payload,
      ownerId: meta.userId || inferPanelOwnerFromPayload(meta.payload) || "any",
      command: panelType,
      type: panelType,
      meta,
    });
  }
  const messageId = String(meta.messageId || meta.message?.id);
  const entry = {
    messageId,
    channelId: meta.channelId ? String(meta.channelId) : null,
    guildId: meta.guildId ? String(meta.guildId) : null,
    ownerId: meta.userId && meta.userId !== "any" ? String(meta.userId) : (inferPanelOwnerFromPayload(meta.payload) || "any"),
    userId: meta.userId && meta.userId !== "any" ? String(meta.userId) : (inferPanelOwnerFromPayload(meta.payload) || "any"),
    panelType,
    type: panelType,
    command: panelType,
    client: meta.client || null,
    payload: meta.payload || null,
    updatedAt: Date.now(),
    expiresAt: Date.now() + OPEN_PANEL_TTL_MS,
  };
  openPanels.set(messageId, entry);
  return entry;
}

function unregisterOpenPanel(messageId) {
  return manager?.cleanupPanels?.({ messageId: String(messageId || ""), reason: "unregistered" }) || openPanels.delete(String(messageId || ""));
}

function cleanupOpenPanels(now = Date.now()) {
  return manager?.cleanupPanels?.({ reason: "expired" }) || 0;
}

function buildPanelPayload(entry) {
  const panelType = entry.panelType || entry.type || entry.command;
  if (panelType === "toggle" && typeof buildTogglePanel === "function") {
    const { container, components = [] } = buildTogglePanel(entry.guildId, entry.ownerId || entry.userId);
    return { components: [container, ...components], flags: MessageFlags.IsComponentsV2 };
  }
  if (panelType === "antinuke_events" && typeof buildAntiNukeEventsMessage === "function") {
    return buildAntiNukeEventsMessage(entry.guildId);
  }
  if (panelType === "dashboard" && typeof buildDashboard === "function") {
    const guild = entry.client?.guilds?.cache?.get(entry.guildId) || null;
    const { container, components = [] } = buildDashboard(guild, entry.guildId, entry.ownerId || entry.userId);
    return { components: [container, ...components], flags: MessageFlags.IsComponentsV2 };
  }
  return null;
}

async function refreshOpenPanels(filter = {}) {
  cleanupOpenPanels();
  const guildId = filter.guildId ? String(filter.guildId) : null;
  const panelType = filter.panelType || filter.type || null;
  let refreshed = 0;

  for (const [messageId, entry] of [...openPanels.entries()]) {
    if (guildId && String(entry.guildId || "") !== guildId) continue;
    const entryType = entry.panelType || entry.type || entry.command;
    if (panelType && entryType !== panelType) continue;
    const clientRef = filter.client || entry.client || globalThis.client;
    const channel = entry.channelId ? await clientRef?.channels?.fetch?.(entry.channelId).catch(() => null) : null;
    const message = entry.message || (channel ? await channel.messages?.fetch?.(messageId).catch(() => null) : null);
    if (!message?.edit) {
      openPanels.delete(messageId);
      continue;
    }
    const payload = buildPanelPayload(entry);
    if (!payload) continue;
    const edited = await message.edit(payload).catch(() => null);
    if (edited) {
      manager?.registerPanel?.({
        message: edited,
        payload,
        ownerId: entry.ownerId || entry.userId,
        command: entryType,
        type: entryType,
        meta: entry.meta || {},
      });
      refreshed++;
    } else {
      openPanels.delete(messageId);
    }
  }
  return refreshed;
}

const api = { openPanels, registerOpenPanel, unregisterOpenPanel, cleanupOpenPanels, refreshOpenPanels, inferPanelTypeFromPayload, inferPanelOwnerFromPayload };
globalThis.soezyPanelRegistry = api;
Object.assign(globalThis, api);
module.exports = api;
})();
