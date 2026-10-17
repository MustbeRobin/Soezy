"use strict";
const { AsyncLocalStorage } = require("node:async_hooks");

function createEmergencyProtection(deps) {
  const now = deps.now || Date.now;
  const schedule = deps.setTimeout || setTimeout;
  const incidents = new Map();
  const windows = new Map();
  const seen = new Map();
  const exemptions = new Map();
  const snapshotRecoveryActions = new Set([
    "ban", "unban", "channelDelete", "channelUpdate", "roleDelete", "roleUpdate",
    "massRoleChange", "permschange", "guildUpdate", "webhookDelete", "webhookUpdate",
  ]);
  const context = new AsyncLocalStorage();
  const quietMs = 60000;

  function prune() {
    for (const [key, value] of windows) if (now() - value.at > 60000) windows.delete(key);
    for (const [key, time] of seen) if (now() - time > 60000) seen.delete(key);
    for (const [key, time] of exemptions) if (now() - time > 60000) exemptions.delete(key);
    for (const [key, state] of incidents) {
      if (!state.pending && !state.recovering && !state.timer && now() - state.at > quietMs) incidents.delete(key);
    }
  }

  function active(guildId) {
    const state = incidents.get(guildId);
    return !!state && (!!state.pending || state.recovering || !!state.timer || now() - state.at < quietMs);
  }

  function eligible(guild) {
    return !!guild && !!deps.config(guild.id)?.enabled && deps.enabled(guild.id);
  }

  function incident(guild) {
    let state = incidents.get(guild.id);
    if (!state || !active(guild.id)) {
      state = { guild, at: now(), pending: 0, recovering: false, timer: null, actors: new Map(), evidence: new Map(), version: 0, restored: 0 };
      incidents.set(guild.id, state);
    }
    state.at = now();
    return state;
  }

  function remember(state, evidence) {
    let added = false;
    for (const item of evidence) {
      if (state.evidence.size >= 1000) break;
      const key = item.id || `${item.action}:${item.targetId}`;
      if (state.evidence.has(key)) continue;
      state.evidence.set(key, item);
      added = true;
    }
    if (added) state.version++;
  }

  function report(guild, error) {
    deps.error?.(guild.id, error);
  }

  function queueRecovery(state) {
    if (state.timer || state.recovering) return;
    state.timer = schedule(async () => {
      state.timer = null;
      if (state.pending || now() - state.at < 5000) return queueRecovery(state);
      if ([...state.actors.values()].some(actor => actor.status !== "removed")) return;
      if (state.restored === state.version) return;
      state.recovering = true;
      const version = state.version;
      try {
        await context.run({ guildId: state.guild.id, priority: "high" }, async () => {
          // Remove only objects attributed to confirmed attackers, never all new objects.
          for (const evidence of state.evidence.values()) {
            if (evidence.cleaned) continue;
            if (evidence.action === "channelCreate") {
              const channel = await state.guild.channels.fetch(evidence.targetId).catch(error => {
                if (error.code === 10003) return null;
                throw error;
              });
              if (channel && !channel.deletable) throw new Error(`Cannot delete attacker-created channel ${channel.id}: check Manage Channels`);
              if (channel) await channel.delete("Anti-Nuke: attacker-created channel");
            } else if (evidence.action === "threadCreate") {
              const thread = await state.guild.channels.fetch(evidence.targetId).catch(error => {
                if (error.code === 10003) return null;
                throw error;
              });
              if (thread && !thread.deletable) throw new Error(`Cannot delete attacker-created thread ${thread.id}: check Manage Threads`);
              if (thread) await thread.delete("Anti-Nuke: attacker-created thread");
            } else if (evidence.action === "botAdd") {
              const member = await state.guild.members.fetch(evidence.targetId).catch(error => {
                if (error.code === 10007) return null;
                throw error;
              });
              if (member?.user?.bot) {
                if (!member.kickable) throw new Error(`Cannot remove added bot ${member.id}: check Kick Members and role hierarchy`);
                await member.kick("Anti-Nuke: unauthorized bot added by attacker");
              }
            } else if (evidence.action === "roleCreate") {
              const role = evidence.targetId ? await state.guild.roles.fetch(evidence.targetId).catch(error => {
                if (error.code === 10011) return null;
                throw error;
              }) : null;
              if (role?.editable && !role.managed) await role.delete("Anti-Nuke: attacker-created role");
            } else if (evidence.action === "ban") {
              if (!state.actors.has(evidence.targetId)) await state.guild.members.unban(evidence.targetId, "Anti-Nuke: reverse attacker ban").catch(error => { if (error.code !== 10026) throw error; });
            } else if (evidence.action === "webhookCreate") {
              const hook = await deps.fetchWebhook(evidence.targetId).catch(error => { if (error.code !== 10015) throw error; return null; });
              if (hook?.guildId === state.guild.id) await hook.delete("Anti-Nuke: attacker-created webhook");
            } else if (evidence.action === "webhookUpdate") {
              const hook = await deps.fetchWebhook(evidence.targetId).catch(error => { if (error.code !== 10015) throw error; return null; });
              if (hook?.guildId === state.guild.id) await hook.delete("Anti-Nuke: attacker-modified webhook");
            } else if (evidence.action === "emojiCreate") {
              const emoji = evidence.targetId ? await state.guild.emojis.fetch(evidence.targetId).catch(error => { if (error.code === 10014) return null; throw error; }) : null;
              if (emoji) await state.guild.emojis.delete(evidence.targetId, "Anti-Nuke: attacker-created emoji");
            } else if (evidence.action === "stickerCreate") {
              const sticker = evidence.targetId ? await state.guild.stickers.fetch(evidence.targetId).catch(error => { if (error.code === 10087) return null; throw error; }) : null;
              if (sticker) await state.guild.stickers.delete(evidence.targetId, "Anti-Nuke: attacker-created sticker");
            } else if (evidence.action === "soundboardCreate") {
              if (state.guild.soundboardSounds?.cache?.has(evidence.targetId)) await state.guild.soundboardSounds.delete(evidence.targetId);
            } else if (evidence.action === "stageCreate") {
              if (evidence.targetId && state.guild.stageInstances?.delete) await state.guild.stageInstances.delete(evidence.targetId);
            } else if (evidence.action === "autoModerationRuleCreate") {
              if (evidence.targetId) await state.guild.autoModerationRules.delete(evidence.targetId, "Anti-Nuke: attacker-created AutoMod rule").catch(error => { if (![10026, 10062].includes(error.code)) throw error; });
            } else if (evidence.action === "scheduledEventCreate") {
              if (evidence.targetId) await state.guild.scheduledEvents.delete(evidence.targetId).catch(error => { if (error.code !== 10070) throw error; });
            } else if (evidence.action === "inviteCreate") {
              const inviteCode = evidence.inviteCode || evidence.targetId;
              if (inviteCode) await state.guild.invites.delete(inviteCode, "Anti-Nuke: attacker-created invite").catch(error => { if (error.code !== 10006) throw error; });
            } else if (["integrationCreate", "integrationUpdate"].includes(evidence.action)) {
              if (evidence.targetId && deps.removeIntegration) {
                await deps.removeIntegration(state.guild, evidence.targetId).catch(error => report(state.guild, error));
              }
            } else if (evidence.action === "unban") {
              if (evidence.targetId && !state.actors.has(evidence.targetId)) {
                await state.guild.members.ban(evidence.targetId, { reason: "Anti-Nuke: attacker removed a server ban" }).catch(error => { if (error.code !== 10026) throw error; });
              }
            } else if (evidence.action === "memberRoleAdd") {
              const member = await state.guild.members.fetch(evidence.targetId).catch(error => { if (error.code === 10007) return null; throw error; });
              if (member && evidence.roleIds?.length) await member.roles.remove(evidence.roleIds, "Anti-Nuke: attacker granted roles");
            }
            evidence.cleaned = true;
          }
          if (deps.config(state.guild.id)?.autoRestore !== false && [...state.evidence.values()].some(item => snapshotRecoveryActions.has(item.action))) {
            await deps.restore(state.guild, new Set(state.actors.keys()));
          }
        });
        state.restored = version;
      } catch (error) {
        report(state.guild, error);
        state.restored = version; // Do not repeatedly flood REST after a failed restore.
      } finally {
        state.recovering = false;
        state.at = now();
        if (state.version !== version) queueRecovery(state);
      }
    }, 5000);
    state.timer?.unref?.();
  }

  async function contain(guild, actorId, evidence, webhook = false, thresholdEnforcement = false, punishment = "ban") {
    if (!eligible(guild)) return;
    if (actorId === guild.ownerId || actorId === deps.client.user.id) return;
    const exemption = exemptions.get(`${guild.id}:${actorId}`);
    if (!thresholdEnforcement && exemption && now() - exemption < 60000) return;
    const state = incident(guild);
    const previous = state.actors.get(actorId);
    if (previous && (previous.status !== "failed" || now() - previous.at < 30000)) {
      if (previous.status === "pending") {
        for (const item of evidence) if (previous.evidence.size < 1000) previous.evidence.set(item.id || `${item.action}:${item.targetId}`, item);
      }
      if (previous.status === "removed") { remember(state, evidence); queueRecovery(state); }
      return;
    }
    if (state.actors.size >= 100 && !previous) return;
    const record = { status: "pending", at: now(), evidence: new Map(evidence.map(item => [item.id || `${item.action}:${item.targetId}`, item])) };
    state.actors.set(actorId, record);
    state.pending++;
    state.version++;
    try {
      await context.run({ guildId: guild.id, priority: "critical" }, async () => {
        if (!webhook && !thresholdEnforcement && await deps.whitelisted(actorId, guild.id)) {
          exemptions.set(`${guild.id}:${actorId}`, now());
          state.actors.delete(actorId);
          return;
        }
        const reason = "Anti-Nuke emergency: destructive activity or bot message flood";
        let messagesCleared = false;
        if (webhook) {
          const hook = await deps.fetchWebhook(actorId);
          if (hook.guildId !== guild.id) throw new Error("Webhook guild mismatch");
          if (hook.owner?.id && (hook.owner.id === guild.ownerId || hook.owner.id === deps.client.user.id || await deps.whitelisted(hook.owner.id, guild.id))) {
            exemptions.set(`${guild.id}:${actorId}`, now());
            state.actors.delete(actorId);
            return;
          }
          await hook.delete(reason);
        } else {
          const member = guild.members.cache.get(actorId) || await guild.members.fetch(actorId).catch(() => null);
          if (!eligible(guild)) return;
          if (punishment === "kick") {
            if (!member?.kickable) throw new Error(`Cannot kick attacker ${actorId}: check Kick Members and role hierarchy`);
            await member.kick(reason);
          } else if (punishment === "strip") {
            if (!member?.manageable || !member.roles?.cache) throw new Error(`Cannot strip attacker ${actorId}: check Manage Roles and role hierarchy`);
            const roles = [...member.roles.cache.values()].filter(role => role.id !== guild.id && !role.managed);
            if (!roles.length || roles.some(role => !role.editable)) throw new Error(`Cannot remove attacker roles: check role hierarchy`);
            await member.roles.remove(roles.map(role => role.id), reason);
          } else {
            if (!member?.bannable) throw new Error(`Cannot ban attacker ${actorId}: check Ban Members and role hierarchy`);
            await member.ban({ reason, deleteMessageSeconds: 120 });
            messagesCleared = true;
          }
        }
        remember(state, record.evidence.values());
        record.status = "removed";
        for (const item of record.evidence.values()) {
          if (item.action !== "botAdd" || !item.targetId || item.cleaned) continue;
          try {
            const addedBot = await guild.members.fetch(item.targetId).catch(error => {
              if (error.code === 10007) return null;
              throw error;
            });
            if (addedBot?.user?.bot) {
              if (!addedBot.kickable) throw new Error(`Cannot remove added bot ${addedBot.id}: check Kick Members and role hierarchy`);
              await addedBot.kick("Anti-Nuke: unauthorized bot added by attacker");
            }
            item.cleaned = true;
          } catch (error) {
            report(guild, error);
          }
        }
        // Ban removes recent user messages server-wide. Observed IDs also cover webhooks/kick fallback.
        if (messagesCleared) return;
        const batches = new Map();
        for (const item of record.evidence.values()) {
          if (!item.messageId || !item.channel) continue;
          if (!batches.has(item.channel.id)) batches.set(item.channel.id, { channel: item.channel, ids: [] });
          batches.get(item.channel.id).ids.push(item.messageId);
        }
        for (const { channel, ids } of batches.values()) {
          if (!channel.bulkDelete) continue;
          const unique = [...new Set(ids)].slice(0, 1000);
          for (let offset = 0; offset < unique.length; offset += 100) {
            await channel.bulkDelete(unique.slice(offset, offset + 100), true).catch(error => report(guild, error));
          }
        }
      });
    } catch (error) {
      record.status = "failed";
      record.at = now();
      report(guild, error);
    } finally {
      state.pending--;
      if (!state.actors.size) incidents.delete(guild.id);
      else queueRecovery(state);
    }
  }

  async function recordAction(guild, actorId, action, evidence = {}) {
    if (!eligible(guild) || !actorId || actorId === guild.ownerId || actorId === deps.client.user.id) return false;
    if (action === "botAdd" && evidence.targetId && await deps.antibotWhitelisted?.(evidence.targetId, guild.id)) return false;
    if (evidence.id) {
      if (seen.has(evidence.id)) return false;
      if (seen.size >= 10000) prune();
      if (seen.size >= 10000) seen.delete(seen.keys().next().value);
      seen.set(evidence.id, now());
    }
    const config = deps.config(guild.id);
    const preference = config.features?.[evidence.setting];
    if (evidence.setting && (config.events?.[evidence.setting] !== true || preference?.enabled === false)) return false;
    const customLimit = Number.isInteger(preference?.limit) && preference.limit >= 1 && preference.limit <= 1000;
    const counter = customLimit ? evidence.setting : ["channelCreate", "channelDelete", "channelUpdate", "threadCreate", "threadDelete", "threadUpdate"].includes(action)
      ? "channelChanges"
      : ["roleCreate", "roleDelete", "roleUpdate", "massRoleChange"].includes(action)
        ? "roleChanges"
        : action === "permschange" ? "permissionChanges"
          : ["voiceMove", "voiceDisconnect"].includes(action) ? "voiceChanges" : action;
    const key = `${guild.id}:${actorId}:${counter}`;
    const windowMs = Math.min(60000, Math.max(1000, config.timeWindow || 10000));
    const existing = windows.get(key);
    const items = (existing?.items || []).filter(item => now() - item.at < windowMs);
    items.push({ ...evidence, action, at: now() });
    if (windows.size >= 5000) { prune(); if (windows.size >= 5000) windows.delete(windows.keys().next().value); }
    windows.set(key, { at: now(), items: items.slice(-100) });
    const limits = {
      ban: config.maxBans, kick: config.maxKicks, prune: config.maxKicks,
      channelCreate: config.maxChannelDelete, channelDelete: config.maxChannelDelete, channelUpdate: config.maxChannelDelete,
      threadCreate: config.maxChannelDelete, threadDelete: config.maxChannelDelete, threadUpdate: config.maxChannelDelete,
      scheduledEventCreate: config.maxChannelDelete, scheduledEventUpdate: config.maxChannelDelete, scheduledEventDelete: config.maxChannelDelete,
      stageCreate: config.maxChannelDelete,
      stageUpdate: config.maxChannelDelete, stageDelete: config.maxChannelDelete,
      messageBulkDelete: config.maxChannelDelete,
      permschange: config.maxChannelDelete,
      botAdd: config.maxBotAdds ?? 1,
      roleCreate: config.maxRoleDelete, roleDelete: config.maxRoleDelete, roleUpdate: config.maxRoleDelete, massRoleChange: config.maxRoleDelete,
      voiceMove: config.maxKicks, voiceDisconnect: config.maxKicks,
      guildUpdate: config.maxChannelDelete, unban: 1,
      inviteCreate: config.maxChannelDelete, inviteDelete: config.maxChannelDelete, inviteUpdate: config.maxChannelDelete,
      integrationCreate: 1, integrationUpdate: config.maxRoleDelete, integrationDelete: config.maxRoleDelete,
      soundboardCreate: config.maxRoleDelete, soundboardUpdate: config.maxRoleDelete, soundboardDelete: config.maxRoleDelete,
      autoModerationRuleCreate: 1, autoModerationRuleUpdate: config.maxRoleDelete, autoModerationRuleDelete: 1,
      memberUpdate: config.maxKicks, applicationPermissionUpdate: config.maxRoleDelete,
    };
    const threshold = customLimit ? preference.limit : Math.max(1, Number(limits[action]) || 3);
    const state = incidents.get(guild.id);
    const weight = items.reduce((total, item) => total + Math.max(1, Number(item.weight) || 1), 0);
    const whitelisted = await deps.whitelisted(actorId, guild.id);
    const thresholdReached = weight >= threshold;
    if (whitelisted && !thresholdReached && !state?.actors.has(actorId)) return false;
    if (!whitelisted && (customLimit || !items.some(item => item.force)) && !thresholdReached && !state?.actors.has(actorId)) return false;
    const selected = preference?.punishment || config.punishment || "ban";
    await contain(guild, actorId, items, false, true, ["ban", "kick", "strip"].includes(selected) ? selected : "ban");
    return true;
  }

  function handleMessage(message) {
    const guild = message.guild;
    if (!guild) return false;
    if (!eligible(guild)) return active(guild.id);
    if ((!message.author?.bot && !message.webhookId) || message.author?.id === deps.client.user.id) return active(guild.id);
    const actorId = message.webhookId || message.author.id;
    const key = `${guild.id}:${actorId}:messages`;
    const items = (windows.get(key)?.items || []).filter(item => now() - item.at < 5000);
    items.push({ id: message.id, messageId: message.id, channel: message.channel, action: message.webhookId ? "webhookSpam" : "botSpam", at: now() });
    if (windows.size >= 5000) { prune(); if (windows.size >= 5000) windows.delete(windows.keys().next().value); }
    windows.set(key, { at: now(), items: items.slice(-100) });
    if (items.length >= 20) void contain(guild, actorId, items, !!message.webhookId);
    return active(guild.id);
  }

  function requestPolicy(method, route) {
    const protectedJob = context.getStore();
    if (protectedJob) return { priority: protectedJob.priority };
    const guildId = /^\/guilds\/(\d+)/.exec(route)?.[1]
      || deps.client.channels.cache.get(/^\/channels\/(\d+)/.exec(route)?.[1])?.guildId;
    if (!active(guildId)) return {};
    const essential = /\/guilds\/\d+\/bans/.test(route)
      || (method === "delete" && /\/guilds\/\d+\/members\/\d+$/.test(route));
    return essential ? { priority: "critical" } : { paused: true };
  }

  return { auditDriven: true, active, recordAction, handleMessage, requestPolicy, prune, incidents };
}

module.exports = { createEmergencyProtection };
