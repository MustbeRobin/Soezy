const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  cooldown: 8000,
  data: new SlashCommandBuilder()
    .setName("gayrate")
    .setDescription("Rate someone's rainbow energy")
    .addUserOption(o => o.setName("user").setDescription("User to rate"))
};
