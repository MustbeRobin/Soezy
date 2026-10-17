"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");

const source = fs.readFileSync(path.join(__dirname, "..", "utils", "database.js"), "utf8");
const start = source.indexOf("function formatWelcomeVariables");
const end = source.indexOf("// ============ SELFIE CONFIG PANEL", start);
assert.ok(start >= 0 && end > start, "welcome setup helpers should be present");

function harness() {
  const data = { welcome: {}, greet: {} };
  const discordCtx = { ...discord };
  const context = vm.createContext({
    ...discordCtx,
    EMOJIS: {
      thinking: "<a:sthinking:1487769302462501046>",
      welcome_ping: "<:welcome_ping:1559500364280238131>",
      welcome_arrow: "<:welcome_arrow:1559500371527999519>",
    },
    guildData: () => data,
    saveDB: () => {},
    setFeatureState: (guildId, feature, enabled) => {
      const key = feature === "joindm" ? "joinDm" : feature;
      data[key] ||= {};
      data[key].enabled = enabled;
      data.guildSystems ||= {};
      data.guildSystems[guildId] ||= {};
      data.guildSystems[guildId][feature] = enabled;
    },
    syncFeatureState: async () => {},
    isAuthorizedInteraction: () => true,
    safeReply: async (interaction, payload) => interaction.reply(payload),
    replaceSetupWithConfigEditor: async (interaction, panel) => {
      interaction.editorPanel = panel;
      await interaction.update({ components: panel.components, flags: discord.MessageFlags.IsComponentsV2 });
    },
    refreshConfigEditorPreview: async () => {},
    parseDuration: value => value === "1m" ? 60000 : null,
    formatDuration: value => `${Math.floor(value / 60000)}m`,
    createErrorContainer: (title, text) => new discord.ContainerBuilder().addTextDisplayComponents(t => t.setContent(`${title}: ${text}`)),
    createWarningContainer: (title, text) => new discord.ContainerBuilder().addTextDisplayComponents(t => t.setContent(`${title}: ${text}`)),
    createSuccessContainer: (title, text) => new discord.ContainerBuilder().addTextDisplayComponents(t => t.setContent(`${title}: ${text}`)),
    createInfoContainer: (title, text) => new discord.ContainerBuilder().addTextDisplayComponents(t => t.setContent(`${title}: ${text}`)),
    toggleSystem: () => {},
    createEmbed: options => {
      const embed = new discord.EmbedBuilder();
      if (options.title) embed.setTitle(options.title);
      if (options.description) embed.setDescription(options.description);
      return embed;
    },
    getThemeColor: () => 0x808080,
    isValidUrl: value => /^https?:\/\//.test(value || ""),
  });
  const embedSource = fs.readFileSync(path.join(__dirname, "../utils/embedBuilders/errorEmbeds.js"), "utf8");
  vm.runInContext(embedSource.slice(embedSource.indexOf("function wrapEmbedAsContainer("), embedSource.indexOf("function createInfoContainer(")), context);
  vm.runInContext(source.slice(start, end) + "\nglobalThis.buildTestPanel = buildWelcomeSetupPanel; globalThis.buildTestConfigPanels = { welcome: buildWelcomeConfigPanel, goodbye: buildGoodbyeConfigPanel, boost: buildBoostConfigPanel, joindm: buildJoinDmConfigPanel }; globalThis.soezyWelcomeSetup = { interaction: handleWelcomeSetupInteraction };", context);
  return { context, data };
}

test("welcome setup renders requested copy and channel/style/template controls", () => {
  const { context } = harness();
  const user = { id: "123456789012345678", username: "Admin" };
  const panel = context.buildTestPanel({ name: "Jane" }, "guild", user, `${user.id}:${Date.now()}`).toJSON();
  const text = panel.components.filter(c => c.type === discord.ComponentType.TextDisplay).map(c => c.content).join("\n");
  const rows = panel.components.filter(c => c.type === discord.ComponentType.ActionRow);
  assert.match(text, /Welcomer Configuration System/);
  assert.match(text, /<a:sthinking:1487769302462501046> Welcomer Configuration System/);
  assert.match(text, /Configure greeting welcome messages for new members/);
  assert.match(text, /Select a destination channel/);
  assert.equal(rows[0].components[0].type, discord.ComponentType.ChannelSelect);
  assert.deepEqual(rows[1].components.map(c => c.label), ["Normal", "Embed", "Template", "Cancel"]);
});

