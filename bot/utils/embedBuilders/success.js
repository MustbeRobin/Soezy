"use strict";

function buildSuccess(title, description, guildId = null) {
  const color = getThemeColor(guildId);
  return typeof createSuccessContainer === "function"
    ? createSuccessContainer(title, description, color)
    : null;
}

module.exports = { buildSuccess };
