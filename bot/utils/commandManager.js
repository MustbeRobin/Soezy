/* ================= CONSOLIDATED COMMAND MANAGER ================= */
(() => {
const EXECUTION_TTL_MS = 30 * 1000;
const activeExecutions = globalThis.__soezyActiveCommandExecutions || (globalThis.__soezyActiveCommandExecutions = new Map());

function makeExecutionKey(source, id, guildId, userId, commandName) {
  return `${source}:${id || `${guildId || "dm"}:${userId || "unknown"}:${commandName || "unknown"}`}`;
}

function beginCommandExecution(context = {}) {
  const now = Date.now();
  const key = makeExecutionKey(context.source, context.id, context.guildId, context.userId, context.commandName);
  const existing = activeExecutions.get(key);
  if (existing && existing.expiresAt > now) {
    if (typeof incMetric === "function") incMetric("commands", "duplicateExecutionBlocked", 1);
    return { allowed: false, key, startedAt: existing.startedAt };
  }
  activeExecutions.set(key, {
    commandName: context.commandName,
    source: context.source,
    guildId: context.guildId,
    userId: context.userId,
    startedAt: now,
    expiresAt: now + EXECUTION_TTL_MS,
  });
  return { allowed: true, key, startedAt: now };
}

function endCommandExecution(key, error = null) {
  const record = activeExecutions.get(key);
  if (!record) return 0;
  activeExecutions.delete(key);
  const elapsed = Date.now() - record.startedAt;
  if (typeof incMetric === "function") incMetric("commands", `${record.source}:${record.commandName}:count`, 1);
  if (typeof incMetric === "function") incMetric("commands", `${record.source}:${record.commandName}:ms`, elapsed);
  if (typeof recordCommandMetric === "function") recordCommandMetric(record.source, record.commandName, elapsed, error);
  if (elapsed > 1000 || error) {
    console.log(`[COMMAND] ${record.source}:${record.commandName} guild=${record.guildId || "dm"} user=${record.userId || "unknown"} ms=${elapsed}${error ? ` error=${error.message}` : ""}`);
  }
  return elapsed;
}

function cleanupCommandExecutions(now = Date.now()) {
  for (const [key, record] of activeExecutions) {
    if (record.expiresAt <= now) activeExecutions.delete(key);
  }
}

function parseCommandArgs(content, prefix) {
  const raw = String(content || "").trim();
  if (!prefix || !raw.toLowerCase().startsWith(String(prefix).toLowerCase())) return null;
  const body = raw.slice(String(prefix).length).trim();
  if (!body) return null;
  const parts = body.split(/\s+/).filter(Boolean);
  return { commandName: (parts.shift() || "").toLowerCase(), args: parts };
}

if (!globalThis.__soezyCommandExecutionCleanupInterval) {
  globalThis.__soezyCommandExecutionCleanupInterval = setInterval(cleanupCommandExecutions, 60 * 1000);
  globalThis.__soezyCommandExecutionCleanupInterval.unref?.();
}

Object.assign(globalThis, {
  soezyCommandManager: {
    beginCommandExecution,
    endCommandExecution,
    cleanupCommandExecutions,
    parseCommandArgs,
  },
  beginCommandExecution,
  endCommandExecution,
  parseCommandArgs,
});


/* ---- Registry merged from commandRegistry.js ---- */
const aliasToCommand = globalThis.__soezyAliasToCommand || (globalThis.__soezyAliasToCommand = new Map());
const invocationAliasToCommand = globalThis.__soezyInvocationAliasToCommand || (globalThis.__soezyInvocationAliasToCommand = new Map());
const commandMeta = globalThis.__soezyCommandMeta || (globalThis.__soezyCommandMeta = new Map());
const commandCategoryCache = globalThis.__soezyCommandCategoryCache || (globalThis.__soezyCommandCategoryCache = {
  aliases: aliasToCommand,
  categories: new Map(),
  permissions: new Map(),
  cooldowns: new Map(),
  rebuiltAt: 0,
});

function normalizeCommandName(name) {
  return String(name || "").trim().toLowerCase();
}

function normalizeCommandPhrase(name) {
  return normalizeCommandName(name).replace(/\s+/g, " ");
}

function registerInvocationAlias(phrase, commandName, argsPrefix = [], meta = {}) {
  const normalizedPhrase = normalizeCommandPhrase(phrase);
  const normalizedCommand = normalizeCommandName(commandName);
  if (!normalizedPhrase || !normalizedCommand) return null;
  const existing = invocationAliasToCommand.get(normalizedPhrase);
  if (existing && existing.commandName !== normalizedCommand && normalizedPhrase !== normalizedCommand) {
    const existingMeta = commandMeta.get(existing.commandName) || {};
    if (existing.commandName === normalizedPhrase || (!existingMeta.ownerOnly && meta.ownerOnly)) return existing;
    return existing;
  }
  const record = {
    commandName: normalizedCommand,
    argsPrefix: (argsPrefix || []).map(normalizeCommandName).filter(Boolean),
    consumed: normalizedPhrase.split(/\s+/).length,
    category: meta.category || "default",
    ownerOnly: !!meta.ownerOnly,
  };
  invocationAliasToCommand.set(normalizedPhrase, record);
  return record;
}

function registerCommandMeta(name, meta = {}) {
  const commandName = normalizeCommandName(name);
  if (!commandName) return null;
  const merged = { name: commandName, aliases: [], category: "default", ownerOnly: false, noPrefixAllowed: true, ...meta };
  commandMeta.set(commandName, merged);
  aliasToCommand.set(commandName, commandName);
  for (const alias of merged.aliases || []) {
    const normalizedAlias = normalizeCommandName(alias);
    if (!normalizedAlias) continue;
    const existing = aliasToCommand.get(normalizedAlias);
    const existingMeta = existing ? commandMeta.get(existing) : null;
    if (existing && existing !== commandName && (existing === normalizedAlias || (!existingMeta?.ownerOnly && merged.ownerOnly))) continue;
    if (!existing || existing === commandName) aliasToCommand.set(normalizedAlias, commandName);
  }
  commandCategoryCache.categories.set(commandName, merged.category || "default");
  commandCategoryCache.permissions.set(commandName, merged.requiredPermissions || []);
  if (typeof getCommandCooldownMs === "function") {
    commandCategoryCache.cooldowns.set(commandName, getCommandCooldownMs(commandName, { category: merged.category }));
  }
  return merged;
}

function rebuildCommandRegistryFromHelp() {
  aliasToCommand.clear();
  invocationAliasToCommand.clear();
  commandMeta.clear();
  commandCategoryCache.categories.clear();
  commandCategoryCache.permissions.clear();
  commandCategoryCache.cooldowns.clear();
  if (typeof ALL_COMMANDS === "undefined") return commandMeta;
  for (const [categoryKey, category] of Object.entries(ALL_COMMANDS || {})) {
    for (const command of category.commands || []) {
      const commandPhrase = normalizeCommandPhrase(command.name || "");
      const commandParts = commandPhrase.split(/\s+/).filter(Boolean);
      const base = commandParts[0];
      if (!base) continue;
      const canonicalArgsPrefix = commandParts.slice(1);
      const simpleAliases = [];
      for (const alias of command.aliases || []) {
        const aliasPhrase = normalizeCommandPhrase(alias);
        if (!aliasPhrase) continue;
        const aliasParts = aliasPhrase.split(/\s+/).filter(Boolean);
        if (aliasParts.length === 1) simpleAliases.push(aliasParts[0]);
        registerInvocationAlias(aliasPhrase, base, canonicalArgsPrefix, {
          category: categoryKey,
          ownerOnly: categoryKey === "owner_only",
        });
      }
      registerCommandMeta(base, {
        aliases: simpleAliases,
        category: categoryKey,
        ownerOnly: categoryKey === "owner_only",
      });
      registerInvocationAlias(commandPhrase, base, canonicalArgsPrefix, {
        category: categoryKey,
        ownerOnly: categoryKey === "owner_only",
      });
    }
  }
  if (typeof soezyOwnerManager?.ownerOnlyCommandNames === "function") {
    for (const name of soezyOwnerManager.ownerOnlyCommandNames()) {
      const existing = commandMeta.get(name) || {};
      registerCommandMeta(name, { ...existing, ownerOnly: true, category: "owner_only" });
    }
  }
  commandCategoryCache.rebuiltAt = Date.now();
  return commandMeta;
}

function resolveCommandName(name) {
  const normalized = normalizeCommandName(name);
  if (!aliasToCommand.size) rebuildCommandRegistryFromHelp();
  return aliasToCommand.get(normalized) || normalized;
}

function resolveCommandInvocation(commandName, args = []) {
  if (!invocationAliasToCommand.size) rebuildCommandRegistryFromHelp();
  const commandToken = normalizeCommandName(commandName);
  const normalizeFilterToggle = values => {
    const action = normalizeCommandName(values[0]);
    if (["on", "true", "1"].includes(action)) return ["enable", ...values.slice(1)];
    if (["off", "false", "0"].includes(action)) return ["disable", ...values.slice(1)];
    return values;
  };
  if (["nsfwwhitelist", "nsfwimmune", "nsfwfilter"].includes(commandToken) && ["enable", "disable", "on", "off"].includes(normalizeCommandName(args[0]))) {
    return { commandName: "nsfw", args: normalizeFilterToggle(args) };
  }
  // Compatibility paths resolve before dispatch, so permissions and state updates are shared.
  if (["automod", "am", "automode"].includes(commandToken)) {
    const rule = normalizeCommandName(args[0]);
    const aliases = {
      antilink: "antilink", link: "antilink", links: "antilink", "anti-link": "antilink", antinlink: "antilink", antinlinl: "antilink",
      badword: "badword", badwords: "badword", bw: "badword", words: "badword", antiword: "badword",
      nsfw: "nsfw", antinsfw: "nsfw", nsfwprotection: "nsfw",
      mention: "antimention", mentions: "antimention", massmention: "antimention", massmentions: "antimention",
      antimention: "antimention", antimassmention: "antimention", mentionspam: "antimention", "mention-spam": "antimention",
    };
    if (aliases[rule]) return { commandName: aliases[rule], args: normalizeFilterToggle(args.slice(1)) };
  }
  const normalizedArgs = (args || []).map(arg => normalizeCommandName(arg));
  const parts = [commandToken, ...normalizedArgs].filter(Boolean);
  const maxLen = Math.min(parts.length, 6);
  for (let len = maxLen; len >= 1; len--) {
    const phrase = parts.slice(0, len).join(" ");
    const match = invocationAliasToCommand.get(phrase);
    if (!match) continue;
    return {
      commandName: match.commandName,
      args: [...match.argsPrefix, ...(args || []).slice(Math.max(0, match.consumed - 1))],
    };
  }
  return { commandName: resolveCommandName(commandName), args };
}

function getCommandMeta(name) {
  const resolved = resolveCommandName(name);
  return commandMeta.get(resolved) || { name: resolved, aliases: [], category: "default", ownerOnly: false, noPrefixAllowed: true };
}

function getCommandCategoryCached(name) {
  const resolved = resolveCommandName(name);
  if (!commandCategoryCache.categories.size) rebuildCommandRegistryFromHelp();
  return commandCategoryCache.categories.get(resolved) || getCommandMeta(resolved).category || "default";
}

function getCommandPermissionsCached(name) {
  const resolved = resolveCommandName(name);
  if (!commandCategoryCache.permissions.size) rebuildCommandRegistryFromHelp();
  return commandCategoryCache.permissions.get(resolved) || [];
}

function getCommandCooldownCached(name) {
  const resolved = resolveCommandName(name);
  if (!commandCategoryCache.cooldowns.size) rebuildCommandRegistryFromHelp();
  return commandCategoryCache.cooldowns.get(resolved) || (typeof getCommandCooldownMs === "function" ? getCommandCooldownMs(resolved) : 5000);
}

Object.assign(globalThis, {
  soezyCommandRegistry: {
    registerCommandMeta,
    rebuildCommandRegistryFromHelp,
    resolveCommandName,
    resolveCommandInvocation,
    getCommandMeta,
    normalizeCommandName,
    getCommandCategoryCached,
    getCommandPermissionsCached,
    getCommandCooldownCached,
    commandCategoryCache,
    aliasToCommand,
    invocationAliasToCommand,
    commandMeta,
  },
  resolveRegisteredCommandName: resolveCommandName,
  resolveCommandInvocation,
  getRegisteredCommandMeta: getCommandMeta,
  getCommandCategoryCached,
  getCommandPermissionsCached,
  getCommandCooldownCached,
});


/* ---- Router/permission hooks merged from commandRouter.js ---- */
function canRunOwnerOnlyCommand(userId, commandName) {
  const meta = typeof getRegisteredCommandMeta === "function" ? getRegisteredCommandMeta(commandName) : null;
  const ownerOnly = meta?.ownerOnly || soezyOwnerManager?.ownerOnlyCommandNames?.().has(String(commandName || "").toLowerCase());
  if (!ownerOnly) return { allowed: true, ownerOnly: false };
  // Owner manager is normally the source of truth. The normalized config
  // fallback also keeps every configured owner working after a hot reload
  // where the manager may still reference an older config object.
  const id = String(userId || "").trim();
  const configuredOwners = [
    ...(Array.isArray(config?.ownerIds) ? config.ownerIds : []),
    ...(Array.isArray(config?.owners) ? config.owners : []),
  ].map(value => String(value || "").trim());
  const allowed = !!soezyOwnerManager?.isBotOwner?.(id) || configuredOwners.includes(id);
  return { allowed, ownerOnly: true };
}

function routeCommandName(commandName) {
  return typeof resolveRegisteredCommandName === "function"
    ? resolveRegisteredCommandName(commandName)
    : String(commandName || "").toLowerCase();
}

const COMMAND_FEATURE_CATEGORIES = Object.freeze({
  accountage: "accountage",
  agegate: "accountage",
  afk: "afk",
  antibot: "antibot",
  ab: "antibot",
  antilink: "antilink",
  al: "antilink",
  antinlink: "antilink",
  antinlinl: "antilink",
  antinuke: "antinuke",
  an: "antinuke",
  antiraid: "antiraid",
  autoreact: "autoreact",
  autoresponder: "autoresponder",
  automod: "automod",
  am: "automod",
  automode: "automod",
  birthday: "birthday",
  bday: "birthday",
  boost: "boost",
  confession: "confession",
  confess: "confession",
  counting: "counting",
  count: "counting",
  customrole: "customroles",
  customroles: "customroles",
  fun: "fun",
  giveaway: "giveaway",
  gw: "giveaway",
  g: "giveaway",
  goodbye: "goodbye",
  bye: "goodbye",
  invites: "invites",
  invite: "invites",
  joindm: "joindm",
  logging: "logging",
  logs: "logging",
  media: "media",
  mediaonly: "media",
  security: "security",
  sticky: "sticky",
  tempvoice: "tempvoice",
  tv: "tempvoice",
  ticket: "ticket",
  wall: "wall",
  welcome: "welcome",
  greet: "welcome",
  warnpunish: "warnpunish",
  muteevasion: "muteevasion",
  music: "music",
  no_prefix: "noPrefix",
  noprefix: "noPrefix",
  ai: "ai",
});

const KNOWN_TOGGLE_FEATURES = new Set([
  "accountage", "afk", "antibot", "antilink", "antinuke", "antiraid", "autoreact",
  "autoresponder", "automod", "birthday", "boost", "confession", "counting",
  "customroles", "fun", "giveaway", "goodbye", "invites", "joindm",
  "logging", "media", "muteevasion", "security", "sticky",
  "tempvoice", "ticket", "verify", "wall", "warnpunish", "welcome",
]);

const FEATURE_MANAGEMENT_COMMANDS = new Set([
  "botgrant", "botrevoke",
  "afk",
  "accountage", "agegate",
  "antibot", "ab",
  "antilink", "al", "antinlink", "antinlinl",
  "antinuke", "an",
  "antiraid",
  "autoreact",
  "autoresponder",
  "automod", "am", "automode",
  "birthday", "bday",
  "boost",
  "confession", "confess",
  "counting", "count",
  "customrole", "customroles",
  "fun",
  "giveaway", "gw", "g",
  "goodbye", "bye",
  "invites", "invite",
  "joindm",
  "logging", "logs",
  "media", "mediaonly",
  "security",
  "sticky",
  
  "tempvoice", "tv",
  "ticket",
  "wall",
  "welcome", "greet",
  "warnpunish",
  "muteevasion",
]);

const FEATURE_MANAGEMENT_SUBCOMMANDS = new Set([
  "", "config", "settings", "setup", "status",
  "enable", "disable", "toggle", "on", "off",
  "set", "setlogs", "setchannel", "setdays", "setaction",
  "channel", "logs", "role", "action", "punishment", "events",
  "whitelist", "wl", "unwhitelist", "unwl", "whitelistlist", "wllist",
  "setwhitelist", "setwl", "removewhitelist", "removewl",
  "immunerole", "immunechannel", "addrole", "removerole", "adduser", "removeuser", "addchannel", "removechannel",
  "clearroles", "clearusers", "clearchannels",
  "add", "remove", "list", "reset",
]);


const COMMAND_PERMISSION_REQUIREMENTS = Object.freeze({
  ban: ["BanMembers"],
  unban: ["BanMembers"],
  kick: ["KickMembers"],
  mute: ["ModerateMembers"],
  unmute: ["ModerateMembers"],
  timeout: ["ModerateMembers"],
  warn: ["ModerateMembers"],
  warnpunish: ["ModerateMembers"],
  removewarn: ["ModerateMembers"],
  clearwarns: ["ModerateMembers"],
  warnings: ["ModerateMembers"],
  casehistory: ["ModerateMembers"],
  modstats: ["ModerateMembers"],
  purge: ["ManageMessages"],
  clear: ["ManageMessages"],
  pin: ["ManageMessages"],
  cuc: ["ManageMessages"],
  clearuserchannel: ["ManageMessages"],
  cl: ["ManageMessages"],
  snipe: ["ManageMessages"],
  snipeall: ["ManageMessages"],
  editsnipe: ["ManageMessages"],
  editsnipeall: ["ManageMessages"],
  clearsnipe: ["ManageMessages"],
  lock: ["ManageChannels"],
  unlock: ["ManageChannels"],
  hide: ["ManageChannels"],
  unhide: ["ManageChannels"],
  nuke: ["ManageChannels", "ManageMessages"],
  slowmode: ["ManageChannels"],
  antiraid: ["Administrator"],
  verify: ["ManageGuild"],
  send: ["ManageMessages", "ManageGuild"],
  nick: ["ManageNicknames"],
  nickname: ["ManageNicknames"],
  setnick: ["ManageNicknames"],
  changenick: ["ManageNicknames"],
  roleinfo: [],
  config: ["ManageGuild"],
  antilink: ["ManageGuild"],
  antinlink: ["ManageGuild"],
  antinlinl: ["ManageGuild"],
  antibot: ["ManageGuild"],
  botgrant: ["ManageGuild"],
  botrevoke: ["ManageGuild"],
  antinuke: ["Administrator"],
  automod: ["ManageGuild"],
  autorole: ["ManageGuild"],
  humanrole: ["ManageRoles"],
  humanroles: ["ManageRoles"],
  botrole: ["ManageRoles"],
  botroles: ["ManageRoles"],
  massrole: ["ManageRoles"],
  massroles: ["ManageRoles"],
  memberrole: ["ManageRoles"],
  memberroles: ["ManageRoles"],
  autoresponder: ["ManageGuild"],
  autoreact: ["ManageGuild"],
  birthday: [],
  bday: [],
  birth: [],
  boost: ["ManageGuild"],
  confess: ["ManageGuild"],
  logging: ["ManageGuild"],
  joindm: ["ManageGuild"],
  goodbye: ["ManageGuild"],
  embed: ["ManageMessages"],
  tempvoice: ["ManageGuild"],
  sticky: ["ManageMessages"],
  media: ["ManageGuild"],
  wall: ["ManageGuild"],
  ticket: ["ManageGuild"],
  welcome: ["ManageGuild"],
});

const CONFIG_INTERACTION_PREFIXES = [
  "cfg_", "config_", "dash_", "toggle_", "stcfg_", "ticfg_", "wlcfg_", "gbcfg_",
  "jdmod_", "gbmod_", "embnamed", "emblist_", "ws_", "wsmod_", "vcfg_", "vcmod_",
  "arcfg_", "autorc_", "ancfg_", "anmod_", "automod_", "logcfg_", "global_toggle_panel", "nsfwcfg_", "bwlist_", "nsfwlist_",
];

function permissionFlag(name) {
  return PermissionsBitField?.Flags?.[name] || null;
}

function hasAnyAdminBypass(member, guild, userId) {
  if (globalThis.soezyOwnerManager?.isBotOwner?.(userId) || globalThis.config?.ownerIds?.includes(userId)) return true;
  if (guild?.ownerId && guild.ownerId === userId) return true;
  if (typeof hasGuildPermission === "function" && hasGuildPermission(member, ["Administrator"])) return true;
  if (member?.permissions?.has?.(permissionFlag("Administrator"))) return true;
  if (member?.permissions?.has?.("Administrator")) return true;
  return false;
}

function hasPermission(member, permissionName, options = {}) {
  const guild = options.guild || member?.guild || null;
  const userId = options.userId || member?.id || null;
  if (hasAnyAdminBypass(member, guild, userId)) return true;
  if (typeof hasGuildPermission === "function") return hasGuildPermission(member, [permissionName]);
  const flag = permissionFlag(permissionName);
  return flag ? Boolean(member?.permissions?.has?.(flag)) : Boolean(member?.permissions?.has?.(permissionName));
}

function canManageTarget(executor, target, options = {}) {
  const guild = options.guild || executor?.guild || target?.guild || null;
  const botMember = options.botMember || guild?.members?.me || null;
  const targetMember = target?.roles ? target : null;
  const userId = options.userId || executor?.id || null;
  if (!guild || !executor || !targetMember) return { allowed: false, reason: "Target member could not be resolved." };
  if (targetMember.id === guild.ownerId) return { allowed: false, reason: "The server owner cannot be managed." };
  if (targetMember.id === botMember?.id) return { allowed: false, reason: "I cannot manage myself." };
  const executorBypass = hasAnyAdminBypass(executor, guild, userId);
  if (!executorBypass && executor.roles?.highest?.position <= targetMember.roles?.highest?.position) {
    return { allowed: false, reason: "Your highest role must be above the target member's highest role." };
  }
  if (botMember?.roles?.highest?.position <= targetMember.roles?.highest?.position) {
    return { allowed: false, reason: "My highest role must be above the target member's highest role." };
  }
  return { allowed: true };
}

function checkUserPerms(context = {}) {
  return validateCommandPermissions(context);
}

function checkBotPerms(context = {}) {
  return typeof checkBotPermissions === "function"
    ? checkBotPermissions(context)
    : { allowed: true, missing: [] };
}

function missingPermissions(member, required = [], guild = null, userId = null) {
  if (!required.length || hasAnyAdminBypass(member, guild, userId)) return [];
  if (typeof hasGuildPermission === "function" && hasGuildPermission(member, required)) return [];
  return required.filter(name => {
    const flag = permissionFlag(name);
    return flag ? !member?.permissions?.has?.(flag) : !member?.permissions?.has?.(name);
  });
}

function requiredPermissionsForCommand(commandName) {
  const command = routeCommandName(commandName);
  if (command === "birthday" || command === "bday" || command === "birth") return [];
  const meta = typeof getRegisteredCommandMeta === "function" ? getRegisteredCommandMeta(command) : null;
  if (COMMAND_PERMISSION_REQUIREMENTS[command]) return COMMAND_PERMISSION_REQUIREMENTS[command];
  if (meta?.requiredPermissions?.length) return meta.requiredPermissions;
  if (meta?.category === "config") return ["ManageGuild"];
  return [];
}

function getCommandFeatureName(commandName) {
  const command = routeCommandName(commandName);
  const category = typeof getCommandCategoryCached === "function"
    ? getCommandCategoryCached(command)
    : (typeof getRegisteredCommandMeta === "function" ? getRegisteredCommandMeta(command)?.category : "default");
  return COMMAND_FEATURE_CATEGORIES[command] || COMMAND_FEATURE_CATEGORIES[category] || category || "default";
}

function getFeatureSubcommand(context = {}) {
  return String(
    context.subcommand ||
    context.subCommand ||
    context.subcommandName ||
    context.args?.[0] ||
    ""
  ).toLowerCase();
}

function canBypassFeatureGate(commandName, featureName, context = {}) {
  const command = routeCommandName(commandName);
  const rawCommand = String(commandName || "").toLowerCase();
  if (!FEATURE_MANAGEMENT_COMMANDS.has(command) && !FEATURE_MANAGEMENT_COMMANDS.has(rawCommand)) return false;
  const subcommand = getFeatureSubcommand(context);
  if (!subcommand || FEATURE_MANAGEMENT_SUBCOMMANDS.has(subcommand)) return true;
  if (["accountage", "antibot", "antilink", "antinuke", "antiraid", "automod", "security"].includes(featureName)) return true;
  return KNOWN_TOGGLE_FEATURES.has(featureName);
}

function isGuildFeatureEnabled(guildId, featureName) {
  if (!guildId || !featureName || featureName === "default" || featureName === "utility" || featureName === "moderation") return true;
  const gd = typeof guildData === "function" ? guildData(guildId) : globalThis.db?.guilds?.[guildId];
  if (!gd) return true;
  if (gd.disabledFeatures?.includes?.(featureName)) return false;
  const guildSystems = globalThis.db?.guildSystems?.[guildId];
  if (guildSystems && typeof guildSystems[featureName] === "boolean") return guildSystems[featureName];
  if (gd.features?.[featureName] === false) return false;
  if (gd.features?.[featureName] === true) return true;
  const perSystemState = {
    accountage: gd.accountAge?.enabled,
    antibot: gd.antibot?.enabled,
    antilink: gd.antilink?.enabled,
    antinuke: gd.antinuke?.enabled,
    antiraid: gd.security?.antiraid?.enabled,
    automod: gd.automod?.enabled,
    afk: gd.afk?.enabled,
    birthday: gd.birthday?.enabled,
    boost: gd.boost?.enabled,
    confession: gd.confession?.enabled,
    counting: gd.countingSystem?.enabled,
    customroles: gd.customRoles?.enabled ?? gd.customroles?.enabled,
    fun: gd.fun?.enabled,
    giveaway: gd.giveawaySystem?.enabled,
    goodbye: gd.goodbye?.enabled,
    invites: gd.inviteSystem?.enabled,
    joindm: gd.joinDm?.enabled,
    logging: gd.logging?.enabled,
    media: gd.media?.enabled,
    music: gd.music?.enabled,
    muteevasion: gd.muteEvasion?.enabled,
    noPrefix: gd.noPrefix?.enabled,
    security: gd.security?.enabled,
    sticky: gd.stickySystem?.enabled,
    tempvoice: gd.tempVoice?.enabled ?? gd.tempvoice?.enabled,
    ticket: gd.ticket?.enabled,
    wall: gd.wallSystem?.enabled,
    warnpunish: gd.warnPunish?.enabled,
    welcome: gd.welcome?.enabled,
    ai: gd.ai?.enabled,
  }[featureName];
  if (typeof perSystemState === "boolean") return perSystemState;
  if (KNOWN_TOGGLE_FEATURES.has(featureName) && typeof getFeatureState === "function") {
    return getFeatureState(guildId, featureName);
  }
  if (featureName === "fun" && gd.fun?.enabled === false) return false;
  if (featureName === "music" && gd.music?.enabled === false) return false;
  if (featureName === "automod" && gd.automod?.enabled === false) return false;
  if (featureName === "noPrefix" && gd.noPrefix?.enabled === false) return false;
  if (featureName === "ai" && gd.ai?.enabled === false) return false;
  return true;
}

function checkGuildFeatureToggle(guildId, commandName, context = {}) {
  if (context.isNoPrefixCommand && !isGuildFeatureEnabled(guildId, "noPrefix")) {
    return { allowed: false, feature: "noPrefix", reason: "No-prefix commands are disabled in this server." };
  }
  const feature = getCommandFeatureName(commandName);
  if (context.allowDisabledFeatureSetup && canBypassFeatureGate(commandName, feature, context)) {
    return { allowed: true, feature, reason: null };
  }
  if (canBypassFeatureGate(commandName, feature, context)) {
    return { allowed: true, feature, reason: null };
  }
  const allowed = isGuildFeatureEnabled(guildId, feature);
  return {
    allowed,
    feature,
    reason: allowed ? null : `The **${feature}** feature is disabled in this server.`,
  };
}

function validateCommandPermissions(context = {}) {
  const commandName = context.commandName || context.command;
  const required = context.requiredPermissions || requiredPermissionsForCommand(commandName);
  const member = context.member || null;
  const guild = context.guild || member?.guild || null;
  const userId = context.userId || context.user?.id || member?.id || null;
  if (globalThis.isOwnerSecurityCommand?.(commandName) || ["extraowner", "eo"].includes(commandName)) {
    const allowed = ["extraowner", "eo"].includes(commandName)
      ? !!guild && globalThis.isConfiguredBotOwner?.(userId) === true
      : globalThis.canManageAntiNuke?.(guild, userId) === true;
    return { allowed, required: [], missing: [], reason: allowed ? null : "The configured bot owner or an authorized ExtraOwner is required. Only the configured bot owner can manage ExtraOwners." };
  }
  const missing = missingPermissions(member, required, guild, userId);
  return {
    allowed: missing.length === 0,
    required,
    missing,
    reason: missing.length
      ? `You need ${missing.map(p => `**${p}**`).join(", ")} permission${missing.length === 1 ? "" : "s"} to use this.`
      : null,
  };
}

function isConfigInteraction(customId = "") {
  const id = String(customId || "");
  return CONFIG_INTERACTION_PREFIXES.some(prefix => id.startsWith(prefix));
}

function validateConfigInteractionPermissions(interaction) {
  if (globalThis.isOwnerSecurityInteraction?.(interaction)) return {
    allowed: globalThis.canManageSecurityFeature?.(interaction.guild, interaction.user?.id, interaction.commandName === "wall" || /^(wscfg_|wsmod_)/.test(interaction.customId || "") ? "wall" : "security") === true,
    reason: "Only the configured bot owner or an authorized ExtraOwner can manage security settings.",
  };
  if (!interaction?.customId || !isConfigInteraction(interaction.customId)) return { allowed: true };
  return validateCommandPermissions({
    commandName: "config",
    requiredPermissions: ["ManageGuild"],
    member: interaction.member,
    guild: interaction.guild,
    userId: interaction.user?.id,
  });
}

Object.assign(globalThis, {
  soezyCommandRouter: {
    canRunOwnerOnlyCommand,
    routeCommandName,
    resolveCommandInvocation,
    requiredPermissionsForCommand,
    validateCommandPermissions,
    validateConfigInteractionPermissions,
    checkUserPerms,
    checkBotPerms,
    hasPermission,
    canManageTarget,
    checkGuildFeatureToggle,
    isGuildFeatureEnabled,
    getCommandFeatureName,
  },
  canRunOwnerOnlyCommand,
  routeCommandName,
  resolveCommandInvocation,
  requiredPermissionsForCommand,
  validateCommandPermissions,
  validateConfigInteractionPermissions,
  checkUserPerms,
  checkBotPerms,
  hasPermission,
  canManageTarget,
  checkGuildFeatureToggle,
  isGuildFeatureEnabled,
  getCommandFeatureName,
});


const commandManagerApi = {
  beginCommandExecution,
  endCommandExecution,
  cleanupCommandExecutions,
  parseCommandArgs,
  registerCommandMeta,
  rebuildCommandRegistryFromHelp,
  resolveCommandName,
  resolveCommandInvocation,
  getCommandMeta,
  normalizeCommandName,
  getCommandCategoryCached,
  getCommandPermissionsCached,
  getCommandCooldownCached,
  commandCategoryCache,
  aliasToCommand,
  invocationAliasToCommand,
  commandMeta,
  canRunOwnerOnlyCommand,
  routeCommandName,
  requiredPermissionsForCommand,
  validateCommandPermissions,
  validateConfigInteractionPermissions,
  checkUserPerms,
  checkBotPerms,
  hasPermission,
  canManageTarget,
  checkGuildFeatureToggle,
  isGuildFeatureEnabled,
  getCommandFeatureName,
};

Object.assign(globalThis, {
  soezyCommandManager: commandManagerApi,
  soezyCommandRegistry: commandManagerApi,
  soezyCommandRouter: commandManagerApi,
  beginCommandExecution,
  endCommandExecution,
  parseCommandArgs,
  resolveRegisteredCommandName: resolveCommandName,
  resolveCommandInvocation,
  getRegisteredCommandMeta: getCommandMeta,
  getCommandCategoryCached,
  getCommandPermissionsCached,
  getCommandCooldownCached,
  canRunOwnerOnlyCommand,
  routeCommandName,
  requiredPermissionsForCommand,
  validateCommandPermissions,
  validateConfigInteractionPermissions,
  checkUserPerms,
  checkBotPerms,
  hasPermission,
  canManageTarget,
  checkGuildFeatureToggle,
  isGuildFeatureEnabled,
  getCommandFeatureName,
});

module.exports = commandManagerApi;
})();
