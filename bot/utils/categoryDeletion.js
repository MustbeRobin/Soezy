"use strict";

const { ChannelType } = require("discord.js");

const pendingCategoryDeletes = globalThis.__soezyPendingCategoryDeletes || new Map();
globalThis.__soezyPendingCategoryDeletes = pendingCategoryDeletes;

function categoryChannels(guild, source = guild?.channels?.cache) {
  if (!source?.values) return [];
  return [...source.values()].filter(channel => channel?.parentId);
}

function resolveCategory(guild, query, source = guild?.channels?.cache) {
  const input = String(query || "").trim();
  if (!guild || !input || !source?.get || !source?.values) return { category: null, ambiguous: false };
  const id = input.match(/^<#?(\d{17,20})>?$/)?.[1] || ( /^\d{17,20}$/.test(input) ? input : null );
  const isCategory = channel => channel?.type === ChannelType.GuildCategory;
  if (id) {
    const category = source.get(id);
    return { category: isCategory(category) ? category : null, ambiguous: false };
  }
  const matches = [...source.values()].filter(channel =>
    isCategory(channel) && String(channel.name || "").toLowerCase() === input.toLowerCase()
  );
  return { category: matches.length === 1 ? matches[0] : null, ambiguous: matches.length > 1 };
}

function categoryDeleteKey(guildId, channelId, categoryId, ownerId) {
  return `${guildId}:${channelId}:${categoryId}:${ownerId}`;
}

function setPendingCategoryDelete(key, value, now = Date.now()) {
  for (const [savedKey, pending] of pendingCategoryDeletes) {
    if (pending.expiresAt <= now) pendingCategoryDeletes.delete(savedKey);
  }
  if (!pendingCategoryDeletes.has(key) && pendingCategoryDeletes.size >= 1000) {
    pendingCategoryDeletes.delete(pendingCategoryDeletes.keys().next().value);
  }
  pendingCategoryDeletes.set(key, { ...value, expiresAt: now + 5 * 60 * 1000 });
}

function getPendingCategoryDelete(key, now = Date.now()) {
  const pending = pendingCategoryDeletes.get(key);
  if (!pending) return null;
  if (pending.expiresAt <= now) {
    pendingCategoryDeletes.delete(key);
    return null;
  }
  return pending;
}

async function deleteCategoryChannels(guild, categoryId, reason, expectedIds) {
  const channels = await guild.channels.fetch();
  const category = channels?.get?.(categoryId) || guild.channels.cache.get(categoryId);
  if (!category || category.type !== ChannelType.GuildCategory) {
    throw new Error("That category no longer exists.");
  }

  const children = categoryChannels(guild, channels || guild.channels.cache)
    .filter(channel => channel.parentId === category.id);
  if (expectedIds && (children.length !== expectedIds.length || children.some(channel => !expectedIds.includes(channel.id)))) {
    throw new Error("The category contents changed. Run the command again to review the current channels.");
  }
  const blocked = [category, ...children].filter(channel => channel.deletable === false);
  if (blocked.length) {
    throw new Error(`I cannot delete ${blocked.length} channel${blocked.length === 1 ? "" : "s"}; check Manage Channels and channel permissions.`);
  }

  const deletedChannels = [];
  try {
    for (const channel of children) {
      await channel.delete(reason);
      deletedChannels.push(channel.id);
    }
    await category.delete(reason);
  } catch (error) {
    error.deletedCategoryChannels = deletedChannels.length;
    error.categoryChannelCount = children.length;
    throw error;
  }
  return { categoryName: category.name, deletedChannels: deletedChannels.length };
}

module.exports = {
  categoryChannels,
  resolveCategory,
  categoryDeleteKey,
  setPendingCategoryDelete,
  getPendingCategoryDelete,
  deleteCategoryChannels,
};
