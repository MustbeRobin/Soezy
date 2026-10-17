"use strict";
/* ================= CENTRAL EMBED BUILDER FACADE ================= */
(() => {
function resolveBuilder(name) {
  return typeof globalThis[name] === "function" ? globalThis[name] : null;
}

const existingMusicEmbedBuilder = globalThis.soezyMusicEmbeds?.buildMusicEmbed || resolveBuilder("buildMusicEmbed");
const existingConfigEmbedBuilder = resolveBuilder("buildConfigEmbed");

function buildBaseEmbed({ title, description, guildId = null, color = null, footer = null, requester = null } = {}) {
  const embed = typeof createEmbed === "function"
    ? createEmbed({ title, description, guildId, color, footer })
    : new EmbedBuilder().setColor(typeof getThemeColor === "function" ? getThemeColor(guildId) : 0x808080);
  if (requester && embed.setFooter) {
    embed.setFooter({ text: `Requested by ${requester.username || requester.tag || requester.id}` });
  }
  return embed;
}

function buildHelpEmbed(...args) {
  const main = resolveBuilder("buildMainHelpEmbed");
  return main ? main(...args) : buildBaseEmbed({ title: "Help", description: "Use the help menu to view commands." });
}

function buildDashboardEmbed(...args) {
  const dashboard = resolveBuilder("buildDashboard");
  return dashboard ? dashboard(...args) : { container: createInfoContainer("Dashboard", "Dashboard builder is not loaded."), components: [] };
}

function buildFunEmbedCentral(options = {}) {
  const fun = resolveBuilder("buildFunEmbed");
  return fun ? fun(options) : buildBaseEmbed(options);
}

function buildErrorEmbed(title, description, guildId = null) {
  const error = resolveBuilder("createErrorEmbed");
  return error ? error(title, description, guildId) : buildBaseEmbed({ title, description, guildId, color: typeof getErrorColor === "function" ? getErrorColor() : null });
}

function buildMusicEmbed(options = {}) {
  return existingMusicEmbedBuilder ? existingMusicEmbedBuilder(options) : buildBaseEmbed(options);
}

function buildConfigEmbed(options = {}) {
  return existingConfigEmbedBuilder ? existingConfigEmbedBuilder(options) : buildBaseEmbed(options);
}

const embedBuilderApi = {
  buildBaseEmbed,
  buildHelpEmbed,
  buildDashboardEmbed,
  buildFunEmbed: buildFunEmbedCentral,
  buildErrorEmbed,
  buildMusicEmbed,
  buildConfigEmbed,
};

Object.assign(globalThis, {
  soezyEmbedBuilder: embedBuilderApi,
  buildHelpEmbed,
  buildDashboardEmbed,
  buildErrorEmbed,
  buildMusicEmbed,
  buildConfigEmbed,
});

module.exports = embedBuilderApi;
})();
