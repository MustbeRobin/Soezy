let loadCommandCollection;
let soezyMusicCommandModule;
try {
  ({ loadCommandCollection } = require("../commands/registry"));
  soezyMusicCommandModule = require("../commands/music/music");
} catch {
  // Runtime files are evaluated with a project-root require() by the VM loader.
  ({ loadCommandCollection } = require("./commands/registry"));
  soezyMusicCommandModule = require("./commands/music/music");
}
const { PermissionFlagsBits } = require("discord.js");
const commandCollection = loadCommandCollection();
const MAX_GLOBAL_APPLICATION_COMMANDS = 100;
const publishOwnerSlashCommands = process.env.SOEZY_REGISTER_OWNER_SLASH === "1";
const skippedSlashCommands = [];
const seenSlashNames = new Set();
const ALLOWED_PUBLIC_SLASH_CATEGORIES = new Set(["moderation", "config", "utility", "economy"]);
const PREFIX_ONLY_SLASH_CATEGORIES = new Set(["music"]);
const ALWAYS_PUBLISH_OWNER_SLASH = new Set(["node", "reconnectnodeall"]);

function cloneSlashPayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}

function normalizeSlashOptionOrder(payload) {
  if (!payload || !Array.isArray(payload.options)) return payload;
  payload.options = payload.options
    .map(option => normalizeSlashOptionOrder(option))
    .sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)));
  return payload;
}

function applyDefaultMemberPermissions(command, payload) {
  if (payload.default_member_permissions != null) return payload;
  const name = String(payload.name || command?.data?.name || "").toLowerCase();
  const category = command?.category;
  const byName = {
    ban: PermissionFlagsBits.BanMembers,
    unban: PermissionFlagsBits.BanMembers,
    kick: PermissionFlagsBits.KickMembers,
    mute: PermissionFlagsBits.ModerateMembers,
    unmute: PermissionFlagsBits.ModerateMembers,
    purge: PermissionFlagsBits.ManageMessages,
    clear: PermissionFlagsBits.ManageMessages,
    lock: PermissionFlagsBits.ManageChannels,
    unlock: PermissionFlagsBits.ManageChannels,
    hide: PermissionFlagsBits.ManageChannels,
    unhide: PermissionFlagsBits.ManageChannels,
    slowmode: PermissionFlagsBits.ManageChannels,
    nick: PermissionFlagsBits.ManageNicknames,
  };
  if (name === "birthday") return payload;
  const required = byName[name] || (category === "config" ? PermissionFlagsBits.ManageGuild : null);
  if (required) payload.default_member_permissions = required.toString();
  return payload;
}

function shouldPublishSlashCommand(command) {
  if (!command?.data?.name) return false;
  const name = String(command.data.name || "").toLowerCase();
  if (command.category === "owner" && !publishOwnerSlashCommands && !ALWAYS_PUBLISH_OWNER_SLASH.has(name)) return false;
  if (PREFIX_ONLY_SLASH_CATEGORIES.has(command.category)) return false;
  if (!ALLOWED_PUBLIC_SLASH_CATEGORIES.has(command.category) && command.category !== "owner") return false;
  if (command.slash === false || command.publishSlash === false) return false;
  return true;
}

const commands = [];
for (const command of commandCollection.values()) {
  if (!shouldPublishSlashCommand(command)) {
    skippedSlashCommands.push(command?.data?.name || "unknown");
    continue;
  }
  const payload = applyDefaultMemberPermissions(command, normalizeSlashOptionOrder(command.data.toJSON()));
  if (seenSlashNames.has(payload.name)) {
    skippedSlashCommands.push(payload.name);
    continue;
  }
  seenSlashNames.add(payload.name);
  commands.push(payload);
}
const musicSlashCommands = process.env.SOEZY_REGISTER_MUSIC_SLASH === "1"
  ? (soezyMusicCommandModule.MUSIC_SLASH_COMMANDS || [])
  : [];
const prioritizedMusicSlashCommands = [
  ...musicSlashCommands.filter(command => command.name === "music"),
  ...musicSlashCommands.filter(command => command.name !== "music"),
];
const skippedMusicSlashCommands = [];
for (const command of prioritizedMusicSlashCommands) {
  if (seenSlashNames.has(command.name)) continue;
  if (commands.length >= MAX_GLOBAL_APPLICATION_COMMANDS) {
    skippedMusicSlashCommands.push(command.name);
    continue;
  }
  seenSlashNames.add(command.name);
  commands.push(normalizeSlashOptionOrder(cloneSlashPayload(command)));
}
if (skippedSlashCommands.length > 0) {
  console.log(`[COMMANDS] ${skippedSlashCommands.length} command(s) kept prefix-only for slash limit hygiene.`);
}
if (skippedMusicSlashCommands.length > 0) {
  console.log(`[COMMANDS] ${skippedMusicSlashCommands.length} music slash commands skipped due to Discord's ${MAX_GLOBAL_APPLICATION_COMMANDS}-command global limit. Prefix music commands are still loaded.`);
}

globalThis.commandCollection = commandCollection;
globalThis.commands = commands;
globalThis.__soezyCommandCount = commandCollection.size;
globalThis.__soezySlashCommandCount = commands.length;
console.log(`[COMMANDS] Loaded ${commandCollection.size} registry commands; ${commands.length} slash payloads prepared.`);
