function normaliseStickyEntry(entry = {}) {
  return {
    enabled: entry.enabled !== false,
    name: entry.name || null,
    channelId: entry.channelId || null,
    content: String(entry.content || entry.message || "").trim(),
    messageId: entry.messageId || null,
    mode: entry.mode || "single",
    useContainer: entry.useContainer !== false,
  };
}

function getStickyEntries(guildConfig = {}) {
  return Object.fromEntries(
    Object.entries(guildConfig.stickyMessages || {})
      .map(([key, entry]) => [entry?.channelId || String(key).split(":")[0] || key, normaliseStickyEntry({ ...entry, channelId: entry?.channelId || String(key).split(":")[0] })])
      .filter(([, entry]) => entry.content)
  );
}

module.exports = { normaliseStickyEntry, getStickyEntries };
