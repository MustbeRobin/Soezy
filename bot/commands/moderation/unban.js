const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: // ========== MODERATION SLASH COMMANDS ==========
  new SlashCommandBuilder()
    .setName("unban")
    .setDescription("Unban a user from this server by their user ID")
    .addStringOption(o => o.setName("user_id").setDescription("The user ID to unban").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason for the unban"))
};
