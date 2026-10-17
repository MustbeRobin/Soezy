/* ================= AUTO-JAIL MANAGER ================= */

/**
 * Auto-Jail System: Monitor messages in configured channels and automatically
 * jail users who trigger configured violation conditions.
 * 
 * Features:
 * - Configure channels to auto-jail users
 * - Delete user messages and attachments
 * - Delete the triggering message, including attachments
 * - Track violations and logging
 */

if (!globalThis.__soezyAutoJailRuntime) {
  globalThis.__soezyAutoJailRuntime = {
    processingMessages: new Map(),
    cleanupQueues: new Map(),
  };
}

const RATE_LIMIT_MS = 1000; // Min time between jails per user

function ensureAutoJailState(guildId) {
  const gd = guildData(guildId);
  if (!gd.autoJail || typeof gd.autoJail !== "object" || Array.isArray(gd.autoJail)) {
    gd.autoJail = {};
  }
  const aj = gd.autoJail;
  
  // Normalize configuration
  if (typeof aj.enabled !== "boolean") aj.enabled = false;
  if (!aj.channelId) aj.channelId = null;
  if (!aj.messageChannelId) aj.messageChannelId = null;
  if (!aj.adminRoleId) aj.adminRoleId = null;
  if (!aj.createdAt) aj.createdAt = null;
  if (!Number.isInteger(aj.maxJailedUsers) || aj.maxJailedUsers < 0) aj.maxJailedUsers = 0;
  if (!Number.isInteger(aj.autoReleaseMs) || aj.autoReleaseMs < 0) aj.autoReleaseMs = 0;
  if (!Array.isArray(aj.jailedUsers)) aj.jailedUsers = []; // Track recently jailed users
  if (!aj.violations || typeof aj.violations !== "object") aj.violations = {};
  
  return aj;
}

function getAutoJailConfig(guildId) {
  const aj = ensureAutoJailState(guildId);
  return {
    enabled: aj.enabled === true,
    channelId: aj.channelId || null,
    hasConfiguration: !!aj.channelId && aj.enabled === true,
  };
}

async function deleteUserMessagesInChannel(channel, userId, options = {}) {
  if (!channel || !userId) return { deleted: 0, failed: 0, errors: [] };
  
  const maxMessages = options.maxMessages || 100;
  const errors = [];
  let deleted = 0;
  let failed = 0;
  
  try {
    let before = options.before || null;
    let hasMore = true;
    let processed = 0;
    
    while (hasMore && processed < maxMessages) {
      const fetchOptions = { limit: 100 };
      if (before) fetchOptions.before = before;
      
      let messages = [];
      try {
        messages = await channel.messages.fetch(fetchOptions).catch(() => []);
      } catch (err) {
        errors.push(`Failed to fetch messages: ${err.message}`);
        break;
      }
      
      if (!messages || messages.size === 0) {
        hasMore = false;
        break;
      }
      
      // Filter for this user's messages. Continue paging even when a batch
      // contains no matching messages; the user's older messages may follow.
      const userMessages = messages.filter(msg => msg.author?.id === userId && !msg.pinned);

      for (const [, msg] of userMessages) {
        if (processed >= maxMessages) break;
        processed++;
        try {
          await msg.delete();
          deleted++;
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          failed++;
          if (err.code !== 10008) { // Ignore "Unknown Message" errors
            errors.push(`Failed to delete message ${msg.id}: ${err.message}`);
          }
        }
      }
      
      // Page from the oldest fetched message, not the oldest matching message.
      const oldestMsg = messages.last();
      if (oldestMsg) {
        before = oldestMsg.id;
      } else {
        hasMore = false;
      }
      if (messages.size < 100) hasMore = false;
    }
  } catch (err) {
    errors.push(`Unexpected error: ${err.message}`);
  }
  
  return { deleted, failed, errors, totalProcessed: deleted + failed };
}

