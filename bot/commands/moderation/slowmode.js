const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Set slowmode for a channel")
    .addStringOption(o => o.setName("duration").setDescription("Duration (e.g. 5s, 1m) or 'off' to disable").setRequired(true))
    .addChannelOption(o => o.setName("channel").setDescription("Channel to apply slowmode to (defaults to current)"))
};
