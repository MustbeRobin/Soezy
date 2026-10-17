const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("economy")
    .setDescription("Manage the economy system")
    .addSubcommand(s => s.setName("config").setDescription("Open the economy configuration panel"))
};
