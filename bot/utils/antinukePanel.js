(() => {
const features = [
  ["Anti Ban", "antiban"], ["Anti Unban", "antiunban"], ["Anti Kick", "antikick"], ["Anti Bot Add", "antibot"],
  ["Anti Channel Create/Delete/Update", "antichannelcreate", "antichanneldelete", "antichannelupdate"],
  ["Anti Role Create/Delete/Update", "antirolecreate", "antiroledelete", "antiroleupdate"],
  ["Anti Member Update", "antimemberupdate"],
  ["Anti Emoji/Sticker Create/Delete/Update", "antiemojicreate", "antistickercreate", "antiemojidelete", "antistickerdelete", "antiemojiupdate", "antistickerupdate"],
  ["Anti Integration", "antibot"], ["Anti Guild Update", "antiguildupdate"],
  ["Anti Webhook Create/Delete/Update", "antiwebhookcreate", "antiwebhookdelete", "antiwebhookupdate"],
];
const eventGroups = {
  channels: ["antichannelcreate", "antichanneldelete", "antichannelupdate"],
  roles: ["antirolecreate", "antiroledelete", "antiroleupdate"],
  expressions: ["antiemojicreate", "antiemojidelete", "antiemojiupdate", "antistickercreate", "antistickerdelete", "antistickerupdate"],
  webhooks: ["antiwebhookcreate", "antiwebhookdelete", "antiwebhookupdate"],
  antiautomodrules: ["antiautomodcreate", "antiautomoddelete"],
};
// Single source of truth for Enable/Disable button state: derived from saved config only.
function bulkState(guildId) {
  const an = guildData(guildId).antinuke || {};
  const enabled = typeof an.systemEnabled === "boolean" ? an.systemEnabled : an.enabled === true;
  return getBulkToggleState(enabled, [true]);
}
function build(guildId, sessionId, user) {
  const gd = guildData(guildId), an = gd.antinuke || {}, events = an.events || {};
  const bulk = bulkState(guildId);
  const owners = (gd.extraOwners || []).map(id => `<@${id}>`).join(", ") || "`Not Configured`";
  const raid = gd.antiRaid || {};
  const groupedKeys = new Set(Object.values(eventGroups).flat());
  const labels = { antiban: "Anti Ban", antiunban: "Anti Unban", antikick: "Anti Kick", antibot: "Anti Bot Add / Integration", antimemberupdate: "Anti Member Update", antiguildupdate: "Anti Guild Update" };
  const menuEvents = ANTINUKE_EVENTS.filter(event => !groupedKeys.has(event.id)).map(event => ({
    ...event,
    label: labels[event.id] || event.label,
    description: events[event.id] === true ? "Saved ON - select to turn off" : "Saved OFF - select to turn on",
  }));
  for (const [id, label] of [["channels", "Anti Channel Create/Delete/Update"], ["roles", "Anti Role Create/Delete/Update"], ["expressions", "Anti Emoji/Sticker Create/Delete/Update"], ["webhooks", "Anti Webhook Create/Delete/Update"], ["antiautomodrules", "Anti AutoMod Rule Create/Delete"]]) {
    if (!eventGroups[id].some(key => ANTINUKE_EVENTS.some(event => event.id === key))) continue;
    const on = eventGroups[id].every(key => events[key] === true);
    menuEvents.push({ id, label, description: on ? "Saved ON - select to turn off group" : "Saved OFF - select to turn on the whole group" });
  }
  menuEvents.push({ id: "antiraid", label: "Anti Raid", description: raid.enabled === true ? "Saved ON - select to turn off" : "Saved OFF - select to turn on" });
  const systemEnabled = typeof an.systemEnabled === "boolean" ? an.systemEnabled : an.enabled === true;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.thinking} **AntiNuke Configuration**`))
    .addSeparatorComponents(s => s.setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`> **Status \u2192** \`${systemEnabled ? "Enabled" : "Disabled"}\` · ${systemEnabled ? "Active" : "Inactive"}\n> **Extra Owners (Whitelist)** \u2192 ${owners}`))
    .addSeparatorComponents(s => s.setDivider(true))
    .addTextDisplayComponents(t => t.setContent(systemEnabled ? "***__Security Features__***" : "***__Saved Security Preferences · Inactive__***"));
  container.addSeparatorComponents(s => s.setDivider(true))
    .addTextDisplayComponents(t => t.setContent(features.map(([label, ...keys]) => {
      const on = keys.length && keys.every(key => events[key] === true);
      return `> ${on ? EMOJIS.an_tick : EMOJIS.an_disable} ${label} · ${on ? "ON" : "OFF"} · ${systemEnabled && on ? "Active" : "Inactive"}${keys.length ? "" : " (managed separately in AutoMod)"}`;
    }).concat(`> ${raid.enabled === true ? EMOJIS.an_tick : EMOJIS.an_disable} Anti Raid · ${raid.enabled === true ? "ON" : "OFF"} · ${systemEnabled && raid.enabled === true ? "Active" : "Inactive"} · ${raid.threshold || 10} joins / ${(raid.interval || 10000) / 1000}s`).join("\n")));
  if (!systemEnabled) container.addTextDisplayComponents(t => t.setContent(`-# ${EMOJIS.an_alert} AntiNuke is inactive. Saved protection preferences will apply when enabled.`));
  container.addSeparatorComponents(s => s.setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ancfg_panel_enable_${sessionId}`).setLabel("Enable").setEmoji(EMOJIS.moderation_dm_tick).setStyle(ButtonStyle.Secondary).setDisabled(bulk.allEnabled),
    new ButtonBuilder().setCustomId(`ancfg_panel_disable_${sessionId}`).setLabel("Disable").setEmoji(EMOJIS.scross).setStyle(ButtonStyle.Secondary).setDisabled(bulk.allDisabled),
      new ButtonBuilder().setCustomId(`ancfg_panel_owners_${sessionId}`).setLabel("Extra Owners").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setLabel("Dashboard").setStyle(ButtonStyle.Link).setURL(require("./utils/securityDashboardSettings").dashboardUrl(guildId, "antinuke"))));
  container.addActionRowComponents(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(`ancfg_panel_events_${sessionId}`).setPlaceholder("Enable / disable a protection")
    .addOptions(menuEvents.map(event => ({
      label: event.label, value: event.id, description: event.description,
    })))));
  return container;
}
const progress = text => ({ components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`> **${getEmoji("arrow")} ${text}**`))], flags: MessageFlags.IsComponentsV2 });
const jobs = new Set();
async function setAll(guildId, enabled, client) {
  setFeatureState(guildId, "antinuke", enabled, { client, linked: false, sync: false });
  const gd = guildData(guildId);
  if (!["ban", "kick", "strip"].includes(gd.antinuke.punishment)) gd.antinuke.punishment = "ban";
  gd.antinuke.events ||= {};
  if (!enabled) require("./utils/securityDisableFeatures").disableAntiNukeFeatures(
    gd, ANTINUKE_EVENTS.map(event => event.id), globalThis.db?.guildSystems?.[guildId]
  );
  saveDB(guildId);
  if (typeof syncFeatureState === "function") await syncFeatureState(guildId, "antinuke", { client, refreshPanels: false });
}
async function ensureLogsChannel(guild, me) {
  await require("./utils/protectionRole").ensureProtectionRole(guild, "antinuke", { guildData, saveDB });
  const an = guildData(guild.id).antinuke || (guildData(guild.id).antinuke = {});
  const existing = an.logs && (guild.channels.cache.get(an.logs) || await guild.channels.fetch(an.logs).catch(error => {
    if (error.code === 10003) return null;
    throw error;
  }));
  if (existing?.isTextBased?.()) return require("./utils/soezyLogCategory").place(guild, existing, { guildData, saveDB });
  if (!me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    throw new Error("I need Manage Channels to create the AntiNuke log channel.");
  }
  const viewAndSend = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ReadMessageHistory,
  ];
  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    ...[...guild.roles.cache.values()]
      .filter(role => role.id !== guild.id && role.permissions?.has(PermissionsBitField.Flags.Administrator))
      .map(role => ({ id: role.id, allow: viewAndSend })),
    { id: guild.ownerId, allow: viewAndSend },
    { id: me.id, allow: [...viewAndSend, PermissionsBitField.Flags.ManageChannels] },
  ];
  const channel = await guild.channels.create({
    name: "antinuke-logs",
    parent: (await require("./utils/soezyLogCategory").ensure(guild, { guildData, saveDB })).id,
    type: ChannelType.GuildText,
    topic: "Private AntiNuke security and recovery logs",
    permissionOverwrites,
    reason: "AntiNuke setup",
  });
  an.logs = channel.id;
  saveDB(guild.id);
  await channel.send({ content: "AntiNuke is enabled. Security actions and recovery events will be logged here." }).catch(() => {});
  return channel;
}
async function start(i) {
  if (!canManageAntiNuke(i.guild, i.user.id)) return i.reply({ content: "Only the configured bot owner or authorized ExtraOwners can enable AntiNuke.", flags: 64 });
  if (jobs.has(i.guildId)) return i.reply({ content: "AntiNuke setup is already running.", flags: 64 });
  try {
    await i.deferUpdate();
    await configure(i.guild, true, i.client);
    if (typeof syncFeatureState === "function") await syncFeatureState(i.guildId, "antinuke", { client: i.client, refreshPanels: false, reason: "antinuke_setup" });
    saveDB();
    await i.editReply({ components: [build(i.guildId, `${i.user.id}_${Date.now()}`, i.user)], flags: MessageFlags.IsComponentsV2 });
  } catch (error) {
    if (i.replied || i.deferred) await i.editReply({ components: [createErrorContainer("AntiNuke Setup Failed", error.message)], flags: MessageFlags.IsComponentsV2 });
    else throw error;
  }
}
async function configure(guild, enabled, client = guild.client) {
  if (jobs.has(guild.id)) throw new Error("AntiNuke setup is already running. Wait for it to finish.");
  jobs.add(guild.id);
  try {
    if (enabled) {
      const me = guild.members.me || await guild.members.fetchMe();
      if (!me.permissions.has([PermissionsBitField.Flags.ViewAuditLog, PermissionsBitField.Flags.BanMembers])) {
        throw new Error("I need View Audit Log and Ban Members. Move my role above the roles I must protect against.");
      }
      await ensureLogsChannel(guild, me);
    }
    await setAll(guild.id, enabled, client);
  } finally { jobs.delete(guild.id); }
}
async function interaction(i) {
  if (i.customId?.startsWith("ancfg_raid_modal_")) {
    const [, , , ownerId, stamp] = i.customId.split("_");
    if (!canManageAntiNuke(i.guild, i.user.id) || ownerId !== i.user.id || !Number.isFinite(Number(stamp)) || Date.now() - Number(stamp) > 300000) {
      await i.reply({ content: "Open your own AntiNuke configuration again.", flags: 64 }); return true;
    }
    const value = key => i.fields.getTextInputValue(key).trim();
    const enabled = value("raid_enabled").toLowerCase();
    const threshold = Number(value("raid_threshold")), seconds = Number(value("raid_interval"));
    const action = value("raid_action").toLowerCase();
    const logId = value("raid_logs").replace(/[<#>]/g, "");
    const log = logId ? i.guild.channels.cache.get(logId) : null;
    if (!["on", "off"].includes(enabled) || !Number.isInteger(threshold) || threshold < 2 || threshold > 1000 || !Number.isInteger(seconds) || seconds < 1 || seconds > 3600 || !["kick", "ban"].includes(action) || (logId && !log?.isTextBased?.())) {
      await i.reply({ content: "Use on/off, 2-1000 joins, 1-3600 seconds, kick/ban, and a text channel ID or mention.", flags: 64 }); return true;
    }
    const gd = guildData(i.guildId);
    gd.antiRaid ||= {};
    Object.assign(gd.antiRaid, { threshold, interval: seconds * 1000, action, logs: log?.id || null });
    setFeatureState(i.guildId, "antiraid", enabled === "on", { client: i.client, linked: false });
    saveDB(i.guildId);
    await i.update({ components: [build(i.guildId, `${i.user.id}_${Date.now()}`, i.user)], flags: MessageFlags.IsComponentsV2 });
    return true;
  }
  if (i.customId?.startsWith("ancfg_owner_modal_")) {
    if (globalThis.isConfiguredBotOwner?.(i.user.id) !== true) {
      await i.reply({ content: "Only the configured bot owner can manage ExtraOwners.", flags: 64 });
      return true;
    }
    const [, , , ownerId, stamp] = i.customId.split("_");
    if (ownerId !== i.user.id || !Number.isFinite(Number(stamp)) || Date.now() - Number(stamp) > 300000) {
      await i.reply({ content: "This form expired. Open AntiNuke config again.", flags: 64 });
      return true;
    }
    const action = i.fields.getTextInputValue("owner_action").trim().toLowerCase();
    const rawId = i.fields.getTextInputValue("owner_user").trim();
    const match = rawId.match(/^(?:<@!?(\d{17,20})>|(\d{17,20}))$/);
    const targetId = match?.[1] || match?.[2];
    if (!["add", "remove"].includes(action) || !targetId) {
      await i.reply({ content: "Enter `add` or `remove`, and a user mention or ID.", flags: 64 });
      return true;
    }
    const gd = guildData(i.guildId);
    gd.extraOwners ||= [];
    if (targetId === i.user.id) {
      await i.reply({ content: "You cannot add or modify your own ExtraOwner access.", flags: 64 });
      return true;
    }
    if (action === "add") {
      const member = await i.guild.members.fetch(targetId).catch(() => null);
      if (!member || member.user.bot) {
        await i.reply({ content: "Choose a human member of this server.", flags: 64 });
        return true;
      }
      if (gd.extraOwners.includes(targetId)) {
        await i.reply({ content: "That member is already an extra owner.", flags: 64 });
        return true;
      }
      if (gd.extraOwners.length >= 25) {
        await i.reply({ content: "A server can have up to 25 extra owners.", flags: 64 });
        return true;
      }
      gd.extraOwners.push(targetId);
    } else {
      if (!gd.extraOwners.includes(targetId)) {
        await i.reply({ content: "That user is not an extra owner.", flags: 64 });
        return true;
      }
      gd.extraOwners = gd.extraOwners.filter(id => id !== targetId);
    }
    saveDB(i.guildId);
    await i.reply({ content: `Extra owner ${action === "add" ? "added" : "removed"}: <@${targetId}>`, flags: 64, allowedMentions: { parse: [] } });
    return true;
  }
  if (!i.customId?.startsWith("ancfg_panel_")) return false;
  const [, , action, ...parts] = i.customId.split("_"), sid = parts.join("_");
  const stamp = Number(parts[1]);
  if (!canManageAntiNuke(i.guild, i.user.id) || parts[0] !== i.user.id || !Number.isFinite(stamp) || Date.now() - stamp > 300000) {
    await i.reply({ content: "This panel expired or you cannot manage it. Open antinuke config again.", flags: 64 }); return true;
  }
  if (action === "enable") {
    if (bulkState(i.guildId).allEnabled) { // already fully enabled: refresh only, no writes
      await i.update({ components: [build(i.guildId, sid, i.user)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }
    await start(i);
  } else if (action === "raid") {
    const raid = guildData(i.guildId).antiRaid || {};
    const modal = new ModalBuilder().setCustomId(`ancfg_raid_modal_${i.user.id}_${Date.now()}`).setTitle("AntiNuke Raid Settings");
    for (const [id, label, value, required] of [
      ["raid_enabled", "Raid protection: on / off", raid.enabled ? "on" : "off", true],
      ["raid_threshold", "Join threshold (2-1000)", String(raid.threshold || 10), true],
      ["raid_interval", "Detection window in seconds (1-3600)", String((raid.interval || 10000) / 1000), true],
      ["raid_action", "Action: kick / ban", raid.action || "kick", true],
      ["raid_logs", "Log channel ID or mention (blank clears)", raid.logs || "", false],
    ]) modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setValue(value).setRequired(required)));
    await i.showModal(modal);
  } else if (action === "owners") {
    if (globalThis.isConfiguredBotOwner?.(i.user.id) !== true) {
      await i.reply({ content: "Only the configured bot owner can manage ExtraOwners.", flags: 64 });
      return true;
    }
    const owners = guildData(i.guildId).extraOwners || [];
    const modal = new ModalBuilder()
      .setCustomId(`ancfg_owner_modal_${i.user.id}_${Date.now()}`)
      .setTitle("Manage Extra Owners")
      .addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("owner_action").setLabel("Action: add or remove").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(6)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("owner_user").setLabel("Server member mention or ID").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(24)),
      );
    await i.showModal(modal);
  } else {
    if (jobs.has(i.guildId)) { await i.reply({ content: "Wait for setup to finish.", flags: 64 }); return true; }
    if (action === "disable") {
      if (bulkState(i.guildId).allDisabled) { // already fully disabled: refresh only, no writes
        await i.update({ components: [build(i.guildId, sid, i.user)], flags: MessageFlags.IsComponentsV2 });
        return true;
      }
      await setAll(i.guildId, false, i.client);
    }
    else if (action.startsWith("events")) {
      const id = i.values?.[0];
      const an = guildData(i.guildId).antinuke;
      an.events ||= {};
      if (id === "antiraid") {
        setFeatureState(i.guildId, "antiraid", !guildData(i.guildId).antiRaid?.enabled, { client: i.client, linked: false });
      } else if (eventGroups[id]) {
        const keys = eventGroups[id];
        const enabled = keys.every(key => an.events[key] !== false);
        for (const key of keys) an.events[key] = !enabled;
      } else {
        if (!ANTINUKE_EVENTS.some(event => event.id === id)) { await i.reply({ content: "Unknown protection.", flags: 64 }); return true; }
        an.events[id] = an.events[id] === false;
      }
      if (typeof syncProtectionPreferenceState === "function") syncProtectionPreferenceState(guildData(i.guildId), "legacy");
      saveDB();
    }
    await i.update({ components: [build(i.guildId, sid, i.user)], flags: MessageFlags.IsComponentsV2 });
  }
  return true;
}
globalThis.soezyAntiNukePanel = { build, start, interaction, ensureLogsChannel, setAll, configure };
})();
