const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "economy",
  data: new SlashCommandBuilder()
    .setName("slots")
    .setDescription("Play the slot machine")
    .addIntegerOption(o => o.setName("bet").setDescription("Amount of coins to bet").setRequired(true).setMinValue(1))
};
