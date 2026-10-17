const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock a channel so members can send messages again")
    .addChannelOption(o => o.setName("channel").setDescription("Channel to unlock (defaults to current)"))
    .addStringOption(o => o.setName("reason").setDescription("Reason for unlocking the channel"))
};
