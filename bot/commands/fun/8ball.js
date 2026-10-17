const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  data: // ========== FUN SLASH COMMANDS ==========
  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the magic 8-ball a question")
    .addStringOption(o => o.setName("question").setDescription("Your question for the 8-ball").setRequired(true))
};
