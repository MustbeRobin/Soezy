const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  data: new SlashCommandBuilder()
    .setName("rps")
    .setDescription("Play Rock Paper Scissors against the bot or another user")
    .addUserOption(o => o.setName("opponent").setDescription("User to play against (leave blank to play vs bot)"))
};
