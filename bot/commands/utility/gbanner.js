const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  publishSlash: false,
  data: new SlashCommandBuilder()
    .setName("gbanner")
    .setDescription("View a user's global banner")
    .addUserOption(o => o.setName("user").setDescription("The user whose global banner to view (defaults to yourself)"))
};
