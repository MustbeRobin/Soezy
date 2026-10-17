const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("clearwarns")
    .setDescription("Clear all warnings from a user")
    .addUserOption(o => o.setName("user").setDescription("The user to clear warnings for").setRequired(true))
};
