/* ================= TRIGGER MANAGER ================= */
(() => {
const TRIGGER_RUNTIME = globalThis.__soezyTriggerRuntime || (globalThis.__soezyTriggerRuntime = new Map());

function normalizeTrigger(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function ensureTriggerStore(guildId, type) {
  const g = guildData(guildId);
  if (type === "autoresponder") {
    if (!g.autoresponder) g.autoresponder = { enabled: true, triggers: {} };
    if (!g.autoresponder.triggers) g.autoresponder.triggers = {};
    if (!g.globalAutoResponders) g.globalAutoResponders = {};
    return g.autoresponder.triggers;
  }
  if (!g.autoreact) g.autoreact = { enabled: true, triggers: {} };
  if (!g.autoreact.triggers) g.autoreact.triggers = {};
  if (!g.autoReact) g.autoReact = {};
  if (!g.autoReact[guildId]) g.autoReact[guildId] = {};
  return g.autoreact.triggers;
}

function validEmoji(emoji) {
  const value = String(emoji || "").trim();
  return /^<a?:[A-Za-z0-9_]{2,32}:\d{17,20}>$/.test(value) ||
    /^\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*$/u.test(value);
}

function refreshRuntime(guildId, type = "all") {
  const g = guildData(guildId);
  if (type === "all" || type === "autoresponder") {
    const merged = { ...(g.globalAutoResponders || {}), ...(g.autoresponder?.triggers || {}) };
    const responders = Object.entries(merged)
      .map(([trigger, data]) => ({ trigger: data?.trigger || trigger, ...data, guildId, normalizedTrigger: normalizeTrigger(data?.trigger || trigger) }))
      .filter(x => x.normalizedTrigger)
      .sort((a, b) => b.normalizedTrigger.length - a.normalizedTrigger.length);
    TRIGGER_RUNTIME.set(`${guildId}:autoresponder`, responders);
    if (typeof globalAutoResponders !== "undefined") {
      for (const key of [...globalAutoResponders.keys()]) {
        if (key.startsWith(`${guildId}:`) || globalAutoResponders.get(key)?.guildId === guildId) globalAutoResponders.delete(key);
      }
      for (const item of responders) globalAutoResponders.set(`${guildId}:${item.normalizedTrigger}`, item);
    }
  }
  if (type === "all" || type === "autoreact") {
    const merged = { ...(g.autoReact?.[guildId] || {}), ...(g.autoreact?.triggers || {}) };
    const reacts = Object.entries(merged)
      .map(([trigger, data]) => ({ trigger: data?.trigger || trigger, ...data, guildId, normalizedTrigger: normalizeTrigger(data?.trigger || trigger) }))
      .filter(x => x.normalizedTrigger)
      .sort((a, b) => b.normalizedTrigger.length - a.normalizedTrigger.length);
    TRIGGER_RUNTIME.set(`${guildId}:autoreact`, reacts);
  }
  return true;
}

function listTriggers(guildId, type, options = {}) {
  refreshRuntime(guildId, type);
  return (TRIGGER_RUNTIME.get(`${guildId}:${type}`) || []).filter(x => options.includeDisabled || x.enabled !== false);
}

function addTrigger(guildId, type, trigger, payload = {}, userId = null) {
  const key = normalizeTrigger(trigger);
  if (!key) return { error: "missing_fields" };
  const existing = listTriggers(guildId, type, { includeDisabled: true });
  if (existing.some(x => x.normalizedTrigger === key)) return { error: "duplicate_trigger", trigger: key };

  if (type === "autoresponder") {
    const response = String(payload.response || "").trim();
    if (!response) return { error: "missing_fields" };
    if (existing.some(x => String(x.response || "").trim().toLowerCase() === response.toLowerCase())) return { error: "duplicate_response" };
    const data = { trigger: String(trigger).trim(), response, reactions: [...new Set(payload.reactions || [])], guildId, createdBy: userId, createdAt: Date.now(), usageCount: 0, enabled: true };
    const g = guildData(guildId);
    ensureTriggerStore(guildId, type)[key] = data;
    g.globalAutoResponders[key] = data;
    saveDB();
    refreshRuntime(guildId, type);
    return data;
  }

  const emojis = [...new Set((payload.emojis || []).map(e => String(e).trim()).filter(Boolean))];
  const invalid = emojis.filter(e => !validEmoji(e));
  if (!emojis.length) return { error: "missing_fields" };
  if (invalid.length) return { error: "invalid_emoji", invalid };
  const data = { trigger: String(trigger).trim(), emojis, guildId, createdBy: userId, createdAt: Date.now(), enabled: true };
  const g = guildData(guildId);
  ensureTriggerStore(guildId, type)[key] = data;
  g.autoReact[guildId][key] = data;
  saveDB();
  refreshRuntime(guildId, type);
  return data;
}

function removeTrigger(guildId, type, trigger) {
  const key = normalizeTrigger(trigger);
  const g = guildData(guildId);
  let existed = false;
  if (type === "autoresponder") {
    existed = Boolean(g.autoresponder?.triggers?.[key] || g.globalAutoResponders?.[key]);
    if (g.autoresponder?.triggers) delete g.autoresponder.triggers[key];
    if (g.globalAutoResponders) delete g.globalAutoResponders[key];
  } else {
    existed = Boolean(g.autoreact?.triggers?.[key] || g.autoReact?.[guildId]?.[key]);
    if (g.autoreact?.triggers) delete g.autoreact.triggers[key];
    if (g.autoReact?.[guildId]) delete g.autoReact[guildId][key];
  }
  if (existed) {
    saveDB();
    refreshRuntime(guildId, type);
  }
  return existed;
}

function editTrigger(guildId, type, oldTrigger, nextTrigger, payload = {}, userId = null) {
  const oldKey = normalizeTrigger(oldTrigger);
  const current = listTriggers(guildId, type, { includeDisabled: true }).find(x => x.normalizedTrigger === oldKey);
  if (!current) return { error: "not_found" };
  const nextKey = normalizeTrigger(nextTrigger || oldTrigger);
  const all = listTriggers(guildId, type, { includeDisabled: true });
  if (nextKey !== oldKey && all.some(x => x.normalizedTrigger === nextKey)) return { error: "duplicate_trigger" };
  removeTrigger(guildId, type, oldKey);
  const result = type === "autoresponder"
    ? addTrigger(guildId, type, nextTrigger || oldTrigger, { response: payload.response ?? current.response, reactions: payload.reactions ?? current.reactions }, userId)
    : addTrigger(guildId, type, nextTrigger || oldTrigger, { emojis: payload.emojis ?? current.emojis }, userId);
  if (!result.error) {
    result.updatedBy = userId;
    result.updatedAt = Date.now();
    refreshRuntime(guildId, type);
  }
  return result;
}

function matchTriggers(guildId, type, content) {
  const lower = normalizeTrigger(content);
  return listTriggers(guildId, type)
    .find(x => x.normalizedTrigger && (lower === x.normalizedTrigger || lower.includes(x.normalizedTrigger))) || null;
}

Object.assign(globalThis, {
  normalizeTrigger,
  addTrigger,
  removeTrigger,
  editTrigger,
  refreshRuntime,
  matchTriggers,
  validEmoji,
  listTriggerRuntime: listTriggers,
  addAutoResponder: (guildId, trigger, response, reactions = [], userId) => addTrigger(guildId, "autoresponder", trigger, { response, reactions }, userId),
  removeAutoResponder: (guildId, trigger) => removeTrigger(guildId, "autoresponder", trigger),
  editAutoResponder: (guildId, oldTrigger, newTrigger, response, userId) => editTrigger(guildId, "autoresponder", oldTrigger, newTrigger, { response }, userId),
  listAutoResponders: (guildId, options = {}) => listTriggers(guildId, "autoresponder", options),
  clearAutoResponders: (guildId) => {
    const count = listTriggers(guildId, "autoresponder", { includeDisabled: true }).length;
    const g = guildData(guildId);
    g.globalAutoResponders = {};
    ensureTriggerStore(guildId, "autoresponder");
    g.autoresponder.triggers = {};
    saveDB();
    refreshRuntime(guildId, "autoresponder");
    return count;
  },
  addAutoReact: (guildId, trigger, emojis, userId) => addTrigger(guildId, "autoreact", trigger, { emojis }, userId),
  removeAutoReact: (guildId, trigger) => removeTrigger(guildId, "autoreact", trigger),
  editAutoReact: (guildId, oldTrigger, newTrigger, emojis, userId) => editTrigger(guildId, "autoreact", oldTrigger, newTrigger, { emojis }, userId),
  listAutoReacts: (guildId, options = {}) => listTriggers(guildId, "autoreact", options),
  clearAutoReacts: (guildId) => {
    const count = listTriggers(guildId, "autoreact", { includeDisabled: true }).length;
    const g = guildData(guildId);
    if (!g.autoReact) g.autoReact = {};
    g.autoReact[guildId] = {};
    ensureTriggerStore(guildId, "autoreact");
    g.autoreact.triggers = {};
    saveDB();
    refreshRuntime(guildId, "autoreact");
    return count;
  },
});

module.exports = { normalizeTrigger, addTrigger, removeTrigger, editTrigger, refreshRuntime, matchTriggers, validEmoji, listTriggers };
})();
