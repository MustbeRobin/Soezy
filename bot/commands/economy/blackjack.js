const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "economy",
  data: new SlashCommandBuilder()
    .setName("blackjack")
    .setDescription("Play a game of Blackjack")
    .addIntegerOption(o => o.setName("bet").setDescription("Amount of coins to bet").setRequired(true).setMinValue(1))
};
