const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  cooldown: 8000,
  data: new SlashCommandBuilder()
    .setName("howhot")
    .setDescription("Check someone's hotness score")
    .addUserOption(o => o.setName("user").setDescription("User to rate"))
};
