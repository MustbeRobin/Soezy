const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  publishSlash: false,
  data: new SlashCommandBuilder()
    .setName("bn")
    .setDescription("View the profile banner of a user")
    .addUserOption(o => o.setName("user").setDescription("The user whose banner to view (defaults to yourself)"))
};
