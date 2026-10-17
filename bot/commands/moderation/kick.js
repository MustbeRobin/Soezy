const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a user from this server")
    .addUserOption(o => o.setName("user").setDescription("The user to kick").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for the kick"))
};
