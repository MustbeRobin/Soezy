/* ================= CONSOLIDATED CONFIG MANAGER ================= */
(() => {
const runtimeState = globalThis.__soezyConfigRuntimeState || (globalThis.__soezyConfigRuntimeState = {
  guilds: new Map(),
  panels: new Map(),
  revision: 0,
});

const SYSTEM_PATHS = Object.freeze({
  automod: ["automod.enabled"],
  security: ["automod.enabled"],
  antinuke: ["antinuke.enabled"],
  antibot: ["antibot.enabled"],
  antilink: ["antilink.enabled"],
  wall: ["wallSystem.enabled"],
  verification: ["verify.enabled", "verification.enabled"],
  media: ["media.enabled"],
  logging: ["logging.enabled"],
  sticky: ["stickySystem.enabled"],
  tempvoice: ["tempVoice.enabled", "tempvoice.enabled"],
  music: ["music.enabled"],
  autoresponder: ["autoresponder.enabled"],
  autoreact: ["autoreact.enabled"],
  blacklist: ["security.blacklistedUsers", "shadowMuted"],
  premium: ["premiumRole", "premiumLog"],
  nightmode: ["settings.nightmode.enabled", "nightmode.enabled"],
});

function isGuildId(value) {
  return /^\d{17,20}$/.test(String(value || ""));
}

function storedGuildIds() {
  return Object.keys(db.guilds || {}).filter(isGuildId);
}

function getPath(obj, path) {
  return String(path).split(".").reduce((cur, part) => cur?.[part], obj);
}

function setPath(obj, path, value) {
  const parts = String(path).split(".");
  let cur = obj;
  while (parts.length > 1) {
    const part = parts.shift();
    if (!cur[part] || typeof cur[part] !== "object") cur[part] = {};
    cur = cur[part];
  }
  cur[parts[0]] = value;
}

function cloneConfig(value) {
  if (!value || typeof value !== "object") return value;
  try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
}

function invalidateGuildCache(guildId = null) {
  if (guildId) {
    if (typeof invalidateGuildSettings === "function") invalidateGuildSettings(guildId);
    runtimeState.guilds.delete(String(guildId));
  } else {
    if (typeof clearGuildSettingsCache === "function") clearGuildSettingsCache();
    else if (typeof invalidateGuildSettings === "function") {
      for (const gId of storedGuildIds()) invalidateGuildSettings(gId);
    }
    runtimeState.guilds.clear();
  }
  console.log(`[CONFIG] Runtime cache refreshed${guildId ? ` guild=${guildId}` : ""}`);
}

function rebuildConfigState(guildId) {
  if (!guildId || typeof guildData !== "function") return null;
  const gd = guildData(guildId);
  if (!gd.security) gd.security = {};
  gd.security.enabled = gd.automod?.enabled === true;
  const systems = {};
  for (const [name, paths] of Object.entries(SYSTEM_PATHS)) {
    const values = paths.map(path => getPath(gd, path)).filter(value => value !== undefined);
    systems[name] = values.length ? values.some(Boolean) : undefined;
  }
  const state = {
    guildId: String(guildId),
    revision: ++runtimeState.revision,
    refreshedAt: Date.now(),
    systems,
    config: cloneConfig(gd),
  };
  runtimeState.guilds.set(String(guildId), state);
  return state;
}

function refreshSecurityState(guildId) {
  const gd = typeof guildData === "function" ? guildData(guildId) : db.guilds?.[guildId];
  if (!gd) return null;
  if (!gd.security) gd.security = {};
  gd.security.enabled = gd.automod?.enabled === true;
  if (typeof soezyBlacklistManager?.syncBlacklistCache === "function") {
    soezyBlacklistManager.syncBlacklistCache(guildId);
  }
  console.log(`[SECURITY] Runtime state synced guild=${guildId}`);
  return gd.security;
}

function refreshBlacklistState(guildId = null, userId = null) {
  if (typeof soezyBlacklistManager?.syncBlacklistCache === "function") {
    soezyBlacklistManager.syncBlacklistCache(guildId || null);
  }
  if (userId && typeof soezySecurity?.clearBlacklistRuntime === "function") {
    if (guildId) soezySecurity.clearBlacklistRuntime(guildId, userId);
    else for (const gId of storedGuildIds()) soezySecurity.clearBlacklistRuntime(gId, userId);
  }
  console.log(`[BLACKLIST] Cache invalidated${guildId ? ` guild=${guildId}` : ""}${userId ? ` user=${userId}` : ""}`);
}

function syncRuntimeState(guildId = null, reason = "manual") {
  if (guildId) {
    invalidateGuildCache(guildId);
    refreshSecurityState(guildId);
    const state = rebuildConfigState(guildId);
    console.log(`[CONFIG] Runtime state synced guild=${guildId} reason=${reason}`);
    return state;
  }
  // A full rebuild is reserved for startup/reload and explicit owner actions.
  // Normal saves call no runtime sync at all; feature changes use their guild id.
  invalidateGuildCache(null);
  for (const gId of storedGuildIds()) {
    refreshSecurityState(gId);
    rebuildConfigState(gId);
  }
  refreshBlacklistState(null);
  console.log(`[CONFIG] Runtime state synced reason=${reason}`);
  return runtimeState;
}

function refreshGuildConfig(guildId, reason = "manual") {
  return syncRuntimeState(guildId, reason);
}

function refreshPanelState(guildId = null) {
  const now = Date.now();
  for (const [key, panel] of runtimeState.panels) {
    if (guildId && panel.guildId !== String(guildId)) continue;
    panel.invalidatedAt = now;
    panel.revision = runtimeState.revision;
  }
  console.log(`[CONFIG] Config panel refreshed${guildId ? ` guild=${guildId}` : ""}`);
}

function registerPanelState(key, data = {}) {
  if (!key) return null;
  cleanupRuntime();
  if (runtimeState.panels.size >= 2000) runtimeState.panels.delete(runtimeState.panels.keys().next().value);
  const panel = {
    ...data,
    guildId: data.guildId ? String(data.guildId) : null,
    revision: runtimeState.revision,
    registeredAt: Date.now(),
    invalidatedAt: 0,
  };
  runtimeState.panels.set(key, panel);
  return panel;
}

function cleanupRuntime(guildId = null) {
  for (const [key, panel] of runtimeState.panels) {
    if (panel.guildId === guildId || Date.now() - panel.registeredAt > 15 * 60 * 1000) runtimeState.panels.delete(key);
  }
  if (guildId) runtimeState.guilds.delete(String(guildId));
}

Object.assign(globalThis, {
  soezyConfigSync: {
    refreshGuildConfig,
    syncRuntimeState,
    invalidateGuildCache,
    rebuildConfigState,
    refreshSecurityState,
    refreshBlacklistState,
    refreshPanelState,
    registerPanelState,
    setPath,
    getPath,
    runtimeState,
    cleanupRuntime,
  },
  refreshGuildConfig,
  syncRuntimeState,
  invalidateGuildCache,
  rebuildConfigState,
  refreshSecurityState,
  refreshBlacklistState,
  refreshPanelState,
});


/* ---- Panel refresh helpers merged from configRefresh.js ---- */
function nextPanelSession(userId) {
  return `${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function buildWhitelistConfigPanel(guildId, user) {
  const gd = guildData(guildId);
  const sessionId = nextPanelSession(user.id);
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`secwl_config_${sessionId}`)
    .setPlaceholder("Select an option to configure...")
    .addOptions(["user", "role", "channel"].flatMap(type => ["add", "remove"].map(mode => ({
      label: `${mode === "add" ? "Add" : "Remove"} ${type} by ID`,
      value: `${type}_${mode}`
    }))));
  const entries = [["Users", gd.whitelistUsers, id => `<@${id}>`], ["Roles", gd.whitelistRoles, id => `<@&${id}>`], ["Channels", gd.whitelistChannels, id => `<#${id}>`]];
  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`### ${EMOJIS.thinking} Whitelist Configuration`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(entries.map(([label, ids = [], mention]) => `**${label} (${ids.length})**\n${ids.slice(0, 15).map(mention).join(", ") || "None"}`).join("\n\n")))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(menu))
    .addTextDisplayComponents(t => t.setContent(`-# Requested by ${user.username}`));
}
globalThis.buildWhitelistConfigPanel = buildWhitelistConfigPanel;

