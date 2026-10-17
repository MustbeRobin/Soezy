const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("send")
    .setDescription("Send a message or image through the bot")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages | PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub
      .setName("message")
      .setDescription("Send a normal message through the bot")
      .addStringOption(o => o
        .setName("content")
        .setDescription("Message content")
        .setRequired(true)
        .setMaxLength(2000))
      .addStringOption(o => o
        .setName("reply_message_id")
        .setDescription("Message ID to reply to in the target channel")
        .setMaxLength(32)
        .setRequired(false))
      .addChannelOption(o => o
        .setName("channel")
        .setDescription("Channel to send in (defaults to current channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false))
      .addUserOption(o => o
        .setName("author")
        .setDescription("User name/avatar to copy (defaults to you)")
        .setRequired(false))
      .addStringOption(o => o
        .setName("username")
        .setDescription("Custom sender name")
        .setMaxLength(80)
        .setRequired(false))
      .addStringOption(o => o
        .setName("avatar_url")
        .setDescription("Custom sender avatar URL")
        .setRequired(false)))
    .addSubcommand(sub => sub
      .setName("image")
      .setDescription("Send an image through the bot")
      .addAttachmentOption(o => o
        .setName("attachment")
        .setDescription("Image attachment to send")
        .setRequired(false))
      .addStringOption(o => o
        .setName("url")
        .setDescription("Image URL to send")
        .setRequired(false))
      .addStringOption(o => o
        .setName("caption")
        .setDescription("Optional image caption")
        .setMaxLength(2000)
        .setRequired(false))
      .addStringOption(o => o
        .setName("reply_message_id")
        .setDescription("Message ID to reply to in the target channel")
        .setMaxLength(32)
        .setRequired(false))
      .addChannelOption(o => o
        .setName("channel")
        .setDescription("Channel to send in (defaults to current channel)")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false))
      .addUserOption(o => o
        .setName("author")
        .setDescription("User name/avatar to copy (defaults to you)")
        .setRequired(false))
      .addStringOption(o => o
        .setName("username")
        .setDescription("Custom sender name")
        .setMaxLength(80)
        .setRequired(false))
      .addStringOption(o => o
        .setName("avatar_url")
        .setDescription("Custom sender avatar URL")
        .setRequired(false))),
};
