const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("View the full-size avatar of a user")
    .addStringOption(o => o
      .setName("type")
      .setDescription("Choose server avatar or global avatar")
      .addChoices(
        { name: "Server avatar", value: "server" },
        { name: "Global avatar", value: "global" },
      ))
    .addUserOption(o => o.setName("user").setDescription("The user whose avatar to view (defaults to yourself)"))
};