test("channel selection and style buttons acknowledge and open the editor", async () => {
  const { context, data } = harness();
  const user = { id: "123456789012345678", username: "Admin" };
  const stamp = Date.now();
  const channel = { id: "222222222222222222", type: discord.ChannelType.GuildText };
  const guild = { channels: { cache: new Map([[channel.id, channel]]) } };
  const updates = [];
  const channelInteraction = {
    guild, guildId: "guild", user, customId: `wlsetup:channel:${user.id}:${stamp}`,
    values: [channel.id], update: async payload => { updates.push(payload); },
  };
  assert.equal(await context.soezyWelcomeSetup.interaction(channelInteraction), true);
  assert.equal(data.welcome.channel, channel.id);
  assert.equal(data.greet.channel, channel.id);
  const styleInteraction = {
    guild, guildId: "guild", user, customId: `wlsetup:style:normal:${user.id}:${stamp}`,
    update: async payload => { updates.push(payload); },
  };
  assert.equal(await context.soezyWelcomeSetup.interaction(styleInteraction), true);
  assert.equal(data.welcome.embedEnabled, false);
  assert.equal(updates.length, 2);
  assert.equal(updates[1].components.length, 1);
  const editor = updates[1].components[0].toJSON();
  assert.deepEqual(editor.components.map(c => c.type), [discord.ComponentType.ActionRow, discord.ComponentType.ActionRow]);
  assert.deepEqual(editor.components[1].components.map(c => c.label), ["Save & Enable", "Auto Delete Delay", "View Variables", "Cancel"]);
});

test("blank embed preview is separate from the compact controls and reflects edits", () => {
  const { context, data } = harness();
  const user = { id: "123456789012345678", username: "Admin" };
  let result = context.buildWelcomeConfigPanel({name: "Jane"}, "guild", `${user.id}_${Date.now()}`, user);
  assert.equal(result.components.length, 1);
  assert.equal(result.previewEmbed.toJSON().description, "\u200b");
  data.welcome.title = "Hello {username}";
  data.welcome.message = "Welcome to {server}";
  result = context.buildWelcomeConfigPanel({name: "Jane"}, "guild", `${user.id}_${Date.now()}`, user);
  assert.match(result.previewContent, /Hello Admin/);
  assert.match(JSON.stringify(result.previewEmbed.toJSON()), /Welcome to Jane/);
  assert.doesNotMatch(JSON.stringify(result.components.map(c => c.toJSON())), /Welcomer Configuration System|Msg Footer|Choose a message style/);
});

