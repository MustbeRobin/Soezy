"use strict";
/* ================= PANEL SESSION COMPAT =================
 * Session expiry is owned by utils/panelManager.js.
 */
(() => {
const manager = globalThis.soezyPanelManager;
const panelSessions = manager?.panelSessions || globalThis.__soezyPanelSessions || (globalThis.__soezyPanelSessions = new Map());
const TTL_MS = manager?.DEFAULT_PANEL_DURATION || 5 * 60 * 1000;

function panelSessionKey(type, messageId, userId = "any") {
  return `${type || "panel"}:${messageId || "unknown"}:${userId || "any"}`;
}

function upsertPanelSession({ type = "panel", messageId, guildId, userId, ttlMs = TTL_MS, meta = {} } = {}) {
  const key = panelSessionKey(type, messageId, userId);
  const session = {
    key,
    type,
    messageId,
    guildId,
    userId,
    meta,
    updatedAt: Date.now(),
    expiresAt: Date.now() + TTL_MS,
  };
  panelSessions.set(key, session);
  return session;
}

function touchPanelSession(type, messageId, userId = "any", ttlMs = TTL_MS) {
  const key = panelSessionKey(type, messageId, userId);
  const session = panelSessions.get(key);
  if (!session) return null;
  session.updatedAt = Date.now();
  session.expiresAt = Date.now() + TTL_MS;
  return session;
}

function expirePanelSessions(now = Date.now()) {
  let removed = 0;
  for (const [key, session] of [...panelSessions.entries()]) {
    if ((session.expiresAt || 0) <= now) {
      panelSessions.delete(key);
      removed++;
    }
  }
  return removed;
}

const api = { panelSessions, panelSessionKey, upsertPanelSession, touchPanelSession, expirePanelSessions };
globalThis.soezyPanelSessionManager = api;
Object.assign(globalThis, api);
module.exports = api;
})();
