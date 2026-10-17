"use strict";
/* ================= CENTRAL CONTAINER BUILDER ================= */
(() => {
const DEFAULT_SPACING = typeof SeparatorSpacingSize !== "undefined" ? SeparatorSpacingSize.Small : 1;

function createThemedContainer(type, title, description = "", options = {}) {
  const container = new ContainerBuilder();
  const titleEmoji = {
    success: '<:ok:1500971034575241236>',
    error: '<:no:1500970979273343027>',
  }[type] || "";
  const cleanTitle = String(title || "Notice")
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(\s*(<a?:[^:>]+:\d+>|[\p{Emoji_Presentation}\p{Extended_Pictographic}])\s*)+/u, "")
    .replace(/\*\*/g, "")
    .trim();
  container
    .addTextDisplayComponents(t => t.setContent(`### ${titleEmoji ? `${titleEmoji} ` : ""}${cleanTitle || "Notice"}`));
  if (description) {
    const messageEmoji = {
      success: '<:tick:1559236522711187577>',
      error: '<:scross:1559257945030525110>',
    }[type] || "";
    const message = String(description).trim().replace(/^>\s?/gm, "");
    const body = message
      .split("\n")
      .map((line, index) => `> ${index === 0 && messageEmoji ? `${messageEmoji} ` : ""}${line}`)
      .join("\n");
    container
      .addSeparatorComponents(separator => separator.setSpacing(DEFAULT_SPACING).setDivider(true))
      .addTextDisplayComponents(t => t.setContent(body));
  }
  if (Array.isArray(options.fields) && options.fields.length) {
    const fieldText = options.fields
      .filter(Boolean)
      .map(field => `**${field.name || "Field"}:** ${field.value || "-"}`)
      .join("\n");
    if (fieldText) container.addTextDisplayComponents(t => t.setContent(fieldText));
  }
  if (options.footer) {
    container.addTextDisplayComponents(t => t.setContent(`**${options.footer}**`));
  }
  return container;
}

function callExisting(name, fallbackType, args) {
  const existing = globalThis[name];
  if (typeof existing === "function" && existing !== centralContainerApi[name]) {
    return existing(...args);
  }
  return createThemedContainer(fallbackType, args[0], args[1], { fields: args[2], guildId: args[3] });
}

function createSuccessContainerCentral(...args) { return callExisting("createSuccessContainer", "success", args); }
function createErrorContainerCentral(...args) { return callExisting("createErrorContainer", "error", args); }
function createWarningContainerCentral(...args) { return callExisting("createWarningContainer", "warning", args); }
function createInfoContainerCentral(...args) { return callExisting("createInfoContainer", "info", args); }
function createLoadingContainer(title = "Loading", description = "Please wait.", guildId = null) {
  return createThemedContainer("loading", title, description, { guildId });
}

/*
 * Discord log messages intentionally use one renderer.  Keeping this here
 * (rather than in each feature handler) means a configured log channel gets
 * the same Components V2/Flantic layout whether the event came from an
 * audit-log listener, moderation command, automod, or security guard.
 */
const LOG_CONTAINER_CATEGORIES = {
  messageDelete: "message", messageEdit: "message",
  infect: "moderation",
  memberBan: "moderation", memberUnban: "moderation", memberKick: "moderation",
  memberMute: "moderation", memberUnmute: "moderation", memberWarn: "moderation",
  memberJoin: "joinLeave", memberLeave: "joinLeave",
  memberUpdate: "admin", nicknameChange: "admin", guildUpdate: "admin",
  inviteCreate: "invite", inviteDelete: "invite",
  voiceJoin: "voice", voiceLeave: "voice", voiceMove: "voice",
  roleCreate: "action", roleDelete: "action", roleUpdate: "action",
  channelCreate: "action", channelDelete: "action", channelUpdate: "action",
  emojiCreate: "action", emojiDelete: "action", emojiUpdate: "action",
  stickerCreate: "action", stickerDelete: "action", stickerUpdate: "action",
  webhookCreate: "action", webhookDelete: "action", webhookUpdate: "action",
  autoModerationRuleCreate: "action", autoModerationRuleDelete: "action",
  autoModerationRuleUpdate: "action", autoModerationActionExecution: "moderation",
  threadCreate: "thread", threadDelete: "thread", threadUpdate: "thread",
  stageInstanceCreate: "stage", stageInstanceDelete: "stage", stageInstanceUpdate: "stage",
  guildScheduledEventCreate: "event", guildScheduledEventDelete: "event", guildScheduledEventUpdate: "event",
  guildIntegrationsUpdate: "application", applicationCommandPermissionsUpdate: "application",
};

const LOG_CONTAINER_TITLES = {
  messageDelete: "Message Deleted", messageEdit: "Message Edited",
  infect: "Infect",
  memberJoin: "Member Joined", memberLeave: "Member Left", memberUpdate: "Member Updated",
  memberBan: "Member Banned", memberUnban: "Member Unbanned", memberKick: "Member Kicked",
  memberMute: "Member Muted", memberUnmute: "Member Unmuted", memberWarn: "Member Warned",
  roleCreate: "Role Created", roleDelete: "Role Deleted", roleUpdate: "Role Updated",
  channelCreate: "Channel Created", channelDelete: "Channel Deleted", channelUpdate: "Channel Updated",
  emojiCreate: "Emoji Created", emojiDelete: "Emoji Deleted", emojiUpdate: "Emoji Updated",
  stickerCreate: "Sticker Created", stickerDelete: "Sticker Deleted", stickerUpdate: "Sticker Updated",
  webhookCreate: "Webhook Created", webhookDelete: "Webhook Deleted", webhookUpdate: "Webhook Updated",
  autoModerationRuleCreate: "AutoMod Rule Created", autoModerationRuleDelete: "AutoMod Rule Deleted",
  autoModerationRuleUpdate: "AutoMod Rule Updated", autoModerationActionExecution: "AutoMod Action Executed", voiceJoin: "Voice Joined",
  voiceLeave: "Voice Left", voiceMove: "Voice Moved", inviteCreate: "Invite Created",
  inviteDelete: "Invite Deleted", nicknameChange: "Nickname Changed", guildUpdate: "Server Updated",
};

function loggingAccentColor(eventType, guildId = null) {
  const type = String(eventType || "").toLowerCase();
  if (type.includes("error") || type.includes("delete") || type.includes("ban") || type.includes("kick") || type.includes("remove")) {
    return typeof getErrorColor === "function" ? getErrorColor() : 0xED4245;
  }
  if (type.includes("warning") || type.includes("warn") || type.includes("security") || type.includes("antinuke") || type.includes("automod")) {
    return typeof getWarningColor === "function" ? getWarningColor() : 0xFEE75C;
  }
  if (type.includes("join") || type.includes("create") || type.includes("boost") || type.includes("success")) {
    return typeof getSuccessColor === "function" ? getSuccessColor() : 0x57F287;
  }
  return typeof getThemeColor === "function" ? getThemeColor(guildId) : 0x808080;
}

function cleanLogText(value) {
  return String(value ?? "")
    .replace(/\*\*/g, "")
    .replace(/^#{1,6}\s*/, "")
    .replace(/^(?:\s*(?:<a?:[^:>]+:\d+>|[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D])\s*)+/u, "")
    .replace(/\r?\n/g, " ")
    .trim();
}

function cleanLogValue(value) {
  return String(value ?? "-")
    .replace(/\*\*/g, "")
    .replace(/\r?\n/g, " ")
    .replace(/^\s*>+\s*/, "")
    .replace(/<a?:[a-zA-Z0-9_]+:\d+>/g, "")
    .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D]/gu, "")
    .trim() || "-";
}

