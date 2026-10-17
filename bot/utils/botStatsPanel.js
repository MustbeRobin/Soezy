"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { ContainerBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SeparatorSpacingSize } = require("discord.js");

const TABS = ["general", "code", "system", "team"];
const SCAN_IGNORED_DIRS = new Set([".git", "node_modules", ".cache", "coverage", "dist", "build", ".next", ".powernative"]);
const CODE_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx", ".py"]);
const SCAN_CACHE = new Map();
const SCAN_CACHE_MS = 5 * 60 * 1000;
const STATS_SESSIONS = new Map();

function scanCodeStats(root = process.cwd()) {
  const normalizedRoot = path.resolve(root);
  const cached = SCAN_CACHE.get(normalizedRoot);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let files = 0;
  let lines = 0;
  const pending = [normalizedRoot];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SCAN_IGNORED_DIRS.has(entry.name)) pending.push(path.join(current, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      files++;
      if (!CODE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      const content = fs.readFileSync(path.join(current, entry.name), "utf8");
      if (content.length) lines += content.split(/\r\n|\r|\n/).length - (content.endsWith("\n") || content.endsWith("\r") ? 1 : 0);
    }
  }

  const value = { files, lines };
  SCAN_CACHE.set(normalizedRoot, { value, expiresAt: Date.now() + SCAN_CACHE_MS });
  return value;
}

function listIds(...values) {
  return [...new Set(values.flatMap(value => Array.isArray(value) ? value : []).map(String).filter(id => /^\d{17,20}$/.test(id)))];
}

function formatPeople(ids) {
  return ids.length ? ids.map(id => `<@${id}>`).join("\n") : "_None_";
}

function quoteLines(text) {
  return text.split("\n").map(line => line ? `> ${line}` : ">").join("\n");
}

function getEmojis(emojis = {}) {
  const defaults = {
    stats_globe: "🌐", stats_users: "👥", stats_channels: "🗂️", stats_servers: "🌐",
    stats_uptime: "⏱️", stats_files: "📁", stats_code: "💻", stats_modules: "🧩",
    stats_nodejs: "🟢", stats_discord_python: "🤖", stats_platform: "🖥️",
    stats_ping: "📶", stats_ram: "🧠", stats_cpu: "⚙️", stats_linux: "🐧",
    stats_owners: "👑", stats_admins: "👥", stats_developers: "🧑‍💻", stats_partners: "🤝",
  };
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, emojis[key] || fallback]));
}

function formatUptime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

