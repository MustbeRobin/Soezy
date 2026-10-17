const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  data: new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a coin and get heads or tails")
};
