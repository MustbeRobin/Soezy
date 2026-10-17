const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Manage the ticket system")
    .addSubcommand(s => s.setName("config").setDescription("Open the ticket system configuration panel"))
};
