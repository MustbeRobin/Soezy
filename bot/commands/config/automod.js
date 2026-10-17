const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure AutoMod protection")
    .addSubcommand(s => s.setName("message-limit").setDescription("Set the maximum message length")
      .addIntegerOption(o => o.setName("limit").setDescription("Characters allowed; 0 disables the limit").setRequired(true).setMinValue(0).setMaxValue(4000))
      .addChannelOption(o => o.setName("channel").setDescription("Optional channel; omit for the server-wide default")))
    .addSubcommand(s => s.setName("config").setDescription("Open the automod configuration panel"))
};
