/* Provision missing configuration resources before enabling a feature. */
(() => {
const jobs = new Map();
const aliases = { tickets: "ticket", logs: "logging", report: "reports", bye: "goodbye", mediaonly: "media", verification: "verify", confess: "confession" };
async function ensureFeatureInfrastructure(guild, feature) {
  const key = aliases[feature] || feature;
  const jobKey = `${guild.id}:${key}`;
  if (jobs.has(jobKey)) return jobs.get(jobKey);
  const job = provision(guild, key).finally(() => jobs.delete(jobKey));
  jobs.set(jobKey, job);
  return job;
}
async function provision(guild, key) {
  const gd = guildData(guild.id);
  if (["antinuke", "wall", "automod", "antibot", "antiraid", "access"].includes(key)) {
    await require("./utils/protectionRole").ensureProtectionRole(guild, key, { guildData, saveDB });
  }
  if (key === "wall") {
    const result = await wallEnsureInfrastructure(guild);
    if (!result.ok) throw new Error(result.errors?.join("\n") || "Wall infrastructure could not be created.");
    return;
  }
  if (key === "verify") return setupVerifySystem(guild, { enable: true });
  if (key === "logging") return soezyLogging.enable(guild);
  if (key === "antinuke") return soezyAntiNukePanel.ensureLogsChannel(guild, guild.members.me || await guild.members.fetchMe());
  if (key === "automod") return ensureAutomodLogChannel(guild);
  const names = { welcome: "welcome", goodbye: "goodbye", boost: "boosts", birthday: "birthdays", confession: "confessions", reports: "reports", ticket: "tickets", media: "media", sticky: "announcements", tempvoice: "voice", autorole: "Member" };
  if (key === "joindm") {
    gd.joinDm ||= {};
    gd.joinDm.message ||= "Welcome to {server}, {user}!";
    saveDB(); return;
  }
  if (!names[key]) return; // Optional whitelists and user-written triggers need no infrastructure.
  const state = key === "tempvoice" ? (gd.tempVoice ||= {}) : (gd[key] ||= {});
  const me = guild.members.me || await guild.members.fetchMe();
  const F = PermissionsBitField.Flags;
  const fetch = async (manager, id) => id ? manager.cache.get(id) || await manager.fetch(id).catch(error => {
    if ([10003, 10011].includes(error.code)) return null;
    throw error;
  }) : null;
  async function role(field, name) {
    let found = await fetch(guild.roles, state[field]);
    if (!found) {
      if (!me.permissions.has(F.ManageRoles)) throw new Error(`I need Manage Roles to set up ${key}.`);
      found = await guild.roles.create({ name, permissions: [], reason: `${key} automatic setup` });
      state[field] = found.id; saveDB();
    }
    return found;
  }
  async function channel(field, name, type = ChannelType.GuildText, parent = null, privateChannel = false) {
    let found = await fetch(guild.channels, state[field]);
    if (found && found.type !== type) throw new Error(`The configured ${key} ${field} has the wrong channel type.`);
    if (!found) {
      if (!me.permissions.has(F.ManageChannels)) throw new Error(`I need Manage Channels to set up ${key}.`);
      const overwrites = [{ id: me.id, allow: [F.ViewChannel, F.SendMessages, F.EmbedLinks, F.ReadMessageHistory, F.ManageChannels] }];
      if (privateChannel) overwrites.push({ id: guild.id, deny: [F.ViewChannel] });
      found = await guild.channels.create({ name, type, ...(parent ? { parent } : {}), permissionOverwrites: overwrites, reason: `${key} automatic setup` });
      state[field] = found.id; saveDB();
    }
    return found;
  }
  if (key === "autorole") {
    const existing = (state.userRoles || []).filter(id => guild.roles.cache.has(id));
    if (!existing.length) state.userRoles = [(await role("autoCreatedRoleId", "Member")).id];
  } else if (key === "tempvoice") {
    const category = await channel("category", "Soezy Voice", ChannelType.GuildCategory);
    await channel("createChannel", "Join to Create", ChannelType.GuildVoice, category.id);
  } else if (key === "ticket") {
    await channel("category", "Soezy Tickets", ChannelType.GuildCategory, null, true);
    await channel("channel", "tickets");
    if (!state.supportRole) {
      for (const id of state.supportRoles || []) {
        if (await fetch(guild.roles, id)) { state.supportRole = id; break; }
      }
    }
    const support = await role("supportRole", "Ticket Support");
    state.supportRoles = [...new Set([...(state.supportRoles || []), support.id])];
    state.message ||= "Open a ticket to contact the server team.";
  } else if (key === "media") {
    const ids = state.onlyChannels || gd.mediaOnlyChannels || [];
    const existing = [];
    for (const id of ids) if (await fetch(guild.channels, id)) existing.push(id);
    state.onlyChannels = existing.length ? existing : [(await channel("autoCreatedChannelId", "media")).id];
  } else if (key === "sticky") {
    gd.stickyMessages ||= {};
    for (const [id, entry] of Object.entries(gd.stickyMessages)) {
      if (!await fetch(guild.channels, entry.channelId || id)) {
        const target = await channel("autoCreatedChannelId", "announcements");
        entry.channelId = target.id;
        if (/^\d+$/.test(id)) {
          delete gd.stickyMessages[id];
          gd.stickyMessages[target.id] = entry;
        }
      }
    }
    if (!Object.keys(gd.stickyMessages).length) {
      const target = await channel("autoCreatedChannelId", "announcements");
      gd.stickyMessages[target.id] = { channelId: target.id, enabled: true, content: "Server announcements", messageId: null };
    }
  } else {
    await channel("channel", names[key], ChannelType.GuildText, null, key === "reports");
    if (key === "birthday") await role("role", "Birthday");
    if (key === "confession") {
      state.logChannel ||= state.logs || gd.confessionLogs;
      const category = await require("./utils/soezyLogCategory").ensure(guild, { guildData, saveDB });
      const logs = await channel("logChannel", "confession-logs", ChannelType.GuildText, category.id, true);
      await require("./utils/soezyLogCategory").place(guild, logs, { guildData, saveDB });
      state.logs = logs.id; gd.confessionLogs = logs.id;
    }
    const messages = { welcome: "Welcome {user} to {server}!", goodbye: "Goodbye {user}.", boost: "Thank you {user} for boosting {server}!", birthday: "Happy birthday, {user}!" };
    if (messages[key]) state.message ||= messages[key];
  }
  saveDB();
}
globalThis.ensureFeatureInfrastructure = ensureFeatureInfrastructure;
})();
