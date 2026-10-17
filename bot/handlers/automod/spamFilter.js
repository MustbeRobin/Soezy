"use strict";

const windows = globalThis.__soezyAutomodSpamWindows || (globalThis.__soezyAutomodSpamWindows = new Map());
let incidentSequence = globalThis.__soezyAutomodSpamIncidentSequence || 0;

function check(message, config = {}, now = Date.now()) {
  const guildId = message?.guildId || message?.guild?.id;
  const userId = message?.author?.id;
  if (!guildId || !userId) return null;

  const threshold = Math.max(2, Math.min(20, Number(config.maxMessages) || 5));
  const interval = Math.max(1_000, Math.min(60_000, Number(config.interval) || 5_000));
  const key = `${guildId}:${userId}:spam`;
  let state = windows.get(key);

  if (!state || now - state.lastAt >= state.interval) {
    incidentSequence += 1;
    globalThis.__soezyAutomodSpamIncidentSequence = incidentSequence;
    state = {
      messages: [],
      lastAt: 0,
      interval,
      triggered: false,
      incidentId: `${now.toString(36)}-${incidentSequence.toString(36)}`,
    };
  }

  state.interval = interval;
  state.messages = state.messages.filter(at => now - at < interval);
  state.messages.push(now);
  state.lastAt = now;
  windows.delete(key);
  windows.set(key, state);

  if (windows.size > 5_000) {
    for (const [oldKey, oldState] of windows) {
      if (now - oldState.lastAt >= oldState.interval) windows.delete(oldKey);
    }
    while (windows.size > 5_000) windows.delete(windows.keys().next().value);
  }

  if (state.triggered || state.messages.length < threshold) return null;
  state.triggered = true;

  return {
    type: "spam",
    title: "Spam Detected",
    reason: "Message frequency limit exceeded",
    indicators: [`${state.messages.length} messages in ${Math.ceil(interval / 1000)} seconds`],
    messages: [message],
    incidentId: state.incidentId,
    dedupeMs: interval,
    action: config.action === "mute" ? "timeout" : (config.action || "timeout"),
    timeoutMs: Math.max(60_000, Number(config.duration) || 300_000),
    delete: true,
  };
}

module.exports = { check };
