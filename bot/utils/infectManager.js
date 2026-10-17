"use strict";

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  PermissionsBitField,
  StringSelectMenuBuilder,
} = require("discord.js");

const runtime = globalThis.__soezyInfectRuntime || {
  pending: new Map(),
  timers: new Map(),
  deps: {},
};
globalThis.__soezyInfectRuntime = runtime;

const DEFAULT_DURATION = 60 * 1000;
const CONFIG_EMOJI = "<a:thinking:1559656266261995620>";

function configure(deps = {}) {
  runtime.deps = { ...runtime.deps, ...deps };
}

function getState(guildId) {
  const guild = typeof runtime.deps.guildData === "function" ? runtime.deps.guildData(guildId) : null;
  if (!guild) return null;
  if (!guild.infect || typeof guild.infect !== "object") guild.infect = {};
  const state = guild.infect;
  if (state.enabled === undefined) state.enabled = true;
  if (state.channelId === undefined) state.channelId = null;
  if (state.allowedRoleId === undefined) state.allowedRoleId = null;
  if (!Number.isFinite(state.muteDurationMs) || state.muteDurationMs <= 0) state.muteDurationMs = DEFAULT_DURATION;
  if (!Number.isFinite(state.choiceDurationMs) || state.choiceDurationMs <= 0) state.choiceDurationMs = DEFAULT_DURATION;
  return state;
}

function save() {
  if (typeof runtime.deps.saveDB === "function") runtime.deps.saveDB();
}

function isElevated(member, guild) {
  return Boolean(
    member?.permissions?.has?.(PermissionsBitField.Flags.Administrator) ||
    member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild) ||
    member?.id === guild?.ownerId
  );
}

function canIssue(member, guild, state) {
  if (!member || !guild || !state?.enabled) return false;
  if (isElevated(member, guild)) return true;
  if (state.allowedRoleId) return member.roles?.cache?.has(state.allowedRoleId) === true;
  return member.permissions?.has?.(PermissionsBitField.Flags.ModerateMembers) === true;
}

function durationLabel(ms) {
  return typeof runtime.deps.formatDuration === "function" ? runtime.deps.formatDuration(ms) : `${Math.round(ms / 60000)} minute(s)`;
}

function buildConfigPanel(guild, guildId, sessionId) {
  const state = getState(guildId);
  const currentChannel = state.channelId ? guild?.channels?.cache?.get(state.channelId) : null;
  const channelLabel = currentChannel ? `#${currentChannel.name}` : state.channelId ? `<#${state.channelId}>` : "Not set";
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`infcfg_select_${sessionId}`)
    .setPlaceholder("Choose an Infect setting")
    .addOptions([
      { label: state.enabled ? "Disable Infect" : "Enable Infect", description: "Toggle Infect availability", value: `toggle_${sessionId}` },
      { label: state.channelId ? "Change Infect Channel" : "Set Infect Channel", description: "Choose where prompts are sent", value: `channel_${sessionId}` },
      { label: "Set Allowed Role", description: "Choose who may use Infect", value: `role_${sessionId}` },
      { label: "Set Mute Duration", description: "How long the selected mute lasts", value: `mute_${sessionId}` },
      { label: "Set Choice Timer", description: "How long the target has to choose", value: `choice_${sessionId}` },
      { label: "Reset Configuration", description: "Clear channel and role and restore one minute defaults", value: `reset_${sessionId}` },
    ]);
  const container = new ContainerBuilder().addTextDisplayComponents(t => t.setContent(
    `## ${CONFIG_EMOJI} Infect Configuration\n\n` +
    `> Infect Channel: ${state.channelId ? `<#${state.channelId}>` : "`Not set`"}\n` +
    `> Current Channel Name: \`${channelLabel}\`\n` +
    `> Allowed Role: ${state.allowedRoleId ? `<@&${state.allowedRoleId}>` : "`Not set`"}\n` +
    `> Mute Duration: \`${durationLabel(state.muteDurationMs)}\`\n` +
    `> Choice Timer: \`${durationLabel(state.choiceDurationMs)}\`\n` +
    `> Status: \`${state.enabled ? "Enabled" : "Disabled"}\``
  )).addActionRowComponents(new ActionRowBuilder().addComponents(menu));
  return { container };
}

