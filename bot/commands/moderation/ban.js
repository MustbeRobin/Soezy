const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Permanently ban a user from this server")
    .addUserOption(o => o.setName("user").setDescription("The user to ban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for the ban"))
};
