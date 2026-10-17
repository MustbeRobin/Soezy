"use strict";

const { ContainerBuilder, SeparatorSpacingSize } = require("discord.js");

function buildConfigPanel(title, lines = [], guildId = null) {
  const body = Array.isArray(lines) ? lines.filter(Boolean).join("\n") : String(lines || "");
  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`### ${title}`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(body || "-# No configuration values to display."));
}

module.exports = { buildConfigPanel };
