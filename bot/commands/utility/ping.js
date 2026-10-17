const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Check the bot's latency and response time")
};
