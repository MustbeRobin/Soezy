const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "moderation",
  data: new SlashCommandBuilder()
    .setName("purge")
    .setDescription("Bulk delete messages from the current channel")
    .addIntegerOption(o => o.setName("amount").setDescription("Number of messages to delete (1-100)").setRequired(true))
    .addUserOption(o => o.setName("user").setDescription("Only delete messages from this specific user"))
    .addStringOption(o => o.setName("type").setDescription("Filter the type of messages to delete")
      .addChoices(
        { name: "All", value: "all" },
        { name: "Images Only", value: "images" },
        { name: "Bot Messages", value: "bots" },
        { name: "Embeds Only", value: "embeds" },
        { name: "Links Only", value: "links" },
        { name: "Text Only (No Media)", value: "text" }
      ))
};
