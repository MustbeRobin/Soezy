const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("removewarn")
    .setDescription("Remove a specific warning from a user")
    .addUserOption(o => o.setName("user").setDescription("The user to remove warning from").setRequired(true))
    .addStringOption(o => o.setName("warn_id").setDescription("The warning ID to remove").setRequired(true))
};
