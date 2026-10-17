/**
 * Retsu Bot - Server Member Direct Messaging Bot
 * 
 * Features:
 * - Mass / Server-wide direct messaging (!retsudm / !dmall)
 * - Safe pacing & rate limit throttling to prevent Discord Gateway disconnects
 * - Live progress tracking (Sent, Failed, DMs Closed, Remaining)
 * - Abort / Cancel ongoing broadcast (!retsustop)
 * - Administrative authorization checks (Bot Owner or Administrator)
 * 
 * IMPORTANT NOTICE:
 * Mass direct messaging members of a server without explicit prior consent
 * violates Discord's Developer Terms of Service & Community Guidelines (Spam Policy).
 * Doing so may result in the bot token being flagged/quarantined or the bot being banned.
 */

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  PermissionsBitField
} = require("discord.js");
const fs = require("fs");
const path = require("path");

// Load configuration
let config = {};
const configPath = path.join(__dirname, "config.json");
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (err) {
    console.warn("[RETSU] Could not parse config.json, using defaults.");
  }
}

// Fallback to environment variables
const TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || config.token;
const PREFIX = process.env.PREFIX || config.prefix || "!";
const OWNER_IDS = config.ownerIds || [];

if (!TOKEN) {
  console.error("[RETSU] ERROR: No Discord bot token found in config.json or environment variables!");
  console.error("[RETSU] Please configure 'token' in config.json or set DISCORD_TOKEN.");
  process.exit(1);
}

// Initialize Client with required Privileged Intents
// NOTE: Make sure 'SERVER MEMBERS INTENT' and 'MESSAGE CONTENT INTENT' are enabled
// in the Discord Developer Portal under Bot -> Privileged Gateway Intents.
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

// State for active broadcast tasks: guildId -> { cancelled: boolean, running: boolean }
const activeBroadcasts = new Map();

// Delay helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

