const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  data: new SlashCommandBuilder()
    .setName("numberguess")
    .setDescription("Start a channel game where players guess a number from 1 to 100"),
};
