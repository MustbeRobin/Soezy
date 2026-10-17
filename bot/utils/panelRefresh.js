/* ================= PANEL REFRESH MANAGER ================= */
(() => {
async function safeEditMessage(message, payload) {
  if (!message?.edit) return null;
  try {
    return await message.edit(payload);
  } catch (err) {
    console.warn(`[CONFIG] Config panel refresh failed message=${message?.id || "unknown"} error=${err.message}`);
    return null;
  }
}

function makeSessionId(userId, guildId, scope = "panel") {
  return `${scope}_${guildId || "global"}_${userId || "unknown"}_${Date.now()}`;
}

function getPanelOwnerId(interaction, options = {}) {
  if (options.ownerId || options.userId) return options.ownerId || options.userId;
  const customId = String(interaction?.customId || "");
  const ownerMatch = customId.match(/(?:toggle_panel_select|toggle_enable_all|toggle_disable_all|dashboard_select|dashboard_home)_(\d{17,20})$/);
  if (ownerMatch) return ownerMatch[1];
  return interaction?.user?.id || "unknown";
}

async function refreshPanelMessage(message, buildPayload, context = {}) {
  if (typeof buildPayload !== "function") return null;
  const guildId = context.guildId || message?.guildId || message?.guild?.id || null;
  if (guildId && typeof refreshGuildConfig === "function") refreshGuildConfig(guildId, "panelRefresh");
  const payload = await buildPayload(context);
  const edited = await safeEditMessage(message, payload);
  if (edited && guildId && typeof refreshPanelState === "function") refreshPanelState(guildId);
  return edited;
}

async function refreshPanel(interaction, updatedGuildData = null, options = {}) {
  const guildId = options.guildId || interaction?.guildId || interaction?.guild?.id || updatedGuildData?.id || null;
  if (guildId && typeof refreshGuildConfig === "function") refreshGuildConfig(guildId, options.reason || "panelInteraction");
  if (guildId && typeof refreshPanelState === "function") refreshPanelState(guildId);

  const builder = options.builder || (() => {
    if (typeof buildTogglePanel === "function" && (options.type === "toggle" || interaction?.customId?.includes("toggle"))) {
      const { container, components = [] } = buildTogglePanel(guildId, getPanelOwnerId(interaction, options), { requester: interaction?.user });
      return { components: [container, ...components], flags: MessageFlags.IsComponentsV2 };
    }
    if (typeof buildDashboard === "function" && options.type === "dashboard") {
      const { container, components = [] } = buildDashboard(interaction.guild, guildId, options.ownerId || interaction.user?.id);
      return { components: [container, ...components], flags: MessageFlags.IsComponentsV2 };
    }
    return null;
  });

  const payload = typeof builder === "function" ? await builder({ interaction, guildId, guildData: updatedGuildData }) : builder;
  if (!payload) return null;
  if (interaction?.message?.id && typeof registerOpenPanel === "function") {
    registerOpenPanel({
      messageId: interaction.message.id,
      channelId: interaction.channelId || interaction.message.channelId,
      guildId,
      userId: options.ownerId || getPanelOwnerId(interaction, options),
      panelType: options.type || "panel",
      client: interaction.client || globalThis.client,
      payload,
    });
  }

  if (interaction && typeof safeUpdate === "function") return safeUpdate(interaction, payload);
  if (interaction?.deferred || interaction?.replied) {
    if (interaction.editReply) return interaction.editReply(payload).catch(() => null);
  }
  if (interaction?.update) return interaction.update(payload).catch(() => null);
  if (interaction?.message?.edit) return interaction.message.edit(payload).catch(() => null);
  return null;
}

function invalidatePanelSessions(guildId = null) {
  if (typeof refreshPanelState === "function") refreshPanelState(guildId);
}

Object.assign(globalThis, {
  soezyPanelRefresh: { safeEditMessage, makeSessionId, refreshPanelMessage, refreshPanel, invalidatePanelSessions, getPanelOwnerId },
  safeEditMessage,
  makePanelSessionId: makeSessionId,
  refreshPanelMessage,
  refreshPanel,
  invalidatePanelSessions,
  getPanelOwnerId,
});

module.exports = globalThis.soezyPanelRefresh;
})();
