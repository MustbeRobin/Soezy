const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("View detailed information about this server")
};