function shuffleArray(list) {
  const items = [...list];
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function createRandomizedOptions() {
  const labels = ["Arcane Shield", "Hex Curse", "Mystic Ward"];
  const effects = shuffleArray(["safe", "mute", "wild"]);
  return labels.map((label, index) => ({ label, effect: effects[index], index }));
}

function buildPrompt(pending, status = "pending") {
  const container = new ContainerBuilder();
  const title = status === "pending" ? "You Have Been Infected" : "Infect Result";
  const options = pending?.options || createRandomizedOptions();
  const lineText = options.map((option, idx) => `> \`${idx + 1}\` — ${option.label}`).join("\n");
  let body = status === "pending"
    ? `> You have been given a choice.\n${lineText}\n\nChoose an option before the timer expires.`
    : status === "safe"
      ? `> You selected \`${pending?.selectedLabel || options[0]?.label}\`.\n> No mute was applied.`
      : status === "mute"
        ? `> You selected \`${pending?.selectedLabel || options[1]?.label}\`.\n> You were muted for \`${durationLabel(pending.muteDurationMs)}\`.`
        : `> No option was selected in time.\n> You were muted for \`${durationLabel(pending.muteDurationMs)}\`.`;
  container.addTextDisplayComponents(t => t.setContent(`# ${title}\n\n${body}`));
  if (status === "pending") {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      ...options.map((option, idx) => new ButtonBuilder()
        .setCustomId(`infect_choice_${option.effect}_${pending.token}`)
        .setLabel(`${idx + 1} • ${option.label}`)
        .setStyle(option.effect === "mute" ? ButtonStyle.Danger : option.effect === "wild" ? ButtonStyle.Primary : ButtonStyle.Success))
    ));
  } else {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`infect_done_${pending.token}`).setLabel("Completed").setStyle(ButtonStyle.Secondary).setDisabled(true)
    ));
  }
  return container;
}

function clearPending(key) {
  const timer = runtime.timers.get(key);
  if (timer) clearTimeout(timer);
  runtime.timers.delete(key);
  runtime.pending.delete(key);
}

async function logEvent(guild, action, issuer, target, duration = null) {
  if (typeof runtime.deps.sendConfiguredLogging !== "function") return;
  await runtime.deps.sendConfiguredLogging(guild, "infect", {
    actor: target?.user || target,
    fields: [
      { name: "Action", value: `\`${action}\`` },
      { name: "Target", value: `\`${target?.user?.username || target?.username || target?.user?.tag || "Unknown"}\`` },
      { name: "Target ID", value: `\`${target?.id || target?.user?.id || "unknown"}\`` },
      ...(issuer ? [{ name: "Issued By", value: `\`${issuer.user?.username || issuer.username || issuer.user?.tag || "Unknown"}\`` }, { name: "Issued By ID", value: `\`${issuer.id || issuer.user?.id || "unknown"}\`` }] : []),
      ...(duration ? [{ name: "Duration", value: `\`${durationLabel(duration)}\`` }] : []),
    ],
  }).catch(() => {});
}

async function logConfigChange(guild, actor, action, value) {
  if (typeof runtime.deps.sendConfiguredLogging !== "function") return;
  await runtime.deps.sendConfiguredLogging(guild, "infect", {
    actor: actor?.user || actor,
    fields: [
      { name: "Action", value: `\`${action}\`` },
      { name: "Value", value: `\`${value || "Cleared"}\`` },
    ],
  }).catch(() => {});
}