client.once("ready", () => {
  console.log("==================================================");
  console.log(`[RETSU BOT] Logged in as: ${client.user.tag} (${client.user.id})`);
  console.log(`[RETSU BOT] Serving ${client.guilds.cache.size} guilds`);
  console.log(`[RETSU BOT] Prefix: "${PREFIX}"`);
  console.log("==================================================");
  console.log("[RETSU BOT] WARNING: Discord ToS prohibits unsolicited bulk messaging (Spam).");
  console.log("[RETSU BOT] Use responsibly and only in servers where you have explicit permission.");
  console.log("==================================================");
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // Helper to verify authorization
  const isOwner = OWNER_IDS.includes(message.author.id);
  const isAdmin = message.member && message.member.permissions.has(PermissionsBitField.Flags.Administrator);

  // ── HELP / INFO COMMAND ────────────────────────────────────────────────────────
  if (command === "retsu" || command === "retsuhelp" || command === "retsuinfo") {
    const embed = new EmbedBuilder()
      .setTitle("🗡️ Retsu Bot - Server DM System")
      .setColor(0xe74c3c)
      .setDescription(
        `**Retsu Bot** allows server owners and administrators to broadcast direct messages to server members.\n\n` +
        `**Commands:**\n` +
        `• \`${PREFIX}retsudm <message>\` or \`${PREFIX}dmall <message>\` - Send DM to all server members\n` +
        `• \`${PREFIX}retsustop\` or \`${PREFIX}cancel\` - Stop any active broadcast in this server\n` +
        `• \`${PREFIX}serverstats\` - View server member count & stats\n\n` +
        `⚠️ **Notice & Best Practices:**\n` +
        `• Direct messages are throttled (1.2s delay per user) to protect the bot from immediate rate limit blocks.\n` +
        `• Members with closed DMs or blocked bots will be safely recorded as failed without halting the queue.\n` +
        `• Bot accounts are automatically skipped.\n` +
        `• Ensure **Server Members Intent** is enabled in the Discord Developer Portal.`
      )
      .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // ── SERVER STATS COMMAND ──────────────────────────────────────────────────────
  if (command === "serverstats" || command === "membercount") {
    if (!message.guild) {
      return message.reply("❌ This command must be used inside a server.");
    }

    try {
      await message.guild.members.fetch();
    } catch (e) {
      // Fallback to cache if fetch fails
    }

    const total = message.guild.memberCount;
    const humans = message.guild.members.cache.filter((m) => !m.user.bot).size;
    const bots = message.guild.members.cache.filter((m) => m.user.bot).size;

    const embed = new EmbedBuilder()
      .setTitle(`📊 Server Member Stats: ${message.guild.name}`)
      .setColor(0x808080)
      .addFields(
        { name: "Total Members", value: `${total}`, inline: true },
        { name: "Human Users (DM targets)", value: `${humans}`, inline: true },
        { name: "Bots (Ignored)", value: `${bots}`, inline: true }
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // ── STOP / CANCEL BROADCAST ───────────────────────────────────────────────────
  if (command === "retsustop" || command === "stopdm" || command === "canceldm") {
    if (!isOwner && !isAdmin) {
      return message.reply("❌ Only Server Administrators or Bot Owners can stop broadcasts.");
    }

    const task = activeBroadcasts.get(message.guild.id);
    if (!task || !task.running) {
      return message.reply("ℹ️ No active DM broadcast is currently running in this server.");
    }

    task.cancelled = true;
    return message.reply("🛑 Stopping DM broadcast... Please wait for the current loop to terminate.");
  }

  // ── MASS DM / SEND ALL USER DM ───────────────────────────────────────────────
  if (command === "retsudm" || command === "dmall" || command === "massdm") {
    if (!message.guild) {
      return message.reply("❌ This command must be run within a Discord server.");
    }

    // Security check: Must be owner or have Administrator permissions
    if (!isOwner && !isAdmin) {
      return message.reply("❌ Permission Denied: You must be a Server Administrator or Bot Owner to use this command.");
    }

    const broadcastMessage = args.join(" ");
    if (!broadcastMessage || broadcastMessage.trim().length === 0) {
      return message.reply(`❌ Usage: \`${PREFIX}${command} <message to send to all users>\``);
    }

    // Check if another broadcast is already running in this guild
    if (activeBroadcasts.get(message.guild.id)?.running) {
      return message.reply(`⚠️ A DM broadcast is already in progress. Use \`${PREFIX}retsustop\` to cancel it first.`);
    }

    // Set broadcast state
    const taskState = { running: true, cancelled: false };
    activeBroadcasts.set(message.guild.id, taskState);

    // Initial status reply
    const initEmbed = new EmbedBuilder()
      .setTitle("🗡️ Retsu Bot: Fetching Server Members...")
      .setDescription("Fetching member list from the server. Please ensure privileged Gateway Intents are enabled.")
      .setColor(0xf1c40f)
      .setTimestamp();

    const statusMsg = await message.reply({ embeds: [initEmbed] });

    let members;
    try {
      const fetched = await message.guild.members.fetch();
      members = Array.from(fetched.values()).filter((m) => !m.user.bot);
    } catch (fetchErr) {
      console.error("[RETSU] Failed to fetch guild members:", fetchErr);
      activeBroadcasts.delete(message.guild.id);
      return statusMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle("❌ Error Fetching Members")
            .setDescription(
              `Could not fetch server members: \`${fetchErr.message}\`\n\n` +
              `Ensure the **SERVER MEMBERS INTENT** toggle is turned **ON** in the Discord Developer Portal for this bot.`
            )
            .setColor(0xe74c3c)
        ]
      });
    }

    const totalTargets = members.length;
    let sentCount = 0;
    let failCount = 0;
    const startTime = Date.now();

    const updateStatus = async (isComplete = false, cancelled = false) => {
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      const remaining = totalTargets - (sentCount + failCount);
      const progressPercent = totalTargets > 0 ? Math.round(((sentCount + failCount) / totalTargets) * 100) : 100;

      const embed = new EmbedBuilder()
        .setTitle(
          cancelled
            ? "🛑 Retsu DM Broadcast: Stopped"
            : isComplete
            ? "✅ Retsu DM Broadcast: Finished"
            : "⏳ Retsu DM Broadcast: In Progress..."
        )
        .setColor(cancelled ? 0xe67e22 : isComplete ? 0x2ecc71 : 0x3498db)
        .addFields(
          { name: "Total Target Users", value: `${totalTargets}`, inline: true },
          { name: "Delivered (Sent)", value: `✅ ${sentCount}`, inline: true },
          { name: "Failed / Closed DMs", value: `❌ ${failCount}`, inline: true },
          { name: "Progress", value: `${progressPercent}% (${sentCount + failCount}/${totalTargets})`, inline: true },
          { name: "Remaining", value: `${remaining}`, inline: true },
          { name: "Time Elapsed", value: `${elapsedSec}s`, inline: true }
        )
        .setFooter({
          text: cancelled || isComplete ? "Broadcast ended" : `Use ${PREFIX}retsustop to cancel at any time.`
        })
        .setTimestamp();

      try {
        await statusMsg.edit({ embeds: [embed] });
      } catch (err) {
        // Ignore edit rate limits
      }
    };

    console.log(`[RETSU] Starting broadcast to ${totalTargets} members in "${message.guild.name}"...`);

    // Loop through each member and dispatch DM
    for (let i = 0; i < totalTargets; i++) {
      if (taskState.cancelled) {
        console.log("[RETSU] Broadcast cancelled by user request.");
        break;
      }

      const targetMember = members[i];

      try {
        // Send DM directly to the member
        await targetMember.send({
          content: broadcastMessage
        });
        sentCount++;
      } catch (dmErr) {
        failCount++;
        // 50007 = Cannot send messages to this user (DMs closed or bot blocked)
        if (dmErr.code !== 50007) {
          console.warn(`[RETSU] Could not DM user ${targetMember.user.tag} (${targetMember.id}): ${dmErr.message}`);
        }
      }

      // Update status message periodically (every 5 users, or on last user)
      if ((i + 1) % 5 === 0 || i === totalTargets - 1) {
        await updateStatus(false, false);
      }

      // Throttle delay: 1200ms between messages to comply with Discord rate limits
      await sleep(1200);
    }

    taskState.running = false;
    activeBroadcasts.delete(message.guild.id);

    // Final status update
    await updateStatus(true, taskState.cancelled);

    console.log(`[RETSU] Broadcast finished. Sent: ${sentCount}, Failed: ${failCount}, Total: ${totalTargets}`);
  }
});

// Login
client.login(TOKEN).catch((err) => {
  console.error("[RETSU] Login error:", err);
});
