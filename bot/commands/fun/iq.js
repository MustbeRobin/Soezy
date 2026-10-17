const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  cooldown: 8000,
  data: new SlashCommandBuilder()
    .setName("iq")
    .setDescription("Generate a very scientific IQ score")
    .addUserOption(o => o.setName("user").setDescription("User to rate"))
};
