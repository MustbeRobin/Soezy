const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  data: new SlashCommandBuilder()
    .setName("trivia")
    .setDescription("Play a trivia game with a random question")
};
