function normaliseTrigger(trigger) {
  return String(trigger || "").toLowerCase().trim();
}

function getResponders(guildConfig = {}) {
  const merged = {
    ...(guildConfig.globalAutoResponders || {}),
    ...(guildConfig.autoresponder?.triggers || {}),
  };
  return Object.entries(merged)
    .map(([trigger, data]) => [normaliseTrigger(trigger), data])
    .filter(([trigger, data]) => trigger && data?.enabled !== false)
    .sort((a, b) => b[0].length - a[0].length);
}

function responderMatchesContent(content, trigger, data = {}) {
  const caseSensitive = data.caseSensitive === true;
  const haystack = caseSensitive ? String(content || "") : normaliseTrigger(content);
  const needle = caseSensitive ? String(trigger || "").trim() : normaliseTrigger(trigger);
  const mode = data.matchMode || data.match || "contains";
  if (!needle) return false;
  if (mode === "exact") return haystack === needle;
  if (mode === "starts_with" || mode === "startswith") return haystack.startsWith(needle);
  if (mode === "ends_with" || mode === "endswith") return haystack.endsWith(needle);
  return haystack.includes(needle);
}

function matchResponder(content, guildConfig = {}) {
  return getResponders(guildConfig).find(([trigger, data]) => responderMatchesContent(content, trigger, data)) || null;
}

module.exports = { normaliseTrigger, getResponders, matchResponder, responderMatchesContent };
