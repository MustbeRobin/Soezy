const { SlashCommandBuilder } = require("discord.js");

function buildRoleBulkCommand(name, description) {
  const command = {
    category: "roles",
    data: new SlashCommandBuilder()
      .setName(name)
      .setDescription(description)
      .addSubcommand(s => s
        .setName("add")
        .setDescription("Add a role to the matching members")
        .addRoleOption(o => o.setName("role").setDescription("Role to add").setRequired(true)))
      .addSubcommand(s => s
        .setName("remove")
        .setDescription("Remove a role from the matching members")
        .addRoleOption(o => o.setName("role").setDescription("Role to remove").setRequired(true)))
  };
  if (name === "massrole") {
    command.data.options[0].addStringOption(o => o
      .setName("scope")
      .setDescription("Members to update")
      .addChoices(
        { name: "Everyone", value: "all" },
        { name: "Humans only", value: "human" },
        { name: "Bots only", value: "bot" }
      )
      .setRequired(false));
    command.data.options[1].addStringOption(o => o
      .setName("scope")
      .setDescription("Members to update")
      .addChoices(
        { name: "Everyone", value: "all" },
        { name: "Humans only", value: "human" },
        { name: "Bots only", value: "bot" }
      )
      .setRequired(false));
  }
  return command;
}

module.exports = [
  buildRoleBulkCommand("humanrole", "Add or remove a role for all human members"),
  buildRoleBulkCommand("botrole", "Add or remove a role for all bot members"),
  buildRoleBulkCommand("massrole", "Add or remove a role for all members"),
  buildRoleBulkCommand("memberrole", "Alias for mass role changes"),
];