function logUserLabel(user) {
  if (!user) return null;
  const display = user.displayName || user.globalName || user.username || user.tag || "Unknown";
  return `\`${cleanLogValue(display)}\``;
}

function normalizeLogFields(fields = [], preserveContent = false) {
  return (Array.isArray(fields) ? fields : [])
    .filter(field => field && (field.name || field.label || field.value !== undefined))
    .map(field => ({
      name: cleanLogText(field.name || field.label || "Details"),
      value: preserveContent ? String(field.value ?? "-").slice(0, 1900) : cleanLogValue(String(field.value ?? "-").slice(0, 1900)),
    }));
}

function logEventEmoji(eventType) {
  const type = String(eventType || "").toLowerCase();
  const emoji = typeof EMOJIS !== "undefined" ? EMOJIS : {};
  if (type.includes("nuke")) return emoji.delete || emoji.boom || "💣";
  if (type.includes("message") || type.includes("purge")) return emoji.delete || emoji.file || "📝";
  if (type.includes("ban")) return emoji.ban || emoji.hammer || "🔨";
  if (type.includes("kick")) return emoji.kick || "👢";
  if (type.includes("mute")) return emoji.mute || "🔇";
  if (type.includes("warn")) return emoji.warn || "⚠️";
  if (type.includes("join") || type.includes("create")) return emoji.add || emoji.success || "➕";
  if (type.includes("delete") || type.includes("remove") || type.includes("leave")) return emoji.remove || emoji.error || "➖";
  if (type.includes("update") || type.includes("edit")) return emoji.edit || "✏️";
  return emoji.soezy_info || emoji.info || "ℹ️";
}