async function deleteUserMessagesFromLastDays(channel, userId, days = 7, options = {}) {
  if (!channel || !userId || days < 1) return { deleted: 0, failed: 0, errors: [] };
  
  const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);
  const cutoffDate = new Date(cutoffTime);
  let deleted = 0;
  let failed = 0;
  const errors = [];
  
  try {
    const botMember = channel.guild?.members.me || await channel.guild?.members.fetchMe?.().catch(() => null);
    const permissions = channel.permissionsFor?.(botMember);
    if (!permissions?.has?.(["ViewChannel", "ReadMessageHistory", "ManageMessages"])) {
      errors.push("Bot missing Manage Messages permission");
      return { deleted: 0, failed: 0, errors };
    }
    
    let before = null;
    let hasMore = true;
    let processedCount = 0;
    const maxToProcess = options.maxMessages || 1000;
    
    while (hasMore && processedCount < maxToProcess) {
      const fetchOptions = { limit: 100 };
      if (before) fetchOptions.before = before;
      
      let messages = [];
      try {
        messages = await channel.messages.fetch(fetchOptions).catch(() => []);
      } catch (err) {
        errors.push(`Failed to fetch messages: ${err.message}`);
        break;
      }
      
      if (!messages || messages.size === 0) {
        hasMore = false;
        break;
      }
      
      // Stop if we've reached messages older than cutoff
      const oldestMsg = messages.last();
      if (oldestMsg && oldestMsg.createdTimestamp < cutoffTime) {
        // Keep processing this batch but will stop after
        hasMore = false;
      }
      
      // Filter for this user's messages within time window
      const userMessages = messages.filter(msg => 
        msg.author?.id === userId && 
        !msg.pinned &&
        msg.createdTimestamp >= cutoffTime
      );
      
      // Delete messages
      for (const [, msg] of userMessages) {
        try {
          await msg.delete();
          deleted++;
          processedCount++;
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (err) {
          failed++;
          processedCount++;
          if (err.code !== 10008) { // Ignore "Unknown Message" errors
            errors.push(`Failed to delete message: ${err.message}`);
          }
        }
      }
      
      before = oldestMsg?.id;
    }
  } catch (err) {
    errors.push(`Unexpected error during cleanup: ${err.message}`);
  }
  
  return { deleted, failed, errors, cutoffDate: new Date(cutoffTime) };
}

async function deleteMessageAttachments(message, options = {}) {
  if (!message || !message.attachments || message.attachments.size === 0) {
    return { deleted: 0, failed: 0 };
  }
  
  // Attachments are deleted with the message, so this is just tracking
  return {
    deleted: message.attachments.size,
    failed: 0,
    attachments: message.attachments.map(att => ({
      name: att.name,
      size: att.size,
      url: att.url,
    })),
  };
}

