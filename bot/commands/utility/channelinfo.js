const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("channelinfo")
    .setDescription("View detailed information about a channel")
    .addChannelOption(o => o.setName("channel").setDescription("The channel to get information about (defaults to current)"))
};
