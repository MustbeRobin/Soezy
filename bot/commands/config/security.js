const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("security")
    .setDescription("Manage the security protection system")
    .addSubcommand(s => s.setName("message-limit").setDescription("Block messages longer than a character limit using Discord AutoMod")
      .addIntegerOption(o => o.setName("limit").setDescription("Characters allowed; 0 disables the limit").setRequired(true).setMinValue(0).setMaxValue(4000))
      .addChannelOption(o => o.setName("channel").setDescription("Optional channel; omit for the server-wide default")))
    .addSubcommand(s => s.setName("config").setDescription("Open the security configuration panel"))
};
