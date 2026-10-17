const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "economy",
  data: new SlashCommandBuilder()
    .setName("work")
    .setDescription("Work to earn some coins")
};