async function applyMute(pending, reason) {
  const guild = pending.guild;
  const target = await guild.members.fetch(pending.targetId).catch(() => null);
  if (!target || !target.moderatable) return { ok: false, target };
  await target.timeout(pending.muteDurationMs, reason);
  return { ok: true, target };
}

async function finish(message, pending, status, interaction = null) {
  const key = pending.key;
  if (pending.completed) return false;
  pending.completed = true;
  clearPending(key);
  let muteResult = { ok: false, target: null };
  if (status === "mute" || status === "expired") {
    muteResult = await applyMute(pending, status === "expired" ? "Infect choice expired" : "Infect mute selected");
    if (!muteResult.ok) status = "mute_failed";
  }
  await message.edit({ components: [buildPrompt(pending, status)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  setTimeout(() => message.delete().catch(() => {}), 30_000).unref?.();
  await logEvent(pending.guild, status === "safe" ? "Safe" : status === "expired" ? "Auto-mute" : status === "mute" ? "Mute" : "Mute failed", pending.issuer, muteResult.target || pending.target, status === "safe" ? null : pending.muteDurationMs);
  if (interaction) await interaction.deferUpdate().catch(() => {});
  return true;
}

async function issueInfect({ guild, issuer, target, channel, reason = "Infect" }) {
  const state = getState(guild.id);
  if (!state?.enabled) return { ok: false, error: "Infect is disabled." };
  if (!channel?.send) return { ok: false, error: "The configured infect channel is missing or invalid." };
  if (runtime.pending.has(`${guild.id}:${target.id}`)) return { ok: false, error: "This user already has an active infect prompt." };
  if (!target.moderatable) return { ok: false, error: "I cannot timeout this user because of permissions or role hierarchy." };
  const token = `${guild.id}_${target.id}_${Date.now().toString(36)}`;
  const pending = {
    key: `${guild.id}:${target.id}`, token, guild, issuer, targetId: target.id,
    target, muteDurationMs: state.muteDurationMs, choiceDurationMs: state.choiceDurationMs,
    completed: false,
    options: createRandomizedOptions(),
  };
  const sent = await channel.send({
    content: `<@${target.id}>`,
    components: [buildPrompt(pending)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { users: [target.id], roles: [] },
  });
  pending.message = sent;
  runtime.pending.set(pending.key, pending);
  runtime.timers.set(pending.key, setTimeout(() => {
    finish(sent, pending, "expired").catch(() => {});
  }, pending.choiceDurationMs));
  await logEvent(guild, "Issued", issuer, target);
  return { ok: true, pending };
}

async function handleChoice(interaction) {
  const match = String(interaction.customId || "").match(/^infect_choice_(safe|mute|wild)_(.+)$/);
  if (!match) return false;
  const pending = [...runtime.pending.values()].find(item => item.token === match[2]);
  if (!pending) {
    await interaction.reply({ components: [runtime.deps.createErrorContainer("Infect Expired", "This infect choice has already expired.")], flags: MessageFlags.IsComponentsV2 | 64 }).catch(() => {});
    return true;
  }
  if (interaction.user.id !== pending.targetId) {
    await interaction.reply({ components: [runtime.deps.createErrorContainer("Not Your Choice", "Only the infected user can select an option.")], flags: MessageFlags.IsComponentsV2 | 64 }).catch(() => {});
    return true;
  }
  const chosen = pending.options?.find(option => option.effect === match[1]);
  pending.selectedLabel = chosen?.label || pending.selectedLabel || "Arcane Shield";
  const decision = match[1] === "wild" ? (Math.random() < 0.5 ? "safe" : "mute") : match[1];
  await finish(pending.message, pending, decision, interaction);
  return true;
}

module.exports = {
  DEFAULT_DURATION, configure, getState, canIssue, isElevated, durationLabel, buildConfigPanel,
  buildPrompt, issueInfect, handleChoice, logConfigChange,
};
