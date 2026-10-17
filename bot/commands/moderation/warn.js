const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Issue a warning to a user in this server")
    .addUserOption(o => o.setName("user").setDescription("The user to warn").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for the warning"))
};
