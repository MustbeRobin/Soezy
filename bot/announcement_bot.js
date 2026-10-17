/**
 * Announcement & Notification Bot
 * 
 * Features:
 * - Rich Embed Announcements (!announce, !embedsay)
 * - Role / Mention Broadcasts (!notify)
 * - Server Update / Changelog formatting (!serverupdate)
 * - Scheduled Announcements (!schedule, !schedules, !cancelschedule)
 * - Clean UI with embeds, custom colors, thumbnails, and timestamps
 * - Robust permission controls (Admin / Manage Guild only)
 */

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType
} = require("discord.js");
const fs = require("fs");
const path = require("path");

// Load configuration
let config = {};
const possibleConfigPaths = [
  path.join(__dirname, "config.json"),
  "C:\\soezy\\config.json"
];

for (const p of possibleConfigPaths) {
  if (fs.existsSync(p)) {
    try {
      config = JSON.parse(fs.readFileSync(p, "utf8"));
      break;
    } catch (err) {
      // Ignore
    }
  }
}

const TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || config.token;
const PREFIX = process.env.PREFIX || config.prefix || "!";
const OWNER_IDS = config.ownerIds || [];

if (!TOKEN) {
  console.error("[ANNOUNCEMENT BOT] Error: No bot token found in config.json or environment variables.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

// Scheduled announcements store: id -> { timeoutId, guildId, channelId, message, date }
const scheduledTasks = new Map();
let taskIdCounter = 1;

client.once("ready", () => {
  console.log("==================================================");
  console.log(`[ANNOUNCEMENT BOT] Ready as: ${client.user.tag} (${client.user.id})`);
  console.log(`[ANNOUNCEMENT BOT] Prefix: "${PREFIX}"`);
  console.log(`[ANNOUNCEMENT BOT] Active in ${client.guilds.cache.size} servers`);
  console.log("==================================================");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  const isOwner = OWNER_IDS.includes(message.author.id);
  const isAdmin = message.member && (
    message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
    message.member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
    message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)
  );

  // ── HELP MENU ─────────────────────────────────────────────────────────────
  if (command === "announcehelp" || command === "notifhelp" || command === "abhelp") {
    const helpEmbed = new EmbedBuilder()
      .setTitle("📢 Announcement & Notification Bot")
      .setColor(0x808080)
      .setDescription(
        `**Available Commands:**\n\n` +
        `**📢 Announcements:**\n` +
        `• \`${PREFIX}announce <#channel> <message>\` - Post a styled announcement to a channel\n` +
        `• \`${PREFIX}embedsay <#channel> <title> | <description> | [hex_color]\` - Post a custom styled embed\n` +
        `• \`${PREFIX}notify <@role> <#channel> <message>\` - Send an announcement pinging a specific role\n` +
        `• \`${PREFIX}serverupdate <#channel> <title> | <details>\` - Post official server patch notes / update\n\n` +
        `**⏰ Scheduled Announcements:**\n` +
        `• \`${PREFIX}schedule <minutes> <#channel> <message>\` - Schedule an announcement in N minutes\n` +
        `• \`${PREFIX}schedules\` - View all active pending schedules\n` +
        `• \`${PREFIX}cancelschedule <id>\` - Cancel a pending schedule\n\n` +
        `*Requires Manage Guild or Administrator permissions.*`
      )
      .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();

    return message.reply({ embeds: [helpEmbed] });
  }

  // Permission check for all moderation/announcement commands below
  if (!isOwner && !isAdmin) return;

  // ── 1. BASIC ANNOUNCE COMMAND ─────────────────────────────────────────────
  if (command === "announce" || command === "announcement") {
    const channelMention = message.mentions.channels.first();
    if (!channelMention) {
      return message.reply(`❌ Usage: \`${PREFIX}announce <#channel> <your announcement message>\``);
    }

    // Remove the channel mention from args
    const announcementText = args.slice(1).join(" ");
    if (!announcementText) {
      return message.reply("❌ Please provide the message content for the announcement.");
    }

    const embed = new EmbedBuilder()
      .setTitle("📢 Server Announcement")
      .setDescription(announcementText)
      .setColor(0x808080)
      .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL() || undefined })
      .setFooter({ text: `Announced by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();

    try {
      await channelMention.send({ embeds: [embed] });
      return message.reply(`✅ Announcement successfully sent to ${channelMention}!`);
    } catch (err) {
      return message.reply(`❌ Failed to send announcement to ${channelMention}: \`${err.message}\``);
    }
  }

  // ── 2. CUSTOM EMBEDSAY COMMAND ────────────────────────────────────────────
  // Format: !embedsay <#channel> <title> | <description> | [color]
  if (command === "embedsay" || command === "customannounce") {
    const targetChannel = message.mentions.channels.first();
    if (!targetChannel) {
      return message.reply(`❌ Usage: \`${PREFIX}embedsay <#channel> <Title> | <Description> | [Hex Color]\``);
    }

    const rawPayload = args.slice(1).join(" ");
    const parts = rawPayload.split("|").map(p => p.trim());

    if (parts.length < 2 || !parts[0] || !parts[1]) {
      return message.reply(`❌ Usage: \`${PREFIX}embedsay ${targetChannel} Announcement Title | Announcement Description | #2ecc71\``);
    }

    const title = parts[0];
    const description = parts[1];
    let color = 0x808080;

    if (parts[2]) {
      const parsedColor = parseInt(parts[2].replace("#", ""), 16);
      if (!isNaN(parsedColor)) color = parsedColor;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL() || undefined })
      .setFooter({ text: `Posted by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();

    try {
      await targetChannel.send({ embeds: [embed] });
      return message.reply(`✅ Custom embed posted to ${targetChannel}!`);
    } catch (err) {
      return message.reply(`❌ Failed to post embed: \`${err.message}\``);
    }
  }

  // ── 3. ROLE NOTIFICATION COMMAND ──────────────────────────────────────────
  // Format: !notify <@role> <#channel> <message>
  if (command === "notify" || command === "rolenotify") {
    const roleMention = message.mentions.roles.first();
    const channelMention = message.mentions.channels.first();

    if (!roleMention || !channelMention) {
      return message.reply(`❌ Usage: \`${PREFIX}notify <@role> <#channel> <message content>\``);
    }

    // Filter out mentions from text
    const text = args
      .filter(arg => !arg.startsWith("<#") && !arg.startsWith("<@&"))
      .join(" ");

    if (!text) {
      return message.reply("❌ Please provide a notification message.");
    }

    const embed = new EmbedBuilder()
      .setTitle("🔔 Notification Alert")
      .setDescription(text)
      .setColor(0xe67e22)
      .addFields({ name: "Target Audience", value: `${roleMention}`, inline: true })
      .setFooter({ text: `From ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();

    try {
      await channelMention.send({
        content: `${roleMention}`,
        embeds: [embed]
      });
      return message.reply(`✅ Notification sent to ${channelMention} with ${roleMention} ping.`);
    } catch (err) {
      return message.reply(`❌ Error sending notification: \`${err.message}\``);
    }
  }

  // ── 4. SERVER UPDATE / CHANGELOG ──────────────────────────────────────────
  // Format: !serverupdate <#channel> <Title> | <What's New / Changes>
  if (command === "serverupdate" || command === "changelog") {
    const targetChannel = message.mentions.channels.first();
    if (!targetChannel) {
      return message.reply(`❌ Usage: \`${PREFIX}serverupdate <#channel> Update Title | Detailed Changes\``);
    }

    const raw = args.slice(1).join(" ");
    const [title, ...descParts] = raw.split("|");
    const description = descParts.join("|").trim();

    if (!title || !description) {
      return message.reply(`❌ Format: \`${PREFIX}serverupdate ${targetChannel} v2.0 Release | - New rules added\n- Channels reorganized\``);
    }

    const embed = new EmbedBuilder()
      .setTitle(`🚀 ${title.trim()}`)
      .setDescription(description)
      .setColor(0x2ecc71)
      .setAuthor({ name: `${message.guild.name} • Updates`, iconURL: message.guild.iconURL() || undefined })
      .setFooter({ text: `Author: ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();

    try {
      await targetChannel.send({ embeds: [embed] });
      return message.reply(`✅ Changelog / Update published to ${targetChannel}!`);
    } catch (err) {
      return message.reply(`❌ Failed to publish update: \`${err.message}\``);
    }
  }

  // ── 5. SCHEDULED ANNOUNCEMENT ─────────────────────────────────────────────
  // Format: !schedule <minutes> <#channel> <message>
  if (command === "schedule" || command === "scheduleannounce") {
    const minutes = parseInt(args[0], 10);
    const channelMention = message.mentions.channels.first();

    if (isNaN(minutes) || minutes <= 0 || !channelMention) {
      return message.reply(`❌ Usage: \`${PREFIX}schedule <minutes> <#channel> <message>\` (e.g. \`${PREFIX}schedule 10 #announcements Event starts soon!\`)`);
    }

    const text = args.slice(2).join(" ");
    if (!text) {
      return message.reply("❌ Please provide the message content to schedule.");
    }

    const currentId = taskIdCounter++;
    const executeAt = new Date(Date.now() + minutes * 60 * 1000);

    const timeout = setTimeout(async () => {
      scheduledTasks.delete(currentId);
      const embed = new EmbedBuilder()
        .setTitle("⏰ Scheduled Announcement")
        .setDescription(text)
        .setColor(0x9b59b6)
        .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL() || undefined })
        .setFooter({ text: `Scheduled by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();

      try {
        await channelMention.send({ embeds: [embed] });
      } catch (err) {
        console.error(`[SCHEDULE] Failed to send scheduled announcement ${currentId}:`, err);
      }
    }, minutes * 60 * 1000);

    scheduledTasks.set(currentId, {
      timeoutId: timeout,
      guildId: message.guild.id,
      channelId: channelMention.id,
      channelName: channelMention.name,
      message: text,
      author: message.author.tag,
      executeAt
    });

    return message.reply(
      `⏱️ Announcement **#${currentId}** scheduled for ${channelMention} in **${minutes} minutes** (${executeAt.toLocaleTimeString()}).`
    );
  }

  // ── 6. VIEW SCHEDULES ─────────────────────────────────────────────────────
  if (command === "schedules" || command === "listtasks") {
    const guildTasks = Array.from(scheduledTasks.entries()).filter(
      ([, task]) => task.guildId === message.guild.id
    );

    if (guildTasks.length === 0) {
      return message.reply("ℹ️ No pending scheduled announcements in this server.");
    }

    const embed = new EmbedBuilder()
      .setTitle("⏰ Pending Scheduled Announcements")
      .setColor(0x9b59b6)
      .setDescription(
        guildTasks
          .map(([id, task]) => {
            const timeLeftMin = Math.max(1, Math.round((task.executeAt.getTime() - Date.now()) / 60000));
            return `**#${id}** • In <#${task.channelId}> in **~${timeLeftMin}m**\n↳ \`${task.message.slice(0, 60)}${task.message.length > 60 ? "..." : ""}\``;
          })
          .join("\n\n")
      )
      .setFooter({ text: `Use ${PREFIX}cancelschedule <id> to abort a schedule.` });

    return message.reply({ embeds: [embed] });
  }

  // ── 7. CANCEL SCHEDULE ────────────────────────────────────────────────────
  if (command === "cancelschedule" || command === "abortschedule") {
    const id = parseInt(args[0], 10);
    if (isNaN(id) || !scheduledTasks.has(id)) {
      return message.reply(`❌ Invalid schedule ID. Use \`${PREFIX}schedules\` to view active IDs.`);
    }

    const task = scheduledTasks.get(id);
    if (task.guildId !== message.guild.id && !isOwner) {
      return message.reply("❌ That scheduled task belongs to another server.");
    }

    clearTimeout(task.timeoutId);
    scheduledTasks.delete(id);

    return message.reply(`✅ Cancelled scheduled announcement **#${id}**.`);
  }
});

client.login(TOKEN).catch((err) => {
  console.error("[ANNOUNCEMENT BOT] Login failure:", err.message);
});
