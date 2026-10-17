const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  data: new SlashCommandBuilder()
    .setName("wordle")
    .setDescription("Play a Wordle game — guess the 5-letter word")
};
