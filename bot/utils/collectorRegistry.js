"use strict";
/* ================= COLLECTOR REGISTRY COMPAT =================
 * Delegates to utils/panelManager.js. Kept for older call sites only.
 */
(() => {
const manager = globalThis.soezyPanelManager;
const collectorRegistry = manager?.activePanels || globalThis.__soezyPanels || (globalThis.__soezyPanels = new Map());

function collectorKey({ messageId, userId = "any", type = "panel" } = {}) {
  return `${messageId || "unknown"}:${userId || "any"}:${type || "panel"}`;
}

function stopPanelCollector(keyOrMeta, reason = "replaced") {
  const messageId = typeof keyOrMeta === "string" ? keyOrMeta : keyOrMeta?.messageId;
  return manager?.cleanupPanels?.({ messageId, reason }) || 0;
}

function registerPanelCollector(meta = {}, collector) {
  if (!collector) return collector;
  return manager?.adoptCollector?.({
    message: meta.message || collector.message,
    collector,
    ownerId: meta.ownerId || meta.userId,
    command: meta.command || meta.type,
    type: meta.type || "panel",
    meta,
  }) || collector;
}

function cleanupPanelCollectors(now = Date.now(), reason = "expired") {
  return manager?.cleanupPanels?.({ reason }) || 0;
}

const api = { collectorRegistry, collectorKey, registerPanelCollector, stopPanelCollector, cleanupPanelCollectors };
globalThis.soezyCollectorRegistry2 = api;
Object.assign(globalThis, api);
module.exports = api;
})();