function buildBotStatsContainer({ client, config = {}, db = {}, requesterId, guildId = null, tab = "general", emojis, music = null, root = process.cwd() }) {
  const selectedTab = TABS.includes(tab) ? tab : "general";
  const icon = getEmojis(emojis || globalThis.EMOJIS);
  const guilds = client?.guilds?.cache;
  const servers = guilds?.size || 0;
  const users = guilds?.reduce?.((sum, guild) => sum + (Number(guild.memberCount) || 0), 0) || 0;
  const channels = client?.channels?.cache?.size || 0;
  const shardCount = client?.ws?.shards?.size || client?.shard?.count || 1;
  const codeStats = scanCodeStats(root);
  const memory = process.memoryUsage();
  const totalRam = os.totalmem();
  const usedRam = totalRam - os.freemem();
  const cpu = process.cpuUsage();
  const cpuPercent = process.uptime() > 0 && os.cpus().length
    ? Math.min(100, ((cpu.user + cpu.system) / (process.uptime() * 1e6 * os.cpus().length)) * 100)
    : 0;
  const ping = Number(client?.ws?.ping);
  const loadedModules = Object.keys(require.cache).filter(file => path.resolve(file).startsWith(`${path.resolve(root)}${path.sep}`) && !file.includes(`${path.sep}node_modules${path.sep}`)).length;
  const nodeVersion = process.version;
  const discordVersion = require("discord.js").version || "Unknown";
  const avatar = typeof globalThis.getBotAvatar === "function"
    ? globalThis.getBotAvatar(guildId, 256)
    : client?.user?.displayAvatarURL?.({ size: 256, forceStatic: false });

  const ownerIds = listIds(config.ownerIds);
  const adminIds = listIds(config.adminIds, db.adminUsers, db.admins);
  const developerIds = listIds(config.developerIds, db.devUsers);
  const partnerIds = listIds(config.partnerIds, db.partnerUsers, db.partners);
  const mentionOptions = { parse: [], users: [] };

  let heading = "General Stats";
  let body = "";
  if (selectedTab === "general") {
    heading = "General Stats";
    body =
      `${icon.stats_globe} **Servers:** \`${servers.toLocaleString()}\`\n` +
      `${icon.stats_users} **Total Users:** \`${users.toLocaleString()}\`\n` +
      `${icon.stats_channels} **Total Channels:** \`${channels.toLocaleString()}\`\n` +
      `${icon.stats_servers} **Shards:** \`${shardCount}\`\n` +
      `${icon.stats_uptime} **Uptime:** \`${formatUptime(process.uptime())}\``;
    if (music) {
      body +=
        `\n\n${icon.stats_modules} **Active Queues:** \`${music.activeQueues ?? 0}\`\n` +
        `${icon.stats_discord_python} **Lavalink:** ${music.nodeName ? `\`${music.nodeName}\` · Players: \`${music.playingPlayers ?? "?"}\` · Uptime: \`${music.nodeUptime ?? "?"}\`` : "_No node connected_"}`;
    }
  } else if (selectedTab === "code") {
    heading = "Code Stats";
    body =
      `${icon.stats_files} **Total Files:** \`${codeStats.files.toLocaleString()}\`\n` +
      `${icon.stats_code} **Total Lines:** \`${codeStats.lines.toLocaleString()}\`\n` +
      `${icon.stats_modules} **Loaded Modules:** \`${loadedModules.toLocaleString()}\`\n` +
      `${icon.stats_nodejs} **Node.js Version:** \`${nodeVersion}\`\n` +
      `${icon.stats_discord_python} **discord.js:** \`v${discordVersion}\`\n` +
      `${icon.stats_platform} **Platform:** \`${`${os.type()} ${os.release()}`.slice(0, 80)}\``;
  } else if (selectedTab === "system") {
    heading = "System Stats";
    body =
      `${icon.stats_ping} **Gateway Ping:** \`${Number.isFinite(ping) && ping >= 0 ? `${ping.toFixed(1)}ms` : "Unavailable"}\`\n` +
      `${icon.stats_ram} **System RAM:** \`${(usedRam / 1024 ** 3).toFixed(2)} / ${(totalRam / 1024 ** 3).toFixed(2)} GB\`\n` +
      `${icon.stats_cpu} **Process CPU:** \`${cpuPercent.toFixed(1)}%\`\n` +
      `${icon.stats_ram} **Process Memory:** \`${(memory.rss / 1024 ** 2).toFixed(0)} MB RSS\`\n` +
      `${icon.stats_nodejs} **Node.js:** \`${nodeVersion}\`\n` +
      `${icon.stats_linux} **OS:** \`${os.type()} ${os.release()}\`\n` +
      `${icon.stats_uptime} **Uptime:** \`${formatUptime(process.uptime())}\``;
  } else {
    heading = "Team Info";
    body =
      `${icon.stats_owners} **Owners**\n${formatPeople(ownerIds)}\n\n` +
      `${icon.stats_admins} **Admins**\n${formatPeople(adminIds)}\n\n` +
      `${icon.stats_developers} **Developers**\n${formatPeople(developerIds)}\n\n` +
      `${icon.stats_partners} **Partners**\n${formatPeople(partnerIds)}`;
  }
  body = quoteLines(body);

  const now = Date.now();
  for (const [key, session] of STATS_SESSIONS) {
    if (session.expiresAt <= now) STATS_SESSIONS.delete(key);
  }
  while (STATS_SESSIONS.size >= 1000) STATS_SESSIONS.delete(STATS_SESSIONS.keys().next().value);
  const nonce = `${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  STATS_SESSIONS.set(nonce, { requesterId: String(requesterId), music, guildId, emojis: icon, expiresAt: now + 30 * 60 * 1000 });
  const row = new ActionRowBuilder().addComponents(TABS.map(name =>
    new ButtonBuilder()
      .setCustomId(`soezy_stats_tab_${name}_${requesterId}_${nonce}`)
      .setLabel(name[0].toUpperCase() + name.slice(1))
      .setStyle(name === selectedTab ? ButtonStyle.Primary : ButtonStyle.Secondary)
  ));
  const container = new ContainerBuilder()
    .addTextDisplayComponents(text => text.setContent(`### ${heading}`))
    .addSeparatorComponents(separator => separator.setDivider(true));
  if (avatar) container.addSectionComponents(section => section
    .addTextDisplayComponents(text => text.setContent(body))
    .setThumbnailAccessory(thumb => thumb.setURL(avatar)));
  else container.addTextDisplayComponents(text => text.setContent(body));
  container
    .addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(row);
  return { container, allowedMentions: mentionOptions, tab: selectedTab };
}

async function handleStatsTabInteraction(interaction, { config = {}, db = {}, root = process.cwd() } = {}) {
  if (!interaction?.isButton?.()) return false;
  const match = /^soezy_stats_tab_(general|code|system|team)_(\d{17,20})_([a-z0-9]+)$/.exec(String(interaction.customId || ""));
  if (!match) return false;
  if (String(interaction.user?.id || "") !== match[2]) {
    await interaction.reply({ content: "Only the person who opened these stats can change tabs.", ephemeral: true });
    return true;
  }
  const session = STATS_SESSIONS.get(match[3]);
  if (!session || session.expiresAt <= Date.now() || session.requesterId !== match[2]) {
    await interaction.reply({ content: "This stats panel has expired. Run the command again to open a fresh panel.", ephemeral: true });
    return true;
  }
  const result = buildBotStatsContainer({
    client: interaction.client,
    config,
    db,
    requesterId: match[2],
    guildId: session.guildId,
    tab: match[1],
    music: session.music,
    emojis: session.emojis,
    root,
  });
  await interaction.update({ components: [result.container], flags: require("discord.js").MessageFlags.IsComponentsV2, allowedMentions: result.allowedMentions });
  return true;
}

module.exports = { TABS, scanCodeStats, buildBotStatsContainer, handleStatsTabInteraction };
