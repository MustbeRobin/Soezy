const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("tempvoice")
    .setDescription("Manage temporary voice channels")
    .addSubcommand(s => s.setName("config").setDescription("Open the temp voice configuration panel"))
};
