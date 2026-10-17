const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  data: new SlashCommandBuilder()
    .setName("ship")
    .setDescription("Ship two users together and get a love score")
    .addUserOption(o => o.setName("user1").setDescription("First user to ship").setRequired(true))
    .addUserOption(o => o.setName("user2").setDescription("Second user to ship (defaults to you)"))
};