async function triggerAutoJail(message, guildId, options = {}) {
  if (!message || !guildId || message.author?.bot) return false;
  
  const aj = ensureAutoJailState(guildId);
  if (!aj.enabled || !aj.channelId || message.channel.id !== aj.channelId) {
    return false;
  }
  const activeJailedUsers = Array.isArray(aj.jailedUsers) ? aj.jailedUsers.filter(id => {
    const member = message.guild.members.cache.get(id);
    return member?.roles.cache.has(guildData(guildId).wallSystem?.quarantineRoleId || guildData(guildId).wallSystem?.roleId);
  }).length : 0;
  if (aj.maxJailedUsers > 0 && activeJailedUsers >= aj.maxJailedUsers && !aj.jailedUsers.includes(message.author.id)) {
    return false;
  }
  
  // Get runtime state
  const runtime = globalThis.__soezyAutoJailRuntime;
  const processingKey = `${guildId}:${message.author.id}`;
  
  // Prevent duplicate processing (rate limiting)
  const lastProcessed = runtime.processingMessages.get(processingKey);
  if (lastProcessed && Date.now() - lastProcessed < RATE_LIMIT_MS) {
    return false;
  }
  runtime.processingMessages.set(processingKey, Date.now());
  
  const guild = message.guild;
  const userId = message.author.id;
  const member = message.member || await guild?.members?.fetch(userId).catch(() => null);
  
  // Validation checks
  if (userId === message.guild?.ownerId) {
    console.warn(`[AUTO-JAIL] Attempted to jail server owner in ${guildId}`);
    return false;
  }
  
  if (member?.permissions?.has?.(["Administrator", "ManageGuild"]) ||
      member?.roles?.cache?.some(r => r.permissions.has("Administrator"))) {
    console.warn(`[AUTO-JAIL] Attempted to jail admin in ${guildId}`);
    return false;
  }
  
  try {
    const wallSystem = guildData(guildId).wallSystem;
    if (!wallSystem?.enabled || !(wallSystem.quarantineRoleId || wallSystem.roleId)) {
      console.warn(`[AUTO-JAIL] No quarantine role configured in ${guildId}`);
      return false;
    }

    if (!member) return false;
    const jailResult = await wallQuarantineMember(member, {
      reason: options.reason || "Message in Auto-Jail channel",
      source: "auto_jail",
      autoAction: true,
      auditReason: "[Auto-Jail] Message in monitored channel",
    });
    await message.delete().catch(err => {
      if (err?.code !== 10008) {
        soezyLogger?.warn?.("auto-jail-delete", `Could not delete triggering message ${message.id}: ${err.message}`);
      }
    });

    // Keep the configured jailer/admin role informed so staff can review
    // possible false positives after the triggering message is removed.
    if (!jailResult.alreadyQuarantined) {
      const adminRoleId = guildData(guildId).wallSystem?.appealAdminRoleId || aj.adminRoleId || guildData(guildId).wallSystem?.jailerRoleId;
      const displayName = member?.displayName || member?.user?.displayName || member?.user?.username || message.author?.username || userId;
      const notification = `${adminRoleId ? `<@&${adminRoleId}> ` : ""}**${displayName}** has been jailed.`;
      const noticeContainer = typeof createLoggingContainer === "function"
        ? createLoggingContainer("autoJail", {
          guild,
          type: "warning",
          title: "Jail Alert",
          description: notification,
          accent: false,
          footer: false,
          separator: false,
          thumbnail: member?.displayAvatarURL?.({ extension: "png", size: 128 }) || message.author?.displayAvatarURL?.({ extension: "png", size: 128 }) || null,
        })
        : new ContainerBuilder()
          .addTextDisplayComponents(t => t.setContent("### Auto-Jail Alert"))
          .addSeparatorComponents(s => s.setSpacing(1).setDivider(true))
          .addTextDisplayComponents(t => t.setContent(notification));
      const notificationChannel = guild.channels.cache.get(aj.messageChannelId) || message.channel;
      await notificationChannel.send({
        components: [noticeContainer],
        flags: typeof MessageFlags !== "undefined" ? MessageFlags.IsComponentsV2 : 32768,
        allowedMentions: adminRoleId
          ? { roles: [adminRoleId], users: [userId] }
          : { users: [userId], roles: [] }
      }).catch(err => {
        soezyLogger?.warn?.("auto-jail-notify", `Could not notify staff for ${userId}: ${err.message}`);
      });
    }

    // Log the action
    if (typeof soezyLogger !== "undefined") {
      soezyLogger.info("AUTO_JAIL", `${jailResult.alreadyQuarantined ? "Duplicate trigger ignored" : "User auto-jailed"}: ${message.author.tag} (${userId}) in ${guild.name}`);
    }
    
    // Track the jailed user for this session
    if (!Array.isArray(aj.jailedUsers)) aj.jailedUsers = [];
    if (!aj.jailedUsers.includes(userId)) {
      aj.jailedUsers.push(userId);
    }
    // Record violation
    if (!aj.violations) aj.violations = {};
    if (!aj.violations[userId]) {
      aj.violations[userId] = { count: 0, lastAt: null, messages: [] };
    }
    aj.violations[userId].count++;
    aj.violations[userId].lastAt = Date.now();
    if (aj.autoReleaseMs > 0) {
      aj.violations[userId].releaseAt = Date.now() + aj.autoReleaseMs;
    }
    aj.violations[userId].messages.push({
      timestamp: Date.now(),
      messageId: message.id,
      channelId: message.channel.id,
      content: message.content?.slice(0, 100) || "[empty]",
    });
    
    saveDB();
    if (!jailResult.alreadyQuarantined && typeof wallNotifyAutoJailAppeal === "function") {
      // Notification failures must not undo a successful quarantine or its timer.
      await wallNotifyAutoJailAppeal(member).catch(error => {
        console.warn(`[AUTO-JAIL] Appeal notification failed for ${userId}: ${error.message}`);
      });
    }
    return !jailResult.alreadyQuarantined;
  } catch (err) {
    console.error(`[AUTO-JAIL] Error jailing user: ${err.message}`);
    return false;
  }
}

