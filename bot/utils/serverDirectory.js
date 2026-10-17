"use strict";
const { ContainerBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, ChannelType, PermissionsBitField, escapeMarkdown } = require("discord.js");

function rankedGuilds(client) {
  return [...client.guilds.cache.values()].sort((a, b) =>
    (b.memberCount || 0) - (a.memberCount || 0) || a.id.localeCompare(b.id));
}

async function handleServerDirectory(msg, args, prefix, { client, config, invite = false }) {
  const reply = (title, body) => msg.reply({
    components: [new ContainerBuilder()
      .addTextDisplayComponents(t => t.setContent(`### ${title}`))
      .addSeparatorComponents(s => s.setDivider(true))
      .addTextDisplayComponents(t => t.setContent(body))],
    flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] }
  });
  if (!config.ownerIds?.includes(msg.author.id)) return reply("Access Denied", "Bot owners only.");
  const guilds = rankedGuilds(client);
  if (invite) {
    if (args.length !== 2 || args[0]?.toLowerCase() !== "server" || !/^[1-9]\d*$/.test(args[1])) {
      return reply("Server Invite", `Use \`${prefix}link server <rank>\`.`);
    }
    const rank = Number(args[1]);
    const guild = guilds[rank - 1];
    if (!guild) return reply("Server Not Found", "That rank is not in the current server list.");
    try {
      const me = guild.members.me || await guild.members.fetchMe();
      const channels = await guild.channels.fetch();
      const channel = channels.find(c => c?.type === ChannelType.GuildText &&
        c.permissionsFor(me)?.has([PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.CreateInstantInvite]));
      if (!channel) return reply("Invite Unavailable", "I need View Channel and Create Invite permission in a text channel of that server.");
      const link = await channel.createInvite({ maxAge: 3600, maxUses: 1, unique: true, reason: "Bot owner requested ranked server invite" });
      return reply("Server Invite", `**#${rank} ${escapeMarkdown(guild.name)}**\n${link.url || `https://discord.gg/${link.code}`}\nExpires in one hour; one use.`);
    } catch {
      return reply("Invite Unavailable", "Discord could not create an invite for that server. Check the bot permissions and try again.");
    }
  }
  if (args.length > 1 || (args.length && !/^[1-9]\d*$/.test(args[0]))) return reply("Server Ranking", `Use \`${prefix}totleserver [page]\`.`);
  const page = Number(args[0] || 1);
  const pages = Math.max(1, Math.ceil(guilds.length / 15));
  if (page > pages) return reply("Invalid Page", `Choose a page from 1 to ${pages}.`);
  return msg.reply(buildServerPage(client, msg.author.id, page, prefix));
}

function buildServerPage(client, ownerId, requestedPage, prefix) {
  const guilds = rankedGuilds(client);
  const pages = Math.max(1, Math.ceil(guilds.length / 15));
  const page = Math.max(1, Math.min(requestedPage, pages));
  const offset = (page - 1) * 15;
  const lines = guilds.slice(offset, offset + 15).map((g, i) => `**#${offset + i + 1} ${escapeMarkdown(g.name)}** - ${g.memberCount || 0} members`);
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent("### Total Servers"))
    .addSeparatorComponents(s => s.setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`**Joined servers: ${guilds.length}**\n\n${lines.join("\n") || "No servers joined."}\n\nPage ${page}/${pages}\nInvite: \`${prefix}link server <rank>\`\n-# Ranks use current member counts and may change.`))
    .addSeparatorComponents(s => s.setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`serverpage_${ownerId}_${Math.max(1, page - 1)}`).setLabel("Previous").setStyle(ButtonStyle.Secondary).setDisabled(page === 1),
      new ButtonBuilder().setCustomId(`serverpage_label_${ownerId}`).setLabel(`${page} / ${pages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
      new ButtonBuilder().setCustomId(`serverpage_${ownerId}_${page + 1}`).setLabel("Next").setStyle(ButtonStyle.Secondary).setDisabled(page === pages)
    ));
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

async function handleServerPage(interaction, { client, config, prefix }) {
  const match = /^serverpage_([^_]+)_([1-9]\d*)$/.exec(interaction.customId || "");
  if (!match || !Number.isSafeInteger(Number(match[2]))) return interaction.reply({ content: "Invalid page.", flags: MessageFlags.Ephemeral });
  if (interaction.user.id !== match[1] || !config.ownerIds?.includes(interaction.user.id)) {
    return interaction.reply({ content: "Only the bot owner who opened this list can change pages.", flags: MessageFlags.Ephemeral });
  }
  return interaction.update(buildServerPage(client, match[1], Number(match[2]), prefix));
}

module.exports = { rankedGuilds, handleServerDirectory, buildServerPage, handleServerPage };
