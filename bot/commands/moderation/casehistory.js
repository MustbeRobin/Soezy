const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("casehistory")
    .setDescription("View moderation case history for a user")
    .addUserOption(o => o.setName("user").setDescription("The user to view cases for").setRequired(true))
};
