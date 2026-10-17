const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock a channel so members cannot send messages")
    .addChannelOption(o => o.setName("channel").setDescription("Channel to lock (defaults to current)"))
    .addStringOption(o => o.setName("reason").setDescription("Reason for locking the channel"))
};
