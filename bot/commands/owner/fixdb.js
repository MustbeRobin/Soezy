const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "owner",
  data: // ── Bot owner only — database repair & migration tool ──
  new SlashCommandBuilder()
    .setName("fixdb")
    .setDescription("(Bot Owner Only) Repair and convert the database to global user structure")
};