function logFieldEmoji(name) {
  const label = String(name || "").toLowerCase();
  const emoji = typeof EMOJIS !== "undefined" ? EMOJIS : {};
  if (label.includes("user") || label.includes("author") || label.includes("member") || label.includes("target") || label.includes("moderator")) return emoji.confession || emoji.tag || "👤";
  if (label.includes("channel")) return emoji.channel || emoji.tag || "#";
  if (label.includes("reason") || label.includes("content") || label.includes("message") || label.includes("details")) return emoji.file || emoji.document || "📝";
  if (label.includes("attachment") || label.includes("image") || label.includes("media")) return emoji.clip || emoji.image || "📎";
  return emoji.arrow || "•";
}

function logAvatarUrl(actor, thumbnail) {
  if (thumbnail && /^https?:\/\//i.test(String(thumbnail))) return String(thumbnail);
  if (!actor) return null;
  return actor.displayAvatarURL?.({ extension: "png", size: 128 })
    || actor.avatarURL?.({ extension: "png", size: 128 })
    || actor.user?.displayAvatarURL?.({ extension: "png", size: 128 })
    || null;
}

function createLoggingContainer(eventType, options = {}) {
  const guild = options.guild || null;
  const title = options.title || LOG_CONTAINER_TITLES[eventType] || cleanLogText(eventType) || "Server Log";
  const timestamp = options.timestamp instanceof Date
    ? options.timestamp
    : new Date(options.timestamp || Date.now());
  const fields = normalizeLogFields(options.fields, eventType === "messageEdit");
  const actor = options.actor || options.user || options.moderator || options.executor;
  if (actor) {
    if (!fields.some(field => field.name === "By")) {
      fields.unshift({ name: "By", value: logUserLabel(actor) });
    }
    if (eventType !== "messageEdit" && !fields.some(field => field.name === "User ID")) {
      fields.splice(1, 0, { name: "User ID", value: `\`${actor.id || "unknown"}\`` });
    }
  }

  const lines = [];
  const appendField = (name, value) => {
    const label = cleanLogText(name || "Details") || "Details";
    const normalizedValue = eventType === "messageEdit" ? String(value ?? "-") : cleanLogValue(value);
    const chunks = normalizedValue.match(/[\s\S]{1,1800}/g) || ["-"];
    chunks.forEach((chunk, index) => {
      const renderedLabel = index ? `${label} (continued)` : label;
      lines.push(`> **${renderedLabel}:** ${chunk.replace(/\r?\n/g, "\n> ")}`);
    });
  };

  if (options.description) appendField("Details", options.description);
  const editFields = eventType === "messageEdit"
    ? fields.filter(field => /^(Before|After)( Edit)?$/i.test(field.name))
    : [];
  fields.filter(field => !editFields.includes(field)).forEach(field => {
    if (eventType === "messageEdit" && field.name === "Channel") {
      appendField("Channel ID", field.value.replace(/^<#(\d+)>$/, "$1"));
    } else {
      appendField(field.name, field.value);
    }
  });
  if (options.footer && options.footer !== true) appendField("Context", options.footer);

  const container = new ContainerBuilder();
  const header = `### ${cleanLogText(title) || "Server Log"}`;
  container.addTextDisplayComponents(text => text.setContent(header));
  container.addSeparatorComponents(separator => separator.setSpacing(DEFAULT_SPACING).setDivider(true));
  let current = "";
  const blocks = [];
  for (const line of lines) {
    if (current && `${current}\n${line}`.length > 3900) {
      blocks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) blocks.push(current);
  blocks.forEach(block => container.addTextDisplayComponents(t => t.setContent(block)));
  for (const name of ["Before", "After"]) {
    const field = editFields.find(item => item.name.toLowerCase().startsWith(name.toLowerCase()));
    if (!field) continue;
    // Prevent message contents from closing the surrounding code fence.
    const content = (field.value || "Empty").replace(/`/g, "`\u200b");
    container.addTextDisplayComponents(t => t.setContent(`**${name}**\n\`\`\`\n${content}\n\`\`\``));
  }
  if (options.components?.length) container.addActionRowComponents(...options.components);
  if (options.footer !== false) {
    const footer = `${guild?.name || "Soezy"} • <t:${Math.floor(timestamp.getTime() / 1000)}:f>`;
    container.addSeparatorComponents(separator => separator.setSpacing(DEFAULT_SPACING).setDivider(true));
    container.addTextDisplayComponents(text => text.setContent(`-# ${footer}`));
  }
  return container;
}

function createLoggingEmbed(eventType, options = {}) {
  const guild = options.guild || null;
  const title = options.title || LOG_CONTAINER_TITLES[eventType] || cleanLogText(eventType) || "Server Log";
  const timestamp = options.timestamp instanceof Date
    ? options.timestamp
    : new Date(options.timestamp || Date.now());
  const fields = normalizeLogFields(options.fields);
  const actor = options.actor || options.user || options.moderator || options.executor;
  if (actor) {
    if (!fields.some(field => field.name === "User")) {
      fields.unshift({ name: "User", value: logUserLabel(actor) });
    }
    if (!fields.some(field => field.name === "User ID")) {
      fields.splice(1, 0, { name: "User ID", value: `\`${actor.id || "unknown"}\`` });
    }
  }

  const lines = [];
  const appendField = (name, value) => {
    const label = cleanLogText(name || "Details") || "Details";
    const normalizedValue = cleanLogValue(value);
    const chunks = normalizedValue.match(/.{1,900}/g) || ["-"];
    chunks.forEach((chunk, index) => {
      const renderedLabel = index ? `${label} (continued)` : label;
      lines.push(`> **${renderedLabel}:** ${chunk}`);
    });
  };
  if (options.description) appendField("Details", options.description);
  fields.forEach(field => appendField(field.name, field.value));
  if (options.footer && options.footer !== true) appendField("Context", options.footer);

  const embed = new EmbedBuilder()
    .setColor(options.color || loggingAccentColor(eventType, options.guildId))
    .setAuthor({
      name: cleanLogText(title) || "Server Log",
      iconURL: logAvatarUrl(actor, options.thumbnail) || undefined,
    })
    .setDescription(lines.join("\n").slice(0, 4096))
    .setTimestamp(timestamp);
  if (guild?.name) embed.setFooter({ text: guild.name });
  return embed;
}

// Legacy feature callers must pass through Logging Config, never their own channels.
async function sendLoggingContainer(channel, eventType, options = {}) {
  const aliases = {
    mute: "memberMute", unmute: "memberUnmute", kick: "memberKick",
    ban: "memberBan", unban: "memberUnban", warn: "memberWarn",
  };
  const configuredEvent = aliases[eventType] || eventType;
  if (!Object.hasOwn(LOG_CONTAINER_CATEGORIES, configuredEvent)) return null;
  return sendConfiguredLogging(options.guild || channel?.guild, configuredEvent, options);
}

async function deliverLoggingContainer(channel, eventType, options = {}) {
  if (!channel?.send) return null;
  // Jail/quarantine audit messages are intentionally revoked. This guard
  // also covers legacy direct log-channel call sites that do not use the
  // configured-event dispatcher.
  if ([
    "wall", "wallBypass", "jail", "unjail", "quarantine", "unquarantine",
    "release", "autoJail", "AUTO_JAIL"
  ].includes(String(eventType))) return null;
  const components = [];
  const suppliedComponents = Array.isArray(options.components) ? options.components.filter(Boolean) : [];
  components.push(...suppliedComponents);
  const jumpUrl = options.jumpUrl || options.messageUrl || options.url;
  const canAddJump = /^https:\/\/discord(?:app)?\.com\/channels\/\d+\/\d+\/\d+$/i.test(String(jumpUrl || ""));
  const alreadyHasJump = suppliedComponents.some(component => component?.components?.some?.(item => /jump/i.test(String(item?.data?.label || item?.label || ""))));
  if (canAddJump && !alreadyHasJump && typeof ButtonBuilder !== "undefined" && typeof ButtonStyle !== "undefined" && typeof ActionRowBuilder !== "undefined") {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel("Jump to Message").setStyle(ButtonStyle.Link).setURL(jumpUrl)
    ));
  }
  const container = createLoggingContainer(eventType, { ...options, components });
  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
  if (Array.isArray(options.files) && options.files.length) payload.files = options.files;
  return Promise.resolve(channel.send(payload)).catch(() => null);
}

async function sendConfiguredLogging(guild, eventType, options = {}) {
  if (globalThis.soezyEmergency?.active(guild?.id)) return null;
  if (!Object.hasOwn(LOG_CONTAINER_CATEGORIES, eventType)) return null;
  const logging = guild?.id && typeof guildData === "function" ? guildData(guild.id).logging : null;
  if (!logging?.enabled) return null;
  if (logging.events?.[eventType] === false || logging.events?.[eventType] === undefined) return null;
  const category = LOG_CONTAINER_CATEGORIES[eventType];
  const splitCategory = globalThis.soezyLogging?.routes?.[eventType];
  if (logging.ignoreVoice && (splitCategory === "vc" || ["voiceJoin", "voiceLeave", "voiceMove"].includes(eventType))) return null;
  if (logging.ignoreEmbeds && options.hasEmbeds) return null;
  const channelId = logging.channels?.[splitCategory] || (category && logging.channels?.[category]) || logging.channel;
  if (!channelId) return null;
  let channel = guild.channels?.cache?.get(channelId) || null;
  if (!channel && typeof guild.channels?.fetch === "function") {
    channel = await guild.channels.fetch(channelId).catch(() => null);
  }
  if (!channel) return null;
  return deliverLoggingContainer(channel, eventType, { ...options, guild, guildId: guild.id });
}

function settingsEmoji(name, emojiKey, fallback = "") {
  if (typeof globalThis !== "undefined" && globalThis?.[name]) return globalThis[name];
  if (typeof EMOJIS !== "undefined" && EMOJIS?.[emojiKey]) return EMOJIS[emojiKey];
  if (typeof STATUS !== "undefined" && STATUS?.[emojiKey]) return STATUS[emojiKey];
  if (name === "YES_EMOJI" && typeof EMOJI_ENABLE !== "undefined") return EMOJI_ENABLE;
  if (name === "NO_EMOJI" && typeof EMOJI_DISABLE !== "undefined") return EMOJI_DISABLE;
  if (emojiKey === "success" && typeof EMOJI_ENABLE !== "undefined") return EMOJI_ENABLE;
  if (emojiKey === "error" && typeof EMOJI_DISABLE !== "undefined") return EMOJI_DISABLE;
  return fallback;
}

function createRemainingSetupContainer(items = [], options = {}) {
  const normalized = (Array.isArray(items) ? items : [items])
    .map(item => {
      if (item && typeof item === "object") {
        const label = String(item.label || item.name || item.title || "").trim();
        if (!label) return null;
        return { label, configured: Boolean(item.configured ?? item.done ?? item.valid) };
      }
      const label = String(item || "").trim();
      return label ? { label, configured: false } : null;
    })
    .filter(Boolean);
  const deduped = [];
  const seen = new Set();
  for (const item of normalized) {
    const key = item.label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  const titleEmoji = settingsEmoji("WARNING_EMOJI", "warning");
  const yesEmoji = settingsEmoji("YES_EMOJI", "success");
  const noEmoji = (typeof EMOJIS !== "undefined" && (EMOJIS?.scross || EMOJIS?.error)) ||
    settingsEmoji("NO_EMOJI", "error");
  const lines = [
    `### ${titleEmoji} Remaining Setup`.trim(),
    "",
    "**Missing**",
    "",
    ...deduped.map(item => `> ${item.configured ? yesEmoji : noEmoji} ${item.label}`.trim()),
  ];
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(lines.join("\n")));
  if (Array.isArray(options.buttons) && options.buttons.length) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      options.buttons.map(button => new ButtonBuilder()
        .setCustomId(button.customId)
        .setLabel(button.label)
        .setStyle(button.style ?? ButtonStyle.Secondary)
        .setDisabled(Boolean(button.disabled)))
    ));
  }
  return container;
}

function remainingSetupContainer(items = [], options = {}) {
  return createRemainingSetupContainer(items, options);
}

const centralContainerApi = {
  createThemedContainer,
  createSuccessContainer: createSuccessContainerCentral,
  createErrorContainer: createErrorContainerCentral,
  createWarningContainer: createWarningContainerCentral,
  createInfoContainer: createInfoContainerCentral,
  createLoadingContainer,
  createRemainingSetupContainer,
  remainingSetupContainer,
  createLoggingContainer,
  createLoggingEmbed,
  sendLoggingContainer,
  sendConfiguredLogging,
};

Object.assign(globalThis, {
  soezyContainerBuilder: centralContainerApi,
  createLoadingContainer,
  createRemainingSetupContainer,
  remainingSetupContainer,
  createLoggingContainer,
  createLoggingEmbed,
  sendLoggingContainer,
  sendConfiguredLogging,
});

module.exports = centralContainerApi;
})();