test("title is outside the preview and avatar variables render in all media positions", () => {
  const { context, data } = harness();
  const avatar = "https://cdn.discordapp.com/embed/avatars/0.png";
  const user = { id: "123456789012345678", username: "Admin", displayAvatarURL: () => avatar };
  Object.assign(data.welcome, {
    title: "Welcome {user.mention}", message: "Hello {user.name}",
    thumbnail: "{user.avatar}", image: "{user_avatar}",
    authorText: "{user.name}", authorIcon: "{user.avatar}",
    footer: "{guild.name}", footerIcon: "{user_avatar}",
  });
  const result = context.buildWelcomeConfigPanel({ name: "Jane", iconURL: () => avatar }, "guild", `${user.id}_${Date.now()}`, user);
  assert.equal(result.previewContent, `Welcome <@${user.id}>`);
  const preview = result.previewEmbed.toJSON();
  assert.equal(preview.author.icon_url, avatar);
  assert.equal(preview.footer.icon_url, avatar);
  assert.equal(preview.thumbnail.url, avatar);
  assert.equal(preview.image.url, avatar);
  assert.doesNotMatch(JSON.stringify(preview), /\{user[._]|Welcome <@/);
});

test("Save & Enable persists Welcome with no channel configured", async () => {
  const { context, data } = harness();
  const user = { id: "123456789012345678", username: "Admin" };
  let result, deferred = false;
  await context.soezyWelcomeSetup.interaction({
    guild: {}, guildId: "guild", user,
    customId: `wlsetup:save:${user.id}:${Date.now()}`,
    deferUpdate: async () => { deferred = true; },
    editReply: async payload => { result = payload; },
  });
  assert.equal(deferred, true);
  assert.equal(data.welcome.enabled, true);
  assert.equal(data.guildSystems.guild.welcome, true);
  assert.equal(result.components.length, 1);
  const panel = result.components[0].toJSON();
  assert.match(panel.components[0].content, /Welcome Enabled/);
  assert.match(panel.components[0].content, /Set a destination channel when you're ready/);
  assert.ok(panel.components.every(c => c.type !== discord.ComponentType.ActionRow));
});

test("all four direct configuration panels expose enable controls without channel or message setup", () => {
  const { context } = harness();
  const user = { id: "123456789012345678", username: "Admin" };
  const guild = { id: "guild", name: "Test Server", premiumSubscriptionCount: 0, iconURL: () => "https://example.com/icon.png" };
  for (const feature of ["welcome", "goodbye", "boost", "joindm"]) {
    const panel = context.buildTestConfigPanels[feature](guild, "guild", `${user.id}_${Date.now()}`, user);
    const container = panel.container.toJSON();
    const rows = container.components.filter(component => component.type === discord.ComponentType.ActionRow);
    const enableOption = rows.flatMap(row => row.components)
      .flatMap(component => component.options || [])
      .find(option => /Enable/.test(option.label));
    const enableButton = rows.flatMap(row => row.components).find(component => component.label === "Save & Enable");
    assert.ok(enableOption, `${feature} should expose its existing enable option`);
    assert.ok(enableButton, `${feature} should expose its existing Save & Enable button`);
  }
});

test("welcome template selection writes the preset and returns to the editor", async () => {
  const { context, data } = harness();
  const user = { id: "123456789012345678", username: "Admin" };
  const stamp = Date.now();
  let response;
  const interaction = {
    guild: { channels: { cache: new Map() } }, guildId: "guild", user,
    customId: `wlsetup:template:${user.id}:${stamp}`, values: ["milestone"],
    update: async payload => { response = payload; },
  };
  assert.equal(await context.soezyWelcomeSetup.interaction(interaction), true);
  assert.match(data.welcome.message, /member #\{membercount\}/);
  assert.equal(data.welcome.embedEnabled, true);
  assert.ok(response.components.length);
});

test("auto-delete delay modal stores a valid duration and acknowledges the update", async () => {
  const { context, data } = harness();
  const user = { id: "123456789012345678", username: "Admin" };
  const stamp = Date.now();
  let modal, reply;
  const button = {
    guild: { channels: { cache: new Map() } }, guildId: "guild", user,
    customId: `wlsetup:delay:${user.id}:${stamp}`,
    showModal: async value => { modal = value; },
  };
  assert.equal(await context.soezyWelcomeSetup.interaction(button), true);
  assert.equal(modal.data.title, "Welcome Auto Delete Delay");
  const submit = {
    guild: button.guild, guildId: "guild", user,
    customId: `wlsetup:delay-submit:${user.id}:${stamp}`,
    fields: { getTextInputValue: () => "1m" },
    message: { edit: async () => {} },
    deferReply: async () => {},
    editReply: async value => { reply = value; },
  };
  assert.equal(await context.soezyWelcomeSetup.interaction(submit), true);
  assert.equal(data.welcome.deleteDelayMs, 60000);
  assert.ok(reply.components.length);
});
