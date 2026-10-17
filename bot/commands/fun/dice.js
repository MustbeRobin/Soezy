const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "fun",
  data: new SlashCommandBuilder()
    .setName("dice")
    .setDescription("Roll a dice")
    .addIntegerOption(o => o.setName("sides").setDescription("Number of sides on the dice (default: 6)").setMinValue(2).setMaxValue(100))
};
