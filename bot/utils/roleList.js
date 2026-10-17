"use strict";

const { ContainerBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const PAGE_SIZE = 15;
const LIFETIME = 15 * 60 * 1000;

function plainName(value) {
  return String(value || "Unknown").replace(/[`\r\n]/g, " ").replace(/@/g, "@\u200b");
}

function buildRoleList(guild, requester, requestedPage, expiresAt, emojis) {
  const roles = [...guild.roles.cache.values()].sort((a, b) => b.comparePositionTo(a));
  const pages = Math.max(1, Math.ceil(roles.length / PAGE_SIZE));
  const page = Math.max(1, Math.min(requestedPage, pages));
  const offset = (page - 1) * PAGE_SIZE;
  const lines = roles.slice(offset, offset + PAGE_SIZE).map((role, index) =>
    `\`${String(offset + index + 1).padStart(2, "0")}.\` \`${plainName(role.name)}\``);
  const button = (slot, action, emoji, disabled = false) => new ButtonBuilder()
    .setCustomId(`rolelist_${requester.id}_${expiresAt}_${action}_${slot}`)
    .setEmoji(emoji).setStyle(action === "close" ? ButtonStyle.Danger : ButtonStyle.Secondary)
    .setDisabled(disabled);
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`### ${emojis.customroles} Roles List - \`${roles.length}\``))
    .addSeparatorComponents(s => s.setDivider(true))
    .addTextDisplayComponents(t => t.setContent(lines.join("\n") || "No roles found."))
    .addSeparatorComponents(s => s.setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button("first", "1", emojis.sbackword, page === 1),
      button("previous", String(Math.max(1, page - 1)), emojis.sback, page === 1),
      button("close", "close", emojis.no),
      button("next", String(Math.min(pages, page + 1)), emojis.snext, page === pages),
      button("last", String(pages), emojis.sforward, page === pages)
    ))
    .addSeparatorComponents(s => s.setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`-# Requested by \`${plainName(requester.username)}\` | Page ${page}/${pages}`));
  return { components: [container], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [], repliedUser: false } };
}

async function sendRoleList(msg, emojis) {
  await msg.guild.roles.fetch();
  return msg.reply(buildRoleList(msg.guild, msg.author, 1, Date.now() + LIFETIME, emojis));
}

async function handleRoleListButton(interaction, emojis) {
  const match = /^rolelist_(\d+)_(\d+)_(close|[1-9]\d*)_(first|previous|close|next|last)$/.exec(interaction.customId || "");
  if (!match || !interaction.guild || !Number.isSafeInteger(Number(match[2])) ||
      (match[3] !== "close" && !Number.isSafeInteger(Number(match[3])))) {
    return interaction.reply({ content: "Invalid role list.", flags: MessageFlags.Ephemeral });
  }
  if (interaction.user.id !== match[1]) {
    return interaction.reply({ content: "Only the person who opened this list can use its buttons.", flags: MessageFlags.Ephemeral });
  }
  if (Date.now() >= Number(match[2])) {
    return interaction.reply({ content: "This role list has expired. Run the command again.", flags: MessageFlags.Ephemeral });
  }
  await interaction.deferUpdate();
  try {
    if (match[3] === "close") return await interaction.deleteReply();
    await interaction.guild.roles.fetch();
    return await interaction.editReply(buildRoleList(interaction.guild, interaction.user, Number(match[3]), Number(match[2]), emojis));
  } catch {
    return interaction.followUp({ content: "Could not update this role list. Run the command again.", flags: MessageFlags.Ephemeral }).catch(() => {});
  }
}

module.exports = { buildRoleList, sendRoleList, handleRoleListButton };
