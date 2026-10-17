/* Shared logging provisioning and configuration for prefix and slash commands. */
(() => {
const categories = {
  vc: ["voiceJoin", "voiceLeave", "voiceMove"],
  message: ["messageDelete", "messageEdit"],
  moderation: ["memberBan", "memberUnban", "memberKick", "memberMute", "memberUnmute", "memberWarn", "infect"],
  join: ["memberJoin"], leave: ["memberLeave"],
  system: ["emojiCreate", "emojiDelete", "emojiUpdate", "stickerCreate", "stickerDelete", "stickerUpdate", "inviteCreate", "inviteDelete"],
  role: ["roleCreate", "roleDelete", "roleUpdate"],
  alert: ["autoModerationRuleCreate", "autoModerationRuleDelete", "autoModerationRuleUpdate", "autoModerationActionExecution"],
  member: ["memberUpdate", "nicknameChange"],
  thread: ["threadCreate", "threadDelete", "threadUpdate"],
  stage: ["stageInstanceCreate", "stageInstanceDelete", "stageInstanceUpdate"],
  channel: ["channelCreate", "channelDelete", "channelUpdate"],
  server: ["guildUpdate"],
  event: ["guildScheduledEventCreate", "guildScheduledEventDelete", "guildScheduledEventUpdate"],
  webhook: ["webhookCreate", "webhookDelete", "webhookUpdate"],
  application: ["guildIntegrationsUpdate", "applicationCommandPermissionsUpdate"],
};
const labels = {
  system: "System Logs", join: "Join Logs", leave: "Leave Logs", member: "Member Logs",
  message: "Message Logs", thread: "Thread Logs", vc: "Voice Logs", stage: "Stage Logs",
  moderation: "Moderation Logs", channel: "Channel Logs", server: "Server Logs",
  event: "Event Logs", webhook: "Webhook Logs", role: "Role Logs",
  application: "Application Logs", alert: "Alert Logs",
};
const routes = Object.fromEntries(Object.entries(categories).flatMap(([key, events]) => events.map(event => [event, key])));
const jobs = new Map();
const F = PermissionsBitField.Flags;
const state = guild => {
  const lg = guildData(guild.id).logging ||= {};
  lg.channels ||= {}; lg.events ||= {};
  return lg;
};
function selected(category) {
  if (!category || category === "all") return Object.keys(categories);
  if (!Object.hasOwn(categories, category)) throw new Error("Unknown logging category.");
  return [category];
}
async function fetchChannel(guild, id) {
  if (!id) return null;
  return guild.channels.fetch(id).catch(error => {
    if (error.code === 10003) return null;
    throw error;
  });
}
function usable(channel, guild) {
  return channel?.guild?.id === guild.id && channel.type === ChannelType.GuildText &&
    channel.permissionsFor(guild.members.me)?.has([F.ViewChannel, F.SendMessages, F.EmbedLinks]);
}
function isActive(guild, key) {
  const lg = state(guild);
  return Boolean(lg.enabled && categories[key]?.some(event => lg.events[event]));
}
async function enable(guild, category = "all") {
  if (jobs.has(guild.id)) throw new Error("Logging setup is already running. Please wait for it to finish.");
  const keys = selected(category);
  jobs.set(guild.id, true);
  try {
    const me = guild.members.me || await guild.members.fetchMe();
    if (!me.permissions.has(F.ManageChannels)) throw new Error("I need Manage Channels to create log channels.");
    const lg = state(guild);
    let parent = await require("./utils/soezyLogCategory").ensure(guild, { guildData, saveDB });
    await require("./utils/soezyLogCategory").migrate(guild, { guildData, saveDB });
    if (parent && parent.type !== ChannelType.GuildCategory) throw new Error("The configured logs category is not a category channel.");
    const overwrites = [
      { id: guild.id, deny: [F.ViewChannel] },
      { id: me.id, allow: [F.ViewChannel, F.SendMessages, F.EmbedLinks, F.AttachFiles, F.ReadMessageHistory, F.ManageChannels] },
    ];
    let created = 0;
    for (const key of keys) {
      let channel = await fetchChannel(guild, lg.channels[key]);
      if (channel && !usable(channel, guild)) throw new Error(`I cannot send logs to the configured ${key} channel. Change it in logging config.`);
      if (!channel) {
        channel = await guild.channels.create({ name: `${key}-logs`, type: ChannelType.GuildText, parent: parent.id, permissionOverwrites: overwrites, reason: "Logging setup" });
        lg.channels[key] = channel.id; saveDB(); created++;
        await channel.send({ embeds: [new EmbedBuilder().setTitle("Logging Initialized").setDescription(`This channel will log ${key} events.`).setFooter({ text: "Soezy Logging System" })], allowedMentions: { parse: [] } }).catch(() => {});
      }
      for (const event of categories[key]) lg.events[event] = true;
      lg.enabled = true; saveDB();
    }
    return created;
  } finally { jobs.delete(guild.id); }
}
function disable(guild, category = "all") {
  if (jobs.has(guild.id)) throw new Error("Wait for logging setup to finish before disabling it.");
  const keys = selected(category), lg = state(guild);
  for (const key of keys) for (const event of categories[key]) lg.events[event] = false;
  if (category === "all") lg.enabled = false;
  saveDB();
}
async function setChannel(guild, category, id) {
  selected(category);
  if (category === "all") throw new Error("Select one category to change its channel.");
  if (jobs.has(guild.id)) throw new Error("Wait for logging setup to finish before changing channels.");
  const channel = await fetchChannel(guild, id);
  if (!usable(channel, guild)) throw new Error("Choose a text channel where I can View Channel, Send Messages, and Embed Links.");
  state(guild).channels[category] = channel.id;
  saveDB();
}
async function setCategory(guild, id) {
  if (jobs.has(guild.id)) throw new Error("Wait for logging setup to finish before changing channels.");
  const channel = await fetchChannel(guild, id);
  if (!channel || channel.type !== ChannelType.GuildCategory) throw new Error("Choose a category channel from this server.");
  state(guild).categoryId = channel.id;
  saveDB();
  await require("./utils/soezyLogCategory").migrate(guild, { guildData, saveDB });
}
function panel(guild, user, target = null, stamp = Date.now()) {
  const lg = state(guild), sid = `${user.id}:${stamp}`;
  const status = enabled => enabled ? "<:tick:1559236522711187577>" : "<:scross:1559257945030525110>";
  const lines = Object.entries(labels).map(([key, label]) => {
    const channel = lg.channels[key] ? ` <#${lg.channels[key]}>` : "";
    return `**\`${label.padEnd(17, " ")}\`** <:arrow:1533514885705502842> ${status(isActive(guild, key))}${channel}`;
  }).join("\n");
  const content =
    `> __**Logging**__ : ${status(lg.enabled)}\n` +
    `> __**Category**__ : ${lg.categoryId ? `<#${lg.categoryId}>` : status(false)}\n` +
    `> __**Ignore Embeds**__ : ${status(Boolean(lg.ignoreEmbeds))}\n` +
    `> __**Ignore Voice**__ : ${status(Boolean(lg.ignoreVoice))}\n` +
    `__**Logging Channels :**__\n${lines}`;
  const settings = new StringSelectMenuBuilder()
    .setCustomId(`logpanel:setting:${sid}`)
    .setPlaceholder("Use the menu to toggle settings")
    .addOptions([
      { label: lg.enabled ? "Disable Logging" : "Enable Logging", description: lg.enabled ? "Turn off all logging" : "Create log channels and enable logging", value: "toggle" },
      { label: "Setup All Log Channels", description: "Create missing private log channels", value: "setup" },
      { label: "Toggle Ignore Embeds", description: "Change whether embedded message content is ignored", value: "ignoreEmbeds" },
      { label: "Toggle Ignore Voice", description: "Change whether voice events are ignored", value: "ignoreVoice" },
      ...Object.entries(labels).map(([key, label]) => ({ label: `Toggle ${label}`, description: `Enable or disable ${label.toLowerCase()}`, value: `toggle:${key}` })),
    ]);
  const channelOptions = Object.entries(labels).map(([key, label]) => ({ label, value: `channel:${key}` }));
  channelOptions.push({ label: "Logging Category", value: "category" });
  const channels = new StringSelectMenuBuilder()
    .setCustomId(`logpanel:choose-channel:${sid}`)
    .setPlaceholder("Choose a log channel to change")
    .addOptions(channelOptions);
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.thinking} Logging Configuration\n${content}`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(new ActionRowBuilder().addComponents(settings))
    .addActionRowComponents(new ActionRowBuilder().addComponents(channels));
  if (target === "category") container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId(`logpanel:pick-category:${sid}`).setPlaceholder("Choose a category channel").setChannelTypes(ChannelType.GuildCategory)
  ));
  else if (typeof target === "string" && target.startsWith("channel:")) {
    const key = target.slice("channel:".length);
    if (Object.hasOwn(categories, key)) container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId(`logpanel:pick:${key}:${sid}`).setPlaceholder(`Choose ${labels[key]} destination`).setChannelTypes(ChannelType.GuildText)
    ));
  }
  container.addTextDisplayComponents(t => t.setContent(`-# *Use the select menus below to toggle settings and change channels.*\n-# Requested by ${user.username}`));
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}
async function interaction(i) {
  if (!i.customId?.startsWith("logpanel:")) return false;
  if (!i.guild || !isAuthorizedInteraction(i)) {
    await i.reply({ content: "Only authorized administrators can configure logging.", flags: 64 }); return true;
  }
  const parts = i.customId.split(":"), userId = parts.at(-2), stamp = Number(parts.at(-1));
  if (userId !== i.user.id || !Number.isFinite(stamp) || Date.now() - stamp > 900000) {
    await i.reply({ content: "This panel belongs to another user or expired. Open logging config again.", flags: 64 }); return true;
  }
  await i.deferUpdate();
  try {
    const action = parts[1];
    if (action === "setting") {
      const choice = i.values[0];
      if (choice === "toggle") {
        if (state(i.guild).enabled) disable(i.guild);
        else await enable(i.guild);
      } else if (choice === "setup") await enable(i.guild);
      else if (choice === "ignoreEmbeds" || choice === "ignoreVoice") {
        const lg = state(i.guild); lg[choice] = !lg[choice]; saveDB();
      } else if (choice.startsWith("toggle:")) {
        const key = choice.slice("toggle:".length); selected(key);
        const lg = state(i.guild), next = !isActive(i.guild, key);
        for (const event of categories[key]) lg.events[event] = next;
        if (next) lg.enabled = true;
        else if (!Object.values(categories).some(events => events.some(event => lg.events[event]))) lg.enabled = false;
        saveDB();
      }
      await i.editReply(panel(i.guild, i.user, null, stamp));
      return true;
    }
    if (action === "choose-channel") {
      const choice = i.values[0];
      await i.editReply(panel(i.guild, i.user, choice === "category" ? "category" : choice, stamp));
      return true;
    }
    if (action === "pick") await setChannel(i.guild, parts[2], i.values[0]);
    else if (action === "pick-category") await setCategory(i.guild, i.values[0]);
    else return false;
    await i.editReply(panel(i.guild, i.user, null, stamp));
    return true;
  } catch (error) {
    const response = { content: `Logging update failed: ${error.message}`, flags: 64, allowedMentions: { parse: [] } };
    if (i.deferred || i.replied) await i.followUp(response);
    else await i.reply(response);
  }
  return true;
}
globalThis.soezyLogging = { categories, routes, enable, disable, setChannel, setCategory, panel, interaction };
})();
