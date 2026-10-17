const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View warnings for a user in this server")
    .addUserOption(o => o.setName("user").setDescription("The user to check warnings for (defaults to yourself)"))
};
