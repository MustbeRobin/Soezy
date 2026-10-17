"use strict";
const { ChannelType, PermissionFlagsBits: F } = require("discord.js");
const pending = new WeakMap();

async function fetchChannel(guild, id) {
  if (!id) return null;
  return guild.channels.cache.get(id) || guild.channels.fetch(id).catch(error => {
    if (error.code === 10003) return null;
    throw error;
  });
}

function logIds(data) {
  return [...new Set([
    data.antinuke?.logs, data.automod?.advanced?.logs,
    data.nativeAutomod?.alertChannelId, data.confession?.logChannel,
    data.confession?.logs, data.confessionLogs,
  ].filter(Boolean))];
}

async function move(channel, parent) {
  if (channel.parentId !== parent.id) {
    await channel.setParent(parent.id, { lockPermissions: false, reason: "Organize Soezy logs" });
  }
}

function ensure(guild, deps) {
  if (pending.has(guild)) return pending.get(guild);
  const job = (async () => {
    const data = deps.guildData(guild.id);
    const logging = data.logging ||= {};
    let parent = await fetchChannel(guild, logging.categoryId);
    if (parent && parent.type !== ChannelType.GuildCategory) throw new Error("The configured logs category is not a category channel.");
    if (!parent) {
      await guild.channels.fetch();
      parent = [...guild.channels.cache.values()].find(ch => ch.type === ChannelType.GuildCategory && /^(soezy|soezy logs)$/i.test(ch.name));
    }
    if (!parent) {
      const me = guild.members.me || await guild.members.fetchMe();
      if (!me.permissions.has(F.ManageChannels)) throw new Error("I need Manage Channels to create the Soezy logs category.");
      parent = await guild.channels.create({
        name: "Soezy", type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: guild.id, deny: [F.ViewChannel] },
          { id: me.id, allow: [F.ViewChannel, F.SendMessages, F.EmbedLinks, F.AttachFiles, F.ReadMessageHistory, F.ManageChannels] },
        ], reason: "Soezy log setup",
      });
    }
    logging.categoryId = parent.id;
    deps.saveDB();
    return parent;
  })().finally(() => pending.delete(guild));
  pending.set(guild, job);
  return job;
}

async function place(guild, channel, deps) {
  await move(channel, await ensure(guild, deps));
  return channel;
}

async function migrate(guild, deps) {
  const channels = [];
  for (const id of logIds(deps.guildData(guild.id))) {
    const channel = await fetchChannel(guild, id);
    if (channel?.type === ChannelType.GuildText) channels.push(channel);
  }
  if (!channels.length) return;
  const parent = await ensure(guild, deps);
  for (const channel of channels) await move(channel, parent);
}

module.exports = { ensure, place, migrate, logIds };
