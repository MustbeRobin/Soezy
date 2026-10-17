const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("invite")
    .setDescription("Get the bot invite link and support server link")
};
