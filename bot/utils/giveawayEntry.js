"use strict";
const { MessageFlags } = require("discord.js");
const queues = new Map();


async function handleEntry(interaction, deps) {
  // Acknowledge before any fetch or queued work so Discord's token stays valid.
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const id = interaction.customId.slice("giveaway_enter_".length);
  const key = `${interaction.guildId}:${id}`;
  const task = (queues.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
    const gd = deps.guildData(interaction.guildId);
    const data = gd.giveaways?.[id] || deps.giveaways.get(id);
    const respond = (title, message, error = false) => interaction.editReply({
      components: [deps.reply(error ? "error" : "success", title, message)], flags: MessageFlags.IsComponentsV2,
    });
    if (!data || data.guildId !== interaction.guildId || data.messageId !== interaction.message.id) return respond("Giveaway Not Found", "This giveaway is no longer available.", true);
    if (data.ended || data.cancelled || data.endTime <= Date.now()) return respond("Giveaway Ended", "Entries are closed for this giveaway.", true);
    let member = interaction.member;
    if (data.requireRole || data.blacklistRole) member = await interaction.guild.members.fetch(interaction.user.id);
    if (data.blacklistRole && member.roles.cache.has(data.blacklistRole)) return respond("Not Eligible", "You have a role excluded from this giveaway.", true);
    if (data.requireRole && !member.roles.cache.has(data.requireRole)) return respond("Role Required", `You need <@&${data.requireRole}> to enter.`, true);
    // Recheck after the member fetch; the giveaway may have ended in the meantime.
    if (data.ended || data.cancelled || data.endTime <= Date.now()) return respond("Giveaway Ended", "Entries are closed for this giveaway.", true);
    const entries = new Set(Array.isArray(data.participants) ? data.participants : []);
    const leaving = entries.has(interaction.user.id);
    if (leaving) entries.delete(interaction.user.id);
    else entries.add(interaction.user.id);
    data.participants = [...entries];
    gd.giveaways ||= {};
    gd.giveaways[id] = data;
    deps.giveaways.set(id, data);
    deps.saveDB(interaction.guildId);
    try {
      const payload = { components: [deps.render(data)], flags: MessageFlags.IsComponentsV2 };
      if (!interaction.message.flags?.has?.(MessageFlags.IsComponentsV2)) Object.assign(payload, { content: null, embeds: [] });
      await interaction.message.edit(payload);
    } catch (error) {
      console.error(`[Giveaway] Entry saved but counter update failed: ${error.message}`);
    }
    return respond(leaving ? "Left Giveaway" : "Joined Giveaway", leaving
      ? `You left **${data.prize}**. You can rejoin before it ends.`
      : `You entered **${data.prize}**.\n**Total entries:** ${data.participants.length}`);
  });
  queues.set(key, task);
  try { return await task; }
  catch (error) {
    console.error(`[Giveaway] Entry failed: ${error.message}`);
    return interaction.editReply({ components: [deps.reply("error", "Entry Failed", "Unable to process your entry. Please try again.")], flags: MessageFlags.IsComponentsV2 });
  } finally { if (queues.get(key) === task) queues.delete(key); }
}

module.exports = { handleEntry };
