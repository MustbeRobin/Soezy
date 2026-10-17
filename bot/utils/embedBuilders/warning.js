"use strict";

function buildWarning(title, description, guildId = null) {
  return typeof createWarningContainer === "function"
    ? createWarningContainer(title, description, guildId)
    : null;
}

module.exports = { buildWarning };
