const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("wall")
    .setDescription("Manage the wall (quarantine) system")
    .addSubcommand(s => s.setName("config").setDescription("Open the wall system configuration panel"))
};
