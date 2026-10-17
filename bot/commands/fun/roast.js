const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  cooldown: 8000,
  data: new SlashCommandBuilder()
    .setName("roast")
    .setDescription("Roast someone lightly")
    .addUserOption(o => o.setName("user").setDescription("User to roast").setRequired(true))
};
