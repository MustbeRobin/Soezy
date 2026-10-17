const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  cooldown: 8000,
  data: new SlashCommandBuilder()
    .setName("simprate")
    .setDescription("Rate someone's simp levels")
    .addUserOption(o => o.setName("user").setDescription("User to rate"))
};
