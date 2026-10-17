const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("media")
    .setDescription("Manage media-only channels")
    .addSubcommand(s => s.setName("config").setDescription("Open the media channels configuration panel"))
};
