const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("sticky")
    .setDescription("Configure sticky messages in channels")
    .addSubcommand(s => s.setName("config").setDescription("Open sticky configuration panel")),
};