async function startAutoJailCleanup(guild, userId, options = {}) {
  if (!guild || !userId) return false;
  
  const guildId = guild.id;
  const aj = ensureAutoJailState(guildId);
  
  if (!aj.channelId) {
    console.warn(`[AUTO-JAIL-CLEANUP] No auto-jail channel configured for ${guildId}`);
    return false;
  }
  
  const channel = guild.channels.cache.get(aj.channelId);
  if (!channel || !channel.isTextBased?.()) {
    console.warn(`[AUTO-JAIL-CLEANUP] Invalid auto-jail channel in ${guildId}`);
    return false;
  }
  
  try {
    // Check permissions
    const botMember = guild.members.me || await guild.members.fetchMe?.().catch(() => null);
    const permissions = channel.permissionsFor?.(botMember);
    if (!permissions?.has?.(["ViewChannel", "ReadMessageHistory", "ManageMessages"])) {
      console.warn(`[AUTO-JAIL-CLEANUP] Bot missing Manage Messages in ${guildId}`);
      return false;
    }
    
    // Perform cleanup
    const result = await deleteUserMessagesFromLastDays(channel, userId, 7, {
      maxMessages: 500,
    });
    
    if (typeof soezyLogger !== "undefined") {
      soezyLogger.info("AUTO-JAIL-CLEANUP", 
        `Cleaned up messages for ${userId} in ${guildId}: deleted=${result.deleted}, failed=${result.failed}`
      );
    }
    
    return { success: true, deleted: result.deleted, failed: result.failed };
  } catch (err) {
    console.error(`[AUTO-JAIL-CLEANUP] Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

function disableAutoJail(guildId) {
  const aj = ensureAutoJailState(guildId);
  aj.enabled = false;
  saveDB();
  return true;
}

function enableAutoJail(guildId) {
  const aj = ensureAutoJailState(guildId);
  if (!aj.channelId) return false;
  aj.enabled = true;
  saveDB();
  return true;
}

function removeAutoJailChannel(guildId) {
  const aj = ensureAutoJailState(guildId);
  aj.enabled = false;
  aj.channelId = null;
  aj.messageChannelId = null;
  aj.createdAt = null;
  saveDB();
  return aj;
}

function setAutoJailChannel(guildId, channelId) {
  const aj = ensureAutoJailState(guildId);
  
  if (channelId) {
    aj.channelId = channelId;
    aj.createdAt = Date.now();
  } else {
    aj.enabled = false;
    aj.channelId = null;
  }
  
  saveDB();
  return aj;
}

function getAutoJailStatus(guildId) {
  const gd = guildData(guildId);
  const aj = ensureAutoJailState(guildId);
  
  return {
    enabled: aj.enabled === true,
    channelId: aj.channelId || null,
    createdAt: aj.createdAt ? new Date(aj.createdAt) : null,
    violationCount: Object.keys(aj.violations || {}).length,
    recentJailedCount: (aj.jailedUsers || []).length,
    maxJailedUsers: aj.maxJailedUsers,
    autoReleaseMs: aj.autoReleaseMs,
    violations: aj.violations || {},
  };
}

async function releaseExpiredAutoJails() {
  const botClient = globalThis.client || globalThis.__soezyClient;
  if (!botClient?.guilds?.cache) return;
  for (const guild of botClient.guilds.cache.values()) {
    const aj = ensureAutoJailState(guild.id);
    if (!aj.autoReleaseMs || !aj.violations) continue;
    for (const [userId, violation] of Object.entries(aj.violations)) {
      if (!violation.releaseAt || violation.releaseAt > Date.now()) continue;
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member && typeof wallReleaseMember === "function") {
        await wallReleaseMember(member, { auditReason: "Auto-Jail release timer expired" }).catch(() => {});
      }
      delete violation.releaseAt;
      aj.jailedUsers = (aj.jailedUsers || []).filter(id => id !== userId);
      saveDB();
    }
  }
}
if (!globalThis.__soezyAutoJailReleaseTimer) {
  globalThis.__soezyAutoJailReleaseTimer = setInterval(releaseExpiredAutoJails, 30_000);
}

Object.assign(globalThis, {
  ensureAutoJailState,
  getAutoJailConfig,
  deleteUserMessagesInChannel,
  deleteUserMessagesFromLastDays,
  deleteMessageAttachments,
  triggerAutoJail,
  startAutoJailCleanup,
  disableAutoJail,
  setAutoJailChannel,
  enableAutoJail,
  removeAutoJailChannel,
  getAutoJailStatus,
  releaseExpiredAutoJails,
});

module.exports = {
  ensureAutoJailState,
  getAutoJailConfig,
  deleteUserMessagesInChannel,
  deleteUserMessagesFromLastDays,
  deleteMessageAttachments,
  triggerAutoJail,
  startAutoJailCleanup,
  disableAutoJail,
  setAutoJailChannel,
  enableAutoJail,
  removeAutoJailChannel,
  getAutoJailStatus,
  releaseExpiredAutoJails,
};