function buildStickyConfigPanel(guildId, user, prefix = getPrefix(guildId)) {
  const st = guildData(guildId).stickySystem || {};
  const enabled = typeof getFeatureState === "function" ? getFeatureState(guildId, "sticky") : st.enabled === true;
  const ARR = getEmoji("arrow");
  const stickyCount = Object.keys(guildData(guildId).stickyMessages || {}).length;
  const sessionId = nextPanelSession(user?.id || "system");
  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`stcfg_select_${sessionId}`)
    .setPlaceholder("Select an option to configure...")
    .addOptions([
      { label: enabled ? "Disable Sticky" : "Enable Sticky", description: enabled ? "Turn off sticky messages" : "Turn on sticky messages", value: `stcfg_toggle_${sessionId}` },
      { label: "Set Sticky Message", description: "Set a sticky message in a channel", value: `stcfg_set_${sessionId}` },
      { label: "Edit Sticky Message", description: "Edit message & mode for a sticky", value: `stcfg_edit_${sessionId}` },
      { label: "Remove Sticky Message", description: "Remove sticky from a channel", value: `stcfg_remove_${sessionId}` },
      { label: "List Stickies", description: "List all active sticky messages", value: `stcfg_list_${sessionId}` },
    ]);

  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.thinking} Sticky Messages Configuration`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(
      `${ARR} **Status:** ${enabled ? `<:tick:1559236522711187577> Enabled` : `<:scross:1559257945030525110> Disabled`}\n` +
      `${ARR} **Active Stickies:** \`${stickyCount}\``
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(dropdown))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t => t.setContent(
      `**Quick Commands:**\n` +
      `\`${prefix}sticky <name>|<message>|<channel>|<mode>\`\n` +
      `\`/sticky config\`\n` +
      `-# Requested by ${user?.username || "admin"}`
    ));
}

