const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  publishSlash: false,
  data: new SlashCommandBuilder()
    .setName("gav")
    .setDescription("View a user's global avatar")
    .addUserOption(o => o.setName("user").setDescription("The user whose global avatar to view (defaults to yourself)"))
};
