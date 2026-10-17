const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View detailed information about a user")
    .addUserOption(o => o.setName("user").setDescription("The user to look up (defaults to yourself)"))
};
