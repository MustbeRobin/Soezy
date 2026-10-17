const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  data: new SlashCommandBuilder()
    .setName("fasttype")
    .setDescription("Race to type the shown word within 15 seconds"),
};
