const duplicateWindows = globalThis.__soezyAutomodDuplicateWindows || (globalThis.__soezyAutomodDuplicateWindows = new Map());

const WINDOW_MS = 30_000;
const REQUIRED_DUPLICATES = 3;

function normalizeContent(content) {
  return String(content || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "url")
    .replace(/<a?:\w+:\d+>/g, "emoji")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/(.)\1{3,}/g, "$1$1")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  const current = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function similarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - (levenshtein(a, b) / maxLength);
}

function isNearlyIdentical(a, b, threshold = 0.88) {
  if (!a || !b) return false;
  if (a === b) return true;
  const short = Math.min(a.length, b.length);
  const long = Math.max(a.length, b.length);
  if (short < 6 || short / long < 0.55) return false;
  return similarity(a, b) >= threshold;
}

function cleanup(now = Date.now()) {
  for (const [key, state] of duplicateWindows.entries()) {
    if (now - state.lastAt >= (state.windowMs || WINDOW_MS)) duplicateWindows.delete(key);
  }
}

function check(message, cfg = {}, now = Date.now()) {
  const normalized = normalizeContent(message.content);
  if (normalized.length < (cfg.duplicate?.minLength || 4)) return null;

  cleanup(now);

  const key = `${message.guildId}:${message.author.id}`;
  const windowMs = Math.max(1000, Number(cfg.duplicate?.windowMs) || WINDOW_MS);
  const requiredDuplicates = Math.max(2, Math.min(20, Number(cfg.duplicate?.requiredCount) || REQUIRED_DUPLICATES));
  let state = duplicateWindows.get(key);
  if (!state || now - state.lastAt >= windowMs) {
    state = { messages: [], lastAt: 0, windowMs, triggered: false, incidentId: `${now.toString(36)}` };
  }
  const recent = state.messages.filter(entry => now - entry.createdAt < windowMs);
  const similar = recent.filter(entry => isNearlyIdentical(entry.normalized, normalized, cfg.duplicate?.similarity || 0.88));

  const entry = {
    id: message.id,
    channelId: message.channelId,
    normalized,
    message,
    createdAt: now,
    windowMs,
  };

  recent.push(entry);
  state.messages = recent;
  state.lastAt = now;
  state.windowMs = windowMs;
  duplicateWindows.delete(key);
  duplicateWindows.set(key, state);
  if (duplicateWindows.size > 5_000) {
    cleanup(now);
    while (duplicateWindows.size > 5_000) duplicateWindows.delete(duplicateWindows.keys().next().value);
  }

  if (state.triggered || similar.length + 1 < requiredDuplicates) return null;

  state.triggered = true;
  return {
    type: "duplicate",
    title: "Duplicate Spam Detection",
    reason: "Repeated nearly identical messages",
    indicators: [`${similar.length + 1} duplicate messages in ${Math.round(windowMs / 1000)} seconds`],
    messages: [...similar.map(item => item.message), message],
    incidentId: state.incidentId,
    dedupeMs: windowMs,
    timeoutMs: Math.max(60_000, Number(cfg.duplicate?.timeoutMs) || 10 * 60 * 1000),
    action: "timeout",
    delete: true,
  };
}

module.exports = {
  check,
  normalizeContent,
  similarity,
  isNearlyIdentical,
};
