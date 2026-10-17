"use strict";
(() => {

async function resolveGuildMember(target) {
  if (!target) return null;
  if (target.member?.permissions) return target.member;
  const guild = target.guild || target.member?.guild || null;
  const userId = target.user?.id || target.author?.id || target.member?.id || null;
  if (!guild || !userId) return target.member || null;
  const fetched = await guild.members.fetch(userId).catch(() => null);
  if (fetched && "member" in target) target.member = fetched;
  return fetched || target.member || null;
}

function hasGuildPermission(member, perms = [], options = {}) {
  const required = Array.isArray(perms) ? perms : [perms];
  if (!member?.permissions) return required.length === 0;
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  return required.every(perm => {
    const flag = PermissionsBitField.Flags[perm] || perm;
    return member.permissions.has(flag);
  });
}

Object.assign(globalThis, {
  canManageSecurityFeature,
  canManageAntiNuke,
  isAntiNukeInteraction,
  isOwnerSecurityCommand,
  isOwnerSecurityInteraction,
  handleExtraOwnerCommand,
  resolveGuildMember,
  hasGuildPermission,
});

function canManageSecurityFeature(guild, userId, feature = "security") {
  const id = String(userId || "");
  if (!guild?.id || !id) return false;
  if ((typeof isConfiguredBotOwner === "function" && isConfiguredBotOwner(id)) || globalThis.soezyOwnerManager?.isBotOwner?.(id) === true) return true;
  const gd = guildData(guild.id) || {};
  if ((Array.isArray(gd.extraOwners) ? gd.extraOwners : []).map(String).includes(id)) return true;
  return false;
}

function canManageAntiNuke(guild, userId) {
  return canManageSecurityFeature(guild, userId);
}

function isSecurityHelpNavigation(interaction) {
  return !interaction?.commandName && /^help_(category|cat|main|prevmod|nextmod|prev|next|first|last|close|home)_/.test(interaction?.customId || "");
}

function isAntiNukeInteraction(interaction) {
  if (isSecurityHelpNavigation(interaction)) return false;
  return interaction?.commandName === "antinuke" || /^(ancfg_|anmod_|antinuke_)/.test(interaction?.customId || "") ||
    /(?:^|_)antinuke(?:_|$)/.test(interaction?.customId || "") ||
    (interaction?.values || []).some(value => /(?:^|_)antinuke(?:_|$)/.test(value));
}

const ownerSecurityCommands = new Set(["antinuke", "an", "automod", "am", "automode", "security", "securityhelp", "nightmode",
    "verify", "verification", "wall", "antibot", "ab", "antiraid", "raidmode", "whitelist", "wl", "immune", "botgrant", "botrevoke",
    "antilink", "al", "antinlink", "antinlinl", "badword", "badwords", "bw", "nsfw", "nsfwword", "antimention", "antimassmention"]);
function isOwnerSecurityCommand(command) {
  const name = String(command || "").toLowerCase();
  return ownerSecurityCommands.has(name) || /(?:whitelist|immune)$/.test(name);
}

function isOwnerSecurityInteraction(interaction) {
  if (isSecurityHelpNavigation(interaction)) return false;
  const id = String(interaction?.customId || "");
  // Member-facing verification and appeal actions are not configuration.
  if (/^(verify_btn_|verify_approve_|verify_deny_|wallappeal_(open|approve|cancel|close))/.test(id)) return false;
  if (isOwnerSecurityCommand(interaction?.commandName)) return true;
  if (/^(ancfg_|anmod_|antinuke_|amcfg_|ammod_|automod_|amchwl_|amadvlog_|amadvpunish_|abcfg_|abmod_|antibot_|antiraid_|secfg_|secmod_|wscfg_|wsmod_|wlcfg_|wlmod_|secwl_|whitelistsetup_|securitywarn_|vcfg_|vcmod_|verifyconfig_|verify_enable_|wallappeal_config_)/.test(id)) return true;
  if (typeof isVerifyConfigModalSubmit === "function" && isVerifyConfigModalSubmit(interaction)) return true;
  return isAntiNukeInteraction(interaction) || /(?:^|_)(automod|antibot|antiraid|security|verify|wall|whitelist)(?:_|$)/.test(id) ||
    (/^(toggle_|cfg_|config_|dash_)/.test(id) && (interaction?.values || []).some(value => isOwnerSecurityCommand(value)));
}

async function handleExtraOwnerCommand(msg, args, prefix) {
  const reply = (title, text, error = false) => msg.reply({
    components: [(error ? createErrorContainer : createInfoContainer)(title, text)],
    flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] },
  });
  if (!msg.guild || !(typeof isConfiguredBotOwner === "function" && isConfiguredBotOwner(msg.author.id))) return reply("Access Denied", "Only the configured bot owner can manage ExtraOwners.", true);
  const gd = guildData(msg.guild.id);
  gd.extraOwners ||= [];
  const action = String(args[0] || "list").toLowerCase();
  if (action === "list") return reply("Extra Owners", gd.extraOwners.map(id => `<@${id}> (\`${id}\`)`).join("\n").slice(0, 3500) || "No extra owners configured.");
  const id = value => /^<@!?\d{17,20}>$|^\d{17,20}$/.test(value || "") ? value.replace(/[<@!>]/g, "") : null;
  const targetId = id(args[1]), replacementId = id(args[2]);
  if (!["add", "remove", "edit"].includes(action) || !targetId || (action === "edit" && !replacementId)) {
    return reply("Extra Owner Commands", `\`${prefix}extraowner add @user\`\n\`${prefix}extraowner remove @user\`\n\`${prefix}extraowner edit @old @new\`\n\`${prefix}extraowner list\``, true);
  }
  if (targetId === msg.author.id || (action === "edit" && replacementId === msg.author.id)) {
    return reply("Invalid Member", "You cannot add or modify your own ExtraOwner access.", true);
  }
  if (action !== "add" && !gd.extraOwners.includes(targetId)) return reply("Not Found", "That user is not an extra owner.", true);
  if (action !== "remove") {
    const newId = action === "edit" ? replacementId : targetId;
    const member = await msg.guild.members.fetch(newId).catch(() => null);
    if (!member || member.user.bot) return reply("Invalid Member", "Choose a human member of this server.", true);
    if (gd.extraOwners.includes(newId) && !(action === "edit" && newId === targetId)) return reply("Already Added", "That member is already an extra owner.", true);
    if (action === "add" && gd.extraOwners.length >= 25) return reply("Limit Reached", "A server can have up to 25 extra owners.", true);
    gd.extraOwners = action === "edit" ? gd.extraOwners.map(old => old === targetId ? newId : old) : [...gd.extraOwners, newId];
  } else gd.extraOwners = gd.extraOwners.filter(old => old !== targetId);
  saveDB(msg.guild.id);
  return reply("Extra Owners Updated", "Saved. Extra owners can manage AntiNuke, AutoMod, security, verification, wall and whitelists in this server only.");
}

module.exports = { resolveGuildMember, hasGuildPermission };
})();
