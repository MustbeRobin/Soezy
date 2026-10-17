/* ================= CENTRAL PERMISSION MIDDLEWARE ================= */
(() => {
const DEFAULT_BOT_PERMISSIONS = ["ViewChannel", "SendMessages", "EmbedLinks", "ReadMessageHistory"];
const COMMAND_BOT_PERMISSIONS = Object.freeze({
  ban: ["BanMembers"],
  unban: ["BanMembers"],
  kick: ["KickMembers"],
  mute: ["ModerateMembers"],
  unmute: ["ModerateMembers"],
  purge: ["ManageMessages"],
  clear: ["ManageMessages"],
  cuc: ["ManageMessages"],
  clearuserchannel: ["ManageMessages"],
  pin: ["ManageMessages"],
  lock: ["ManageChannels"],
  unlock: ["ManageChannels"],
  hide: ["ManageChannels"],
  unhide: ["ManageChannels"],
  slowmode: ["ManageChannels"],
  delete: ["ManageChannels"],
  nuke: ["ManageChannels", "ManageMessages"],
  send: ["ViewChannel", "SendMessages", "EmbedLinks", "AttachFiles"],
  nick: ["ManageNicknames"],
  nickname: ["ManageNicknames"],
  setnick: ["ManageNicknames"],
  changenick: ["ManageNicknames"],
  autorole: ["ManageRoles"],
  humanrole: ["ManageRoles"],
  humanroles: ["ManageRoles"],
  botrole: ["ManageRoles"],
  botroles: ["ManageRoles"],
  massrole: ["ManageRoles"],
  massroles: ["ManageRoles"],
  memberrole: ["ManageRoles"],
  memberroles: ["ManageRoles"],
  // `role` is an alias for the public `roleinfo` command. Role-changing
  // commands have their own ManageRoles checks.
  role: [],
});

function toFlag(name) {
  return PermissionsBitField?.Flags?.[name] || name;
}

function botHasAdministrator(member) {
  const adminFlag = toFlag("Administrator");
  return Boolean(
    member?.permissions?.has?.(adminFlag) ||
    member?.permissions?.has?.("Administrator") ||
    member?.roles?.cache?.some?.(role => role.permissions?.has?.(adminFlag))
  );
}

function channelAllowsBot(channel, botMember, permissionName) {
  if (botHasAdministrator(botMember)) return true;
  return Boolean(channel?.permissionsFor?.(botMember)?.has?.(toFlag(permissionName)));
}

function formatPerms(perms = []) {
  return perms.map(name => `**${String(name).replace(/([a-z])([A-Z])/g, "$1 $2")}**`).join(", ");
}

function getTargetChannel(target) {
  return target?.channel || target?.message?.channel || target?.options?.getChannel?.("channel", false) || null;
}

function getContextCommandName(target, fallback = null) {
  return fallback || target?.commandName || target?.__soezyCommandName || null;
}

function extractPanelSession(customId = "") {
  const id = String(customId || "");
  const sessionMatch = id.match(/(?:^|_)(\d{17,20}_\d{10,13}(?:_[a-z0-9]+)?)(?:_|$)/i);
  if (sessionMatch) return sessionMatch[1];
  return null;
}

function extractPanelOwnerId(interaction, options = {}) {
  if (options.ownerId || options.userId) return options.ownerId || options.userId;

  const customId = String(interaction?.customId || "");
  const nukeMatch = customId.match(/^nuke_confirm_\d{17,20}_(\d{17,20})$/) ||
    customId.match(/^nuke_cancel_(\d{17,20})$/);
  if (nukeMatch) return nukeMatch[1];

  const securityWarningMatch = customId.match(/^securitywarn_(?:continue|cancel)_[^_]+_\d{17,20}_(\d{17,20})(?:_|$)/i);
  if (securityWarningMatch) return securityWarningMatch[1];

  const sessionId = extractPanelSession(customId);
  if (sessionId) {
    const session = globalThis.__soezyCollectorSessions?.get?.(sessionId);
    const metaOwner = session?.meta?.ownerId || session?.meta?.userId || session?.ownerId;
    return metaOwner || sessionId.split("_")[0];
  }

  const ownerPatterns = [
    /^help_category_(\d{17,20})$/,
    /^dashboard_select_(\d{17,20})$/,
    /^dashboard_(?:prevmod|prevpage|home|nextpage|nextmod)(?:_[a-z0-9-]+)?_(\d{17,20})$/i,
    /^toggle_panel_select_(\d{17,20})$/,
    /^toggle_(?:enable|disable)_all_(\d{17,20})$/,
    /^wordle_(?:guess|hint)_(\d{17,20})_/,
    /^wordlemod_(\d{17,20})_/,
    /^slots_again_(\d{17,20})_/,
  ];

  for (const pattern of ownerPatterns) {
    const match = customId.match(pattern);
    if (match) return match[1];
  }

  return null;
}

function isPanelBypassOwner(userId) {
  const id = String(userId || "");
  return Boolean(
    globalThis.soezyOwnerManager?.isBotOwner?.(id) ||
    globalThis.config?.ownerIds?.includes(id) ||
    globalThis.config?.owners?.includes(id)
  );
}

function checkCommandPermissions(context = {}) {
  const result = typeof validateCommandPermissions === "function"
    ? validateCommandPermissions(context)
    : { allowed: true, missing: [] };
  return {
    ...result,
    title: "Missing Permission",
    message: result.reason || (result.missing?.length ? `You need ${formatPerms(result.missing)} to use this.` : null),
  };
}

function checkBotPermissions(context = {}) {
  const commandName = getContextCommandName(context.target, context.commandName);
  const channel = context.channel || getTargetChannel(context.target);
  const guild = context.guild || channel?.guild || context.target?.guild || null;
  const botMember = context.botMember || guild?.members?.me || null;
  const required = [
    ...DEFAULT_BOT_PERMISSIONS,
    ...(COMMAND_BOT_PERMISSIONS[String(commandName || "").toLowerCase()] || []),
    ...(context.requiredPermissions || []),
  ];

  if (!channel?.permissionsFor || !botMember) return { allowed: true, missing: [], required };
  if (botHasAdministrator(botMember)) return { allowed: true, missing: [], required };
  const perms = channel.permissionsFor(botMember);
  const missing = [...new Set(required)].filter(name => !perms?.has?.(toFlag(name)));
  return {
    allowed: missing.length === 0,
    required,
    missing,
    title: "Bot Missing Permission",
    message: missing.length ? `I need ${formatPerms(missing)} in ${channel} to do that cleanly.` : null,
  };
}

async function checkBotPermissionsFresh(context = {}) {
  const initial = checkBotPermissions(context);
  if (initial.allowed) return initial;

  const channel = context.channel || getTargetChannel(context.target);
  const guild = context.guild || channel?.guild || context.target?.guild || null;
  if (!guild?.members?.fetchMe) return initial;

  const refreshedBotMember = await guild.members.fetchMe({ force: true }).catch(() => null);
  if (!refreshedBotMember) return initial;
  return checkBotPermissions({ ...context, guild, channel, botMember: refreshedBotMember });
}

function checkPanelPermissions(interaction, options = {}) {
  const sessionOwnerId = extractPanelOwnerId(interaction, options);
  if (sessionOwnerId && interaction?.user?.id && sessionOwnerId !== interaction.user.id && !isPanelBypassOwner(interaction.user.id)) {
    return {
      allowed: false,
      ownerMismatch: true,
      title: "Not Your Panel",
      message: "Run the command yourself to use these controls.",
    };
  }
  if (String(interaction?.customId || "").startsWith("toggle_") && typeof isAuthorizedInteraction === "function" && !isAuthorizedInteraction(interaction)) {
    return {
      allowed: false,
      title: "Missing Permission",
      message: "Administrator permission is required to use this toggle panel.",
    };
  }
  if (String(interaction?.customId || "").startsWith("global_toggle_panel")) {
    const isBotOwner = globalThis.soezyOwnerManager?.isBotOwner?.(interaction.user?.id) || globalThis.config?.ownerIds?.includes(interaction.user?.id);
    if (!isBotOwner) {
      return {
        allowed: false,
        title: "Bot Owner Panel",
        message: "Only bot owners can use global feature toggles.",
      };
    }
  }
  if (typeof validateConfigInteractionPermissions === "function") {
    const perms = validateConfigInteractionPermissions(interaction);
    if (!perms.allowed) return {
      ...perms,
      title: "Missing Permission",
      message: perms.reason || "You do not have permission to use this panel.",
    };
  }
  return { allowed: true };
}

async function replyPermissionError(target, check) {
  if (!check || check.allowed) return false;
  const payload = {
    components: [createErrorContainer(check.title || "Missing Permission", check.message || "You do not have permission to do that.")],
    flags: MessageFlags.IsComponentsV2 | (target?.isRepliable?.() || target?.isMessageComponent?.() ? 64 : 0),
  };
  if (typeof safeReply === "function") await safeReply(target, payload);
  else if (target?.reply) await target.reply(payload).catch(() => {});
  return true;
}

Object.assign(globalThis, {
  checkCommandPermissions,
  checkBotPermissions,
  checkBotPermissionsFresh,
  checkPanelPermissions,
  botHasAdministrator,
  channelAllowsBot,
  replyPermissionError,
});

module.exports = { checkCommandPermissions, checkBotPermissions, checkBotPermissionsFresh, checkPanelPermissions, botHasAdministrator, channelAllowsBot, replyPermissionError };
})();
