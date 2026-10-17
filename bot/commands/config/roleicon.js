const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  category: "config",
  data: new SlashCommandBuilder()
    .setName("roleicon")
    .setDescription("Add, edit, or remove a role icon")
    .addSubcommand(sub => sub
      .setName("add")
      .setDescription("Add an icon to a role")
      .addRoleOption(option => option.setName("role").setDescription("Role to update").setRequired(true))
      .addAttachmentOption(option => option.setName("image").setDescription("Role icon image").setRequired(false))
      .addStringOption(option => option.setName("url").setDescription("Role icon image URL").setRequired(false)))
    .addSubcommand(sub => sub
      .setName("edit")
      .setDescription("Replace a role icon")
      .addRoleOption(option => option.setName("role").setDescription("Role to update").setRequired(true))
      .addAttachmentOption(option => option.setName("image").setDescription("New role icon image").setRequired(false))
      .addStringOption(option => option.setName("url").setDescription("New role icon image URL").setRequired(false)))
    .addSubcommand(sub => sub
      .setName("remove")
      .setDescription("Remove a role icon")
      .addRoleOption(option => option.setName("role").setDescription("Role to update").setRequired(true))),
};
