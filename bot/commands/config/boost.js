const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("boost")
    .setDescription("Manage the boost message system")
    .addSubcommand(s => s.setName("config").setDescription("Open the boost message configuration panel"))
};
