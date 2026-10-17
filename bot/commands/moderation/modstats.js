const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("modstats")
    .setDescription("View moderation statistics for this server or a moderator")
    .addUserOption(o => o.setName("moderator").setDescription("Moderator to check stats for"))
};
