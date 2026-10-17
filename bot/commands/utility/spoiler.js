const { SlashCommandBuilder } = require("discord.js");

const command = new SlashCommandBuilder()
  .setName("spoiler")
  .setDescription("Post a tagged-user-only spoiler with a private reveal button")
  .addUserOption(option => option
    .setName("user")
    .setDescription("First user allowed to reveal the spoiler")
    .setRequired(false))
  .addUserOption(option => option
    .setName("user2")
    .setDescription("Second user allowed to reveal the spoiler")
    .setRequired(false))
  .addUserOption(option => option
    .setName("user3")
    .setDescription("Third user allowed to reveal the spoiler")
    .setRequired(false))
  .addUserOption(option => option
    .setName("user4")
    .setDescription("Fourth user allowed to reveal the spoiler")
    .setRequired(false))
  .addUserOption(option => option
    .setName("user5")
    .setDescription("Fifth user allowed to reveal the spoiler")
    .setRequired(false))
  .addStringOption(option => option
    .setName("message")
    .setDescription("The private spoiler text")
    .setMaxLength(2000)
    .setRequired(false))
  .addAttachmentOption(option => option
    .setName("attachment")
    .setDescription("Optional private image or file")
    .setRequired(false))
  .addBooleanOption(option => option
    .setName("anonymous")
    .setDescription("Hide your name from the channel spoiler message")
    .setRequired(false));

module.exports = {
  category: "utility",
  data: command,
};
