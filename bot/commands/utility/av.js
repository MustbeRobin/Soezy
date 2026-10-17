const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  publishSlash: false,
  data: new SlashCommandBuilder()
    .setName("av")
    .setDescription("View the full-size avatar of a user")
    .addUserOption(o => o.setName("user").setDescription("The user whose avatar to view (defaults to yourself)"))
};
