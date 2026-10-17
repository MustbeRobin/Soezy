const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "owner",
  data: // ── Bot owner only — clear a user's points ──
  new SlashCommandBuilder()
    .setName("clearpoints")
    .setDescription("(Bot Owner Only) Clear a user's points")
    .addUserOption(o => o.setName("user").setDescription("The user to clear points for").setRequired(true))
    .addStringOption(o => o.setName("type").setDescription("Which points to clear (default: all)")
      .addChoices(
        { name: "All Points",    value: "all"    },
        { name: "Dev Points",    value: "dev"    },
        { name: "Invite Points", value: "invite" }
      ))
};
