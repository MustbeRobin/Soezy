const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("unhide")
    .setDescription("Unhide a hidden channel (restore view permissions)")
    .addChannelOption(o => o.setName("channel").setDescription("Channel to unhide (defaults to current)"))
};
