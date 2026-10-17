const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("welcome")
    .setDescription("Manage the welcome message system")
    .addSubcommand(s => s.setName("config").setDescription("Open the welcome system configuration panel"))
};
