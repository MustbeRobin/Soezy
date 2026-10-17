"use strict";

function buildMediaPanel(options = {}) {
  if (typeof buildSendContainer === "function") return buildSendContainer(options);
  return null;
}

module.exports = { buildMediaPanel };
