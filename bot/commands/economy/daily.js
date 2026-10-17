const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "economy",
  data: // ========== ECONOMY SLASH COMMANDS ==========
  new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily economy reward")
};
