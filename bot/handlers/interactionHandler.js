function getInteractionKey(interaction) {
  return interaction?.customId || interaction?.commandName || String(interaction?.type || "unknown");
}

async function acknowledgeUnknownInteraction(interaction) {
  if (!interaction || interaction.replied || interaction.deferred) return false;
  if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) {
    await interaction.deferUpdate().catch(() => {});
    return true;
  }
  if (typeof safeReply === "function" && typeof createWarningContainer === "function") {
    await safeReply(interaction, {
      components: [createWarningContainer("Not Available", "That interaction is no longer active.")],
      flags: MessageFlags.IsComponentsV2 | 64,
    });
    return true;
  }
  return false;
}

module.exports = { getInteractionKey, acknowledgeUnknownInteraction };
