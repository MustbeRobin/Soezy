const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "utility",
  data: // ========== UTILITY SLASH COMMANDS ==========
  new SlashCommandBuilder()
    .setName("banner")
    .setDescription("View the profile banner of a user")
    .addStringOption(o => o
      .setName("type")
      .setDescription("Choose server banner or global banner")
      .addChoices(
        { name: "Server banner", value: "server" },
        { name: "Global banner", value: "global" },
      ))
    .addUserOption(o => o.setName("user").setDescription("The user whose banner to view (defaults to yourself)"))
};
