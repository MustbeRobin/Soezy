const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Temporarily mute a user in this server")
    .addUserOption(o => o.setName("user").setDescription("The user to mute").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Mute duration (e.g. 10m, 1h, 1d)").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for the mute"))
};
