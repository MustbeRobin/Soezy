const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("View detailed statistics and information about the bot")
};
