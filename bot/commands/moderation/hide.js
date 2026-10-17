const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("hide")
    .setDescription("Hide a channel from everyone (deny view permissions)")
    .addChannelOption(o => o.setName("channel").setDescription("Channel to hide (defaults to current)"))
};
