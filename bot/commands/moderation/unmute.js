const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Remove the mute from a user in this server")
    .addUserOption(o => o.setName("user").setDescription("The user to unmute").setRequired(true))
};
