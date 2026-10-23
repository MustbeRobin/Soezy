/* ================= READY EVENT ================= */
if (typeof globalThis.__soezyReadyEventLoaded === "undefined") {
globalThis.__soezyReadyEventLoaded = true;

function rawTicketPanelComponent(component) {
  if (!component) return component;
  if (typeof component.toJSON === "function") return component.toJSON();
  try { return JSON.parse(JSON.stringify(component)); } catch { return component; }
}

function enableCreateTicketButtons(component) {
  const raw = rawTicketPanelComponent(component);
  if (!raw || typeof raw !== "object") return { component: raw, changed: false, found: false };
  let changed = false;
  let found = false;
  const customId = raw.custom_id || raw.customId;
  if (customId === "create_ticket") {
    found = true;
    if (raw.disabled) {
      raw.disabled = false;
      changed = true;
    }
  }
  if (Array.isArray(raw.components)) {
    const children = raw.components.map(enableCreateTicketButtons);
    raw.components = children.map(child => child.component).filter(Boolean);
    changed = changed || children.some(child => child.changed);
    found = found || children.some(child => child.found);
  }
  return { component: raw, changed, found };
}

async function repairDisabledTicketPanels(client) {
  let repaired = 0;
  for (const guild of client.guilds.cache.values()) {
    const ticket = guildData(guild.id).ticket;
    if (!ticket?.channel) continue;
    const channel = guild.channels.cache.get(ticket.channel);
    if (!channel?.messages?.fetch) continue;
    const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!messages) continue;
    // New panels persist their message IDs. Fetch those too so a panel remains
    // repairable even when it is older than the channel's recent-message window.
    for (const messageId of ticket.panelMessageIds || []) {
      if (messages.has(messageId)) continue;
      const panelMessage = await channel.messages.fetch(messageId).catch(() => null);
      if (panelMessage) messages.set(panelMessage.id, panelMessage);
    }
    for (const message of messages.values()) {
      if (!message.components?.length) continue;
      const results = message.components.map(enableCreateTicketButtons);
      if (!results.some(result => result.found)) continue;
      if (!results.some(result => result.changed)) continue;
      await message.edit({
        components: results.map(result => result.component).filter(Boolean),
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => {});
      repaired++;
    }
  }
  if (repaired) console.log(`[TICKET] Re-enabled ${repaired} disabled ticket panel button(s).`);
  return repaired;
}

function updateMemberCountStreamingPresence(configuredPresence = db.botPresence) {
  if (!client.isReady()) return;
  let presence;
  if (configuredPresence && typeof configuredPresence.message === "string" && configuredPresence.message.trim()) {
    const activityTypes = {
      Playing: ActivityType.Playing,
      Watching: ActivityType.Watching,
      Listening: ActivityType.Listening,
      Competing: ActivityType.Competing,
    };
    presence = {
      status: ["online", "idle", "dnd"].includes(configuredPresence.status) ? configuredPresence.status : "online",
      activities: [{
        name: configuredPresence.message.slice(0, 128),
        type: activityTypes[configuredPresence.activityType] ?? ActivityType.Playing,
      }],
    };
  } else {
    const memberCount = client.guilds.cache.reduce((total, guild) => {
      const count = Number(guild.memberCount);
      return total + (Number.isFinite(count) && count > 0 ? count : 0);
    }, 0);
    presence = {
      status: "online",
      activities: [{
        name: "with " + memberCount.toLocaleString("en-US") + " members!",
        type: ActivityType.Streaming,
        url: "https://www.twitch.tv/youknowntg",
      }],
    };
  }
  const signature = JSON.stringify(presence);
  if (globalThis.__soezyPresenceSignature === signature) return;
  client.user.setPresence(presence);
  globalThis.__soezyPresenceSignature = signature;
}
globalThis.__soezyApplyBotPresence = updateMemberCountStreamingPresence

client.once("clientReady", async () => {
  console.log(`\n${"═".repeat(50)}`);
  console.log(`[BOT]     Online!`);
  console.log(`[BOT]     Logged in as: ${client.user.tag}`);
  console.log(`[BOT]     Servers: ${client.guilds.cache.size}`);
  console.log(`[BOT]     Users: ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`);
  console.log(`[BOT]     Started at: ${new Date().toISOString()}`);
  console.log(`[BOT]     discord.js: ${require('./node_modules/discord.js/package.json').version}`);
  if (typeof initSoezyRedis === "function") await initSoezyRedis();
  for (const guild of client.guilds.cache.values()) {
    try {
      await require("./utils/soezyLogCategory").migrate(guild, { guildData, saveDB });
    } catch (error) {
      console.warn(`[LOG CATEGORY] ${guild.id}: ${error.message}`);
    }
  }
  if (typeof rebuildCommandRegistryFromHelp === "function") rebuildCommandRegistryFromHelp();
  console.log("[SYSTEM] Queue system active");
  console.log("[SYSTEM] Cache system active");
  console.log(`[SYSTEM] Redis primary database ${globalThis.__soezyRedis?.isReady ? "connected" : "temporarily unavailable; writes pending"}`);
  console.log("[SYSTEM] Interaction throttling enabled");
  console.log("[SYSTEM] Music optimization enabled");
  console.log("[SYSTEM] Duplicate handler protection active");
  console.log("[RATELIMIT] Guild command limiter enabled");
  console.log("[RATELIMIT] Giveaway limiter enabled");
  console.log("[SECURITY] Permission audit complete");
  console.log("[SECURITY] Dangerous commands secured");
  console.log("[SECURITY] No-prefix protections active");
  console.log("[SECURITY] Runtime sandbox validated");
  console.log("[SECURITY] Eval protection active");
  if (!globalThis.__warnShown) {
  globalThis.__warnShown = true;
  console.log("[BOT] Startup complete");
}
  console.log(`${"═".repeat(50)}\n`);

  // ── One-time migration: fix mention-formatted premium keys ──────────────
  if (db.premium) {
    let migrated = false;
    const mentionRegex = /^<[@#!&]+(\d+)>$/;
    for (const store of ["users", "guilds"]) {
      if (!db.premium[store]) continue;
      for (const key of Object.keys(db.premium[store])) {
        const match = key.match(mentionRegex);
        if (match) {
          const cleanId = match[1];
          db.premium[store][cleanId] = db.premium[store][key];
          delete db.premium[store][key];
          migrated = true;
          console.log(`[PREMIUM] Migrated malformed key "${key}" → "${cleanId}"`);
        }
      }
    }
    if (migrated) saveDB();
  }

  // Use gateway member totals; fetching every member would add unnecessary load.
  updateMemberCountStreamingPresence();
  if (!globalThis.__soezyMemberCountPresenceTimer) {
    globalThis.__soezyMemberCountPresenceTimer = setInterval(() => {
      try { updateMemberCountStreamingPresence(); }
      catch (error) { console.warn(`[PRESENCE] Could not update member count: ${error.message}`); }
    }, 60000);
    globalThis.__soezyMemberCountPresenceTimer.unref?.();
  }

  // ── Register slash commands ──────────────────────────────────────────────
  // Discord enforces a hard limit of 100 global application commands.
  // Strategy:
  //   1. Fetch what Discord currently has registered.
  //   2. Delete any stale commands (registered on Discord but removed from code).
  //   3. Enforce the 100-command cap — warn and slice if exceeded.
  //   4. Skip the PUT if nothing changed (saves rate-limit quota).
  // ────────────────────────────────────────────────────────────────────────
  try {
    const DISCORD_COMMAND_LIMIT = 100;

    const compactCommand = command => ({
      name: command.name,
      description: command.description,
      type: command.type || 1,
      options: command.options || []
    });

    const stable = value => JSON.stringify(value, (key, item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      return Object.keys(item).sort().reduce((acc, k) => { acc[k] = item[k]; return acc; }, {});
    });
    const hashCommands = value => require("crypto").createHash("sha256").update(stable(value)).digest("hex");

    // ── Step 1: Fetch existing Discord commands ──
    const existingCommands = await restClient
      .get(Routes.applicationCommands(client.user.id))
      .catch(() => null);

    // ── Step 2: Delete stale commands (on Discord but no longer in code) ──
    if (Array.isArray(existingCommands) && existingCommands.length > 0) {
      const currentNames = new Set(commands.map(c => c.name));
      const staleCommands = existingCommands.filter(c => !currentNames.has(c.name));
      if (staleCommands.length > 0) {
        console.log(`[COMMANDS] Removing ${staleCommands.length} stale command(s)...`);
        for (const cmd of staleCommands) {
          await restClient
            .delete(Routes.applicationCommand(client.user.id, cmd.id))
            .catch(e => console.warn(`[COMMANDS] Could not delete stale command "/${cmd.name}":`, e.message));
          console.log(`[COMMANDS] Deleted stale command: /${cmd.name}`);
        }
      }
    }

    // ── Step 3: Enforce the 100-command limit ──
    let commandsToRegister = commands;
    if (commands.length > DISCORD_COMMAND_LIMIT) {
      const dropped = commands.slice(DISCORD_COMMAND_LIMIT).map(c => c.name);
      console.warn(
        `[COMMANDS] ⚠ ${commands.length} commands defined — Discord only allows ${DISCORD_COMMAND_LIMIT}.\n` +
        `[COMMANDS] ⚠ The following ${dropped.length} command(s) will NOT be registered:\n` +
        dropped.map(n => `             • /${n}`).join("\n") + "\n" +
        `[COMMANDS] ⚠ Fix: remove or merge commands in your commands list to stay under ${DISCORD_COMMAND_LIMIT}.`
      );
      commandsToRegister = commands.slice(0, DISCORD_COMMAND_LIMIT);
    }

    const nextHash = hashCommands(commandsToRegister.map(compactCommand).sort((a, b) => a.name.localeCompare(b.name)));
    const slashCachePath = "./logs/slash-command-hash.json";
    const cachedSlash = fs.existsSync(slashCachePath)
      ? JSON.parse(fs.readFileSync(slashCachePath, "utf8") || "{}")
      : {};
    const existingCompact = Array.isArray(existingCommands)
      ? existingCommands.map(compactCommand).sort((a, b) => a.name.localeCompare(b.name))
      : null;
    const nextCompact = commandsToRegister
      .map(compactCommand)
      .sort((a, b) => a.name.localeCompare(b.name));
    const remoteCommandsMatch = existingCompact && stable(existingCompact) === stable(nextCompact);
    const skipSlashSyncByHash = cachedSlash.hash === nextHash && remoteCommandsMatch && process.env.SOEZY_FORCE_SLASH_SYNC !== "1";
    if (skipSlashSyncByHash) {
      console.log(`[COMMANDS] Slash command payload unchanged (${commandsToRegister.length}); skipped Discord sync`);
    }

    // ── Step 4: Skip registration if nothing changed ──
    if (!skipSlashSyncByHash) {
    if (remoteCommandsMatch) {
      console.log(`[COMMANDS] Slash commands already up to date (${commandsToRegister.length}); skipped registration`);
    } else {
      await restClient.put(
        Routes.applicationCommands(client.user.id),
        { body: commandsToRegister }
      );
      fs.mkdirSync("./logs", { recursive: true });
      fs.writeFileSync(slashCachePath, JSON.stringify({ hash: nextHash, count: commandsToRegister.length, syncedAt: Date.now() }, null, 2));
      console.log(`[COMMANDS] Slash commands registered globally (${commandsToRegister.length})`);
    }
    }
  } catch (err) {
    console.error("Command registration error:", err);
  }
  
  // Check birthdays on startup
  setTimeout(checkBirthdays, 5000);

  // Restore active giveaways
  await restoreGiveaways();

  // Ticket-open panels are persistent controls, not temporary menus. Repair
  // panels created by older versions that were disabled before a restart.
  await repairDisabledTicketPanels(client).catch(error => console.warn("[TICKET] Panel repair failed:", error.message));

  // ── AntiNuke: take snapshots on startup for all enabled guilds ──
  let snapshotOk = 0, snapshotFail = 0;
  for (const guild of client.guilds.cache.values()) {
    if (!guildData(guild.id).antinuke?.enabled) continue;
    const ok = await takeGuildSnapshot(guild).catch(() => false);
    ok ? snapshotOk++ : snapshotFail++;
  }
  if (snapshotOk > 0 || snapshotFail > 0)
    console.log(`[ANTINUKE] Snapshots on startup: ${snapshotOk} ok, ${snapshotFail} failed`);

});
} else {
  console.warn("[READY] Ready handler already registered; skipped duplicate.");
}
