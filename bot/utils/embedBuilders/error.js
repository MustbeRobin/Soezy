"use strict";

function buildError(title, description, guildId = null) {
  const color = getThemeColor(guildId);
  return typeof createErrorContainer === "function"
    ? createErrorContainer(title, description, color)
    : null;
}

module.exports = { buildError };