function getConfigPanelBuilder(type) {
  return {
    autojail: (ctx) => typeof globalThis.buildAutoJailConfigPanel === "function"
      ? globalThis.buildAutoJailConfigPanel(ctx.guild, ctx.guildId, nextPanelSession(ctx.user?.id || "system"), ctx.user)?.container
      : null,
    sticky: (ctx) => buildStickyConfigPanel(ctx.guildId, ctx.user, ctx.prefix),
    autoresponder: (ctx) => buildAutoResponderConfigPanel(ctx.guildId, nextPanelSession(ctx.user?.id || "system"), ctx.user, ctx.prefix),
    autoreact: (ctx) => buildAutoReactConfigPanel(ctx.guildId, nextPanelSession(ctx.user?.id || "system"), ctx.user, ctx.prefix),
  }[type] || null;
}

async function refreshConfigPanel(type, interactionOrMessage, options = {}) {
  const builder = options.builder || getConfigPanelBuilder(type);
  if (!builder) return null;
  const interaction = interactionOrMessage;
  const guildId = options.guildId || interaction?.guildId || interaction?.guild?.id;
  const user = options.user || interaction?.user || interaction?.author;
  const prefix = options.prefix || getPrefix(guildId);
  const container = builder({ guildId, user, prefix, page: options.page, state: options.state });
  const payload = { components: [container], flags: MessageFlags.IsComponentsV2 };

  if (interaction?.isMessageComponent?.()) return await safeUpdate(interaction, payload);
  if (interaction?.message?.edit) return await safeEdit(interaction.message, payload);
  if (interaction?.edit) return await safeEdit(interaction, payload);
  return container;
}

Object.assign(globalThis, {
  nextPanelSession,
  buildStickyConfigPanel,
  refreshConfigPanel,
});


const configManagerApi = {
  refreshGuildConfig,
  syncRuntimeState,
  invalidateGuildCache,
  rebuildConfigState,
  refreshSecurityState,
  refreshBlacklistState,
  refreshPanelState,
  registerPanelState,
  setPath,
  getPath,
  runtimeState,
  nextPanelSession,
  buildStickyConfigPanel,
  refreshConfigPanel,
};

Object.assign(globalThis, {
  soezyConfigManager: configManagerApi,
  soezyConfigSync: configManagerApi,
  refreshGuildConfig,
  syncRuntimeState,
  invalidateGuildCache,
  rebuildConfigState,
  refreshSecurityState,
  refreshBlacklistState,
  refreshPanelState,
  registerPanelState,
  nextPanelSession,
  buildStickyConfigPanel,
  refreshConfigPanel,
});

module.exports = configManagerApi;
})();
