const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "economy",
  data: new SlashCommandBuilder()
    .setName("rob")
    .setDescription("Attempt to rob coins from another user")
    .addUserOption(o => o.setName("user").setDescription("User to rob").setRequired(true))
};
