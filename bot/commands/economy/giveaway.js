const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "economy",
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Create and manage giveaways in this server")
    .addSubcommand(s => s.setName("create").setDescription("Start a new giveaway interactively in this channel"))
    .addSubcommand(s => s.setName("config").setDescription("Configure giveaway roles"))
    .addSubcommand(s => s.setName("end").setDescription("End a giveaway early and pick winners")
      .addStringOption(o => o.setName("id").setDescription("Giveaway message ID to end").setRequired(true)))
    .addSubcommand(s => s.setName("reroll").setDescription("Reroll winners for an ended giveaway")
      .addStringOption(o => o.setName("id").setDescription("Giveaway message ID to reroll").setRequired(true)))
    .addSubcommand(s => s.setName("cancel").setDescription("Cancel an active giveaway without picking winners")
      .addStringOption(o => o.setName("id").setDescription("Giveaway message ID to cancel").setRequired(true)))
    .addSubcommand(s => s.setName("list").setDescription("List all currently active giveaways in this server"))
};
