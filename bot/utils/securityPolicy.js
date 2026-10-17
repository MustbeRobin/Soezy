(() => {
const securityFs = require("fs");
const securityPath = require("path");

const SECURITY_AUDIT_LOG = securityPath.join(process.cwd(), "logs", "security-audit.log");
const appendSecurityAudit = require(securityPath.resolve(process.cwd(), "utils/boundedLog")).createBoundedLog(SECURITY_AUDIT_LOG);
const SECURITY_COOLDOWN_MS = 5000;
const SECURITY_ADMIN_COOLDOWN_MS = 15000;

const ALIAS_TO_CANONICAL = Object.freeze({
  h: "help",
  commands: "help",
  clear: "purge",
  prune: "purge",
  cl: "purge",
  timeout: "mute",
  untimeout: "unmute",
  fakeban: "fban",
  fakekick: "fkick",
  fakemute: "fmute",
  ar: "addrole",
  eo: "extraowner",
  npx: "noprefix",
  prem: "premium",
  reboot: "restart",
  ev: "eval",
  sh: "exec",
  dbbackup: "backupdb",
  wipeserver: "resetserver",
  sleave: "serverleave",
  leaveguild: "serverleave",
  gstart: "gcreate",
  gw: "giveaway",
  g: "giveaway",
  gend: "giveaway",
  greroll: "giveaway",
  an: "antinuke",
  ab: "antibot",
  am: "automod",
  al: "antilink",
  antinlink: "antilink",
  antinlinl: "antilink",
  logs: "logging",
  bw: "badword",
  nsfw: "nsfwword",
  rr: "reactionrole",
  br: "buttonrole",
  cr: "customrole",
  vr: "vanityrole",
  tgr: "tagrole",
  tv: "tempvoice",
  ad: "autodelete",
  raidmode: "antiraid",
  agegate: "accountage",
  verification: "verify",
});

const OWNER_ONLY_COMMANDS = new Set([
  "eval", "exec", "restart", "gbot", "blacklist", "unblacklist", "blacklistserver",
  "broadcast", "ownersi", "ownerui", "finduser", "serverleave", "dbstats", "backupdb",
  "resetserver", "gtoggle", "globaltoggle", "genable", "gdisable", "dev",
  "savedb", "fixdb", "clearpoints",
]);

const MODERATION_COMMANDS = new Map([
  ["ban", "BanMembers"],
  ["unban", "BanMembers"],
  ["kick", "KickMembers"],
  ["mute", "ModerateMembers"],
  ["unmute", "ModerateMembers"],
  ["warn", "ModerateMembers"],
  ["clearwarns", "ModerateMembers"],
  ["removewarn", "ModerateMembers"],
  ["purge", "ManageMessages"],
  ["vcclean", "ManageMessages"],
  ["autojail", "ManageGuild"],
  ["setup-auto-jail", "ManageGuild"],
  ["disable-auto-jail", "ManageGuild"],
  ["auto-jail-status", "ManageGuild"],
  ["cuc", "ManageMessages"],
  ["clearuserchannel", "ManageMessages"],
  ["nuke", "ManageChannels"],
  ["lock", "ManageChannels"],
  ["unlock", "ManageChannels"],
  ["hide", "ManageChannels"],
  ["unhide", "ManageChannels"],
  ["slowmode", "ManageChannels"],
  ["quarantine", "ManageRoles"],
  ["release", "ManageRoles"],
  ["shadowmute", "ModerateMembers"],
  ["shadowunmute", "ModerateMembers"],
]);

const ADMIN_COMMANDS = new Set([
  "system", "command", "dashboard", "welcome", "goodbye", "boost", "antinuke", "antibot", "automod",
  "antilink", "antinlink", "antinlinl", "logging", "joindm", "sticky", "autoresponder", "autoreact", "ticket",
  "tempvoice", "permit", "ignore", "wall", "confession", "media", "autodelete",
  // "birthday" intentionally excluded — birthday handles its own sub-command permissions internally
  // (self-add/self-set need no permission; admin-set/config require ManageGuild checked inside messageCreate.js)
  "badword", "badwordwhitelist", "bwwhitelist", "badwordimmune", "whitelist", "wl", "filterwhitelist", "nsfwword", "nsfwwhitelist", "nsfwimmune",
  "antilinkwhitelist", "alwhitelist", "antinlinkwhitelist", "antinlinlwhitelist", "antilinkimmune", "alimmune", "antinlinkimmune", "antinlinlimmune", "automodwhitelist", "amwhitelist", "automodimmune", "setbotavatar", "setbotbanner", "botset",
  "setname", "setavatar", "setbanner", "embed", "rr", "reactionrole", "buttonrole",
  "customrole", "security", "lockdown", "rolelock", "antiraid", "verify",
  "warnpunish", "muteevasion", "send",
  "premiumchannel", "lockchannel", "premiumrole", "vanityrole", "tagrole",
  "humanrole", "humanroles", "botrole", "botroles", "massrole", "massroles", "memberrole", "memberroles",
]);

const ROLE_MANAGEMENT_COMMANDS = new Set([
  "addrole", "autorole", "buttonrole", "customrole", "rr", "reactionrole",
  "humanrole", "humanroles", "botrole", "botroles", "massrole", "massroles", "memberrole", "memberroles",
  "premiumrole", "vanityrole", "tagrole", "birthdayrole",
]);

const DANGEROUS_COMMANDS = new Set([
  ...OWNER_ONLY_COMMANDS,
  ...MODERATION_COMMANDS.keys(),
  ...ADMIN_COMMANDS,
  ...ROLE_MANAGEMENT_COMMANDS,
  "giveaway", "gcreate", "gall", "deleteemoji", "stealemoji", "addemoji",
  "massdm", "webhook", "webhookguard", "accountage", "agegate",
]);

const NO_PREFIX_BLOCKED_COMMANDS = new Set([
  ...DANGEROUS_COMMANDS,
  "prefix", "setprefix", "noprefix", "npx", "gnpx", "snpx", "enable", "disable",
  "givepoints", "bugapprove", "voteapprove",
]);

const securityCooldowns = globalThis.__soezySecurityCooldowns || (globalThis.__soezySecurityCooldowns = new Map());

function canonicalCommandName(command) {
  const clean = String(command || "").toLowerCase().trim();
  return ALIAS_TO_CANONICAL[clean] || clean;
}

function isBotOwner(userId, cfg = globalThis.config) {
  return globalThis.soezyOwnerManager?.isBotOwner?.(userId) ||
    (Array.isArray(cfg?.ownerIds) && cfg.ownerIds.includes(userId)) ||
    (Array.isArray(cfg?.owners) && cfg.owners.includes(userId));
}

function isSoezyDeveloper(userId, database = globalThis.db) {
  return Array.isArray(database?.devUsers) && database.devUsers.includes(userId);
}

function hasPermission(member, permissionName) {
  if (typeof globalThis.hasGuildPermission === "function") return globalThis.hasGuildPermission(member, [permissionName]);
  const flag = globalThis.PermissionsBitField?.Flags?.[permissionName];
  return !!(flag && member?.permissions?.has(flag));
}

function isGuildManager(member) {
  return hasPermission(member, "Administrator") || hasPermission(member, "ManageGuild");
}

function sanitizeSecurityText(value) {
  let text = String(value ?? "");
  const cfg = globalThis.config || {};
  for (const secret of [cfg.token, cfg.clientSecret, cfg.anthropicKey, cfg.spotifyClientSecret, cfg.bridgeSecret]) {
    if (secret && typeof secret === "string") text = text.split(secret).join("[REDACTED]");
  }
  return text
    .replace(/(mfa\.[\w-]{20,}|[\w-]{20,}\.[\w-]{6,}\.[\w-]{20,})/g, "[REDACTED_TOKEN]")
    .slice(0, 4000);
}

function writeSecurityAudit(event) {
  try {
    const line = JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n";
    appendSecurityAudit(line);
  } catch {}
}

function securityCooldownAllows(guildId, userId, command, windowMs) {
  const key = `${guildId || "global"}:${userId}:${command}`;
  const now = Date.now();
  const until = securityCooldowns.get(key) || 0;
  if (until > now) return { allowed: false, retryAfter: until - now };
  securityCooldowns.set(key, now + windowMs);
  return { allowed: true, retryAfter: 0 };
}

function cleanupSecurityCooldowns(now = Date.now()) {
  for (const [key, until] of securityCooldowns) {
    if (until <= now) securityCooldowns.delete(key);
  }
}

function canRunDangerousCommand(context = {}) {
  const command = canonicalCommandName(context.commandName || context.command);
  const userId = context.userId || context.user?.id || context.member?.id;
  const member = context.member;
  const guild = context.guild || member?.guild;
  const cfg = context.config || globalThis.config || {};
  const database = context.db || globalThis.db || {};
  const usedNoPrefix = !!context.isNoPrefixCommand;

  if (!command || !DANGEROUS_COMMANDS.has(command)) return { allowed: true, command };

  if (globalThis.isOwnerSecurityCommand?.(command)) {
    const allowed = !usedNoPrefix && globalThis.canManageAntiNuke?.(guild, userId) === true;
    return { allowed, command, reason: allowed ? null : "Only the configured bot owner or an authorized ExtraOwner can manage security using a prefix or slash command." };
  }

  const auditBase = {
    command,
    userId,
    guildId: guild?.id || context.guildId,
    source: context.source || "unknown",
    noPrefix: usedNoPrefix,
  };

  if (isBotOwner(userId, cfg)) {
    if ((command === "eval" || command === "exec") && process.env.SOEZY_ENABLE_RUNTIME_EXEC !== "true") {
      writeSecurityAudit({ ...auditBase, action: "blocked_runtime_exec_disabled" });
      return { allowed: false, reason: "Runtime code execution is disabled. Set SOEZY_ENABLE_RUNTIME_EXEC=true only in a trusted maintenance session." };
    }
    writeSecurityAudit({ ...auditBase, action: "owner_security_bypass" });
    return { allowed: true, command, ownerBypass: true };
  }

  if (usedNoPrefix || NO_PREFIX_BLOCKED_COMMANDS.has(command) && context.usedPrefix === "") {
    writeSecurityAudit({ ...auditBase, action: "blocked_no_prefix" });
    return { allowed: false, reason: "Dangerous commands require an explicit prefix or slash command." };
  }

  if (OWNER_ONLY_COMMANDS.has(command)) {
    if (!isBotOwner(userId, cfg)) {
      writeSecurityAudit({ ...auditBase, action: "blocked_owner_only" });
      return { allowed: false, reason: "This command is restricted to bot owners." };
    }
    if ((command === "eval" || command === "exec") && process.env.SOEZY_ENABLE_RUNTIME_EXEC !== "true") {
      writeSecurityAudit({ ...auditBase, action: "blocked_runtime_exec_disabled" });
      return { allowed: false, reason: "Runtime code execution is disabled. Set SOEZY_ENABLE_RUNTIME_EXEC=true only in a trusted maintenance session." };
    }
    writeSecurityAudit({ ...auditBase, action: "owner_command" });
    return securityCooldownAllows(guild?.id, userId, command, SECURITY_ADMIN_COOLDOWN_MS);
  }

  if (ROLE_MANAGEMENT_COMMANDS.has(command)) {
    if (!hasPermission(member, "ManageRoles") && !isGuildManager(member) && !isBotOwner(userId, cfg)) {
      writeSecurityAudit({ ...auditBase, action: "blocked_manage_roles" });
      return { allowed: false, reason: "Manage Roles permission is required." };
    }
  }

  const requiredModPerm = MODERATION_COMMANDS.get(command);
  if (requiredModPerm && !hasPermission(member, requiredModPerm) && !isBotOwner(userId, cfg)) {
    writeSecurityAudit({ ...auditBase, action: "blocked_missing_permission", required: requiredModPerm });
    return { allowed: false, reason: `${requiredModPerm} permission is required.` };
  }

  if (ADMIN_COMMANDS.has(command) && !isGuildManager(member) && !isBotOwner(userId, cfg) && !isSoezyDeveloper(userId, database)) {
    writeSecurityAudit({ ...auditBase, action: "blocked_admin_command" });
    return { allowed: false, reason: "Manage Server permission is required." };
  }

  if (context.securityEnableWarningPending) {
    writeSecurityAudit({ ...auditBase, action: "allowed_security_warning_pending" });
    return { allowed: true, command, warningPending: true };
  }

  const cooldown = securityCooldownAllows(
    guild?.id,
    userId,
    command,
    ADMIN_COMMANDS.has(command) || command === "nuke" ? SECURITY_ADMIN_COOLDOWN_MS : SECURITY_COOLDOWN_MS
  );
  if (!cooldown.allowed) {
    writeSecurityAudit({ ...auditBase, action: "blocked_security_cooldown", retryAfter: cooldown.retryAfter });
    const remaining = Math.max(1, Math.ceil((cooldown.retryAfter || 0) / 1000));
    return { allowed: false, reason: `Security cooldown active.\nPlease wait ${remaining} second${remaining === 1 ? "" : "s"} before using this command again.` };
  }

  writeSecurityAudit({ ...auditBase, action: "allowed_dangerous" });
  return { allowed: true, command };
}

function filterNoPrefixCommands(commands) {
  const safe = new Set();
  for (const command of commands || []) {
    const canonical = canonicalCommandName(command);
    if (!NO_PREFIX_BLOCKED_COMMANDS.has(canonical) && !DANGEROUS_COMMANDS.has(canonical)) safe.add(command);
  }
  return safe;
}

if (!globalThis.__soezySecurityPolicyCleanupInterval) {
  globalThis.__soezySecurityPolicyCleanupInterval = setInterval(cleanupSecurityCooldowns, 60 * 1000);
  globalThis.__soezySecurityPolicyCleanupInterval.unref?.();
}

Object.assign(globalThis, {
  DANGEROUS_COMMANDS,
  NO_PREFIX_BLOCKED_COMMANDS,
  canonicalCommandName,
  canRunDangerousCommand,
  filterNoPrefixCommands,
  sanitizeSecurityText,
  writeSecurityAudit,
  cleanupSecurityCooldowns,
});

module.exports = {
  DANGEROUS_COMMANDS,
  NO_PREFIX_BLOCKED_COMMANDS,
  canonicalCommandName,
  canRunDangerousCommand,
  filterNoPrefixCommands,
  sanitizeSecurityText,
  writeSecurityAudit,
  cleanupSecurityCooldowns,
};
})();
