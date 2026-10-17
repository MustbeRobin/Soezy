/* ================= CONFIG EMBED BUILDERS ================= */
/* ================= AUTO RESPONDER FUNCTIONS ================= */

function addAutoResponder(guildId, trigger, response, reactions = [], userId, options = {}) {
  // NOTE: do NOT gate on autoresponder.enabled here — the add command already
  // runs regardless of enabled state, and blocking here silently drops entries.

  const key = String(trigger || "").toLowerCase().replace(/\s+/g, " ").trim();
  const cleanResponse = String(response || "").trim();
  if (!key || !cleanResponse) return { error: "missing_fields" };
  const existing = listAutoResponders(guildId, { includeDisabled: true });
  if (existing.some(r => String(r.trigger || "").toLowerCase().replace(/\s+/g, " ").trim() === key)) {
    return { error: "duplicate_trigger", trigger: key };
  }
  if (existing.some(r => String(r.response || "").toLowerCase().trim() === cleanResponse.toLowerCase())) {
    return { error: "duplicate_response", trigger: existing.find(r => String(r.response || "").toLowerCase().trim() === cleanResponse.toLowerCase())?.trigger };
  }
  const mapKey = `${guildId}:${key}`;
  const data = {
    trigger: String(trigger || "").trim(),
    response: cleanResponse,
    reactions: [...new Set((reactions || []).map(e => String(e).trim()).filter(Boolean))],
    guildId: guildId,
    createdBy: userId,
    createdAt: Date.now(),
    usageCount: 0,
    matchMode: options.matchMode || "contains",
    replyMode: options.replyMode || "reply",
    cooldown: Math.max(0, Number(options.cooldown || 0)),
    caseSensitive: options.caseSensitive === true,
    enabled: true
  };

  // Persist to DB
  if (!guildData(guildId).globalAutoResponders) guildData(guildId).globalAutoResponders = {};
  if (!guildData(guildId).autoresponder) guildData(guildId).autoresponder = { enabled: true, triggers: {} };
  if (!guildData(guildId).autoresponder.triggers) guildData(guildId).autoresponder.triggers = {};
  guildData(guildId).globalAutoResponders[key] = data;
  guildData(guildId).autoresponder.triggers[key] = data;

  // Keep the legacy runtime Map hot for older handlers, but namespace keys so
  // identical triggers in different guilds do not overwrite each other.
  globalAutoResponders.set(mapKey, data);

  saveDB();
  return data;
}

function removeAutoResponder(guildId, trigger) {
  const key = String(trigger || "").toLowerCase().replace(/\s+/g, " ").trim();
  const g = guildData(guildId);
  const existed = Boolean(g.globalAutoResponders?.[key] || g.autoresponder?.triggers?.[key]);
  if (g.globalAutoResponders) delete g.globalAutoResponders[key];
  if (g.autoresponder?.triggers) delete g.autoresponder.triggers[key];
  globalAutoResponders.delete(`${guildId}:${key}`);
  globalAutoResponders.delete(key);
  if (existed) saveDB();
  return existed;
}

function clearAutoResponders(guildId) {
  const g = guildData(guildId);
  const keys = new Set([
    ...Object.keys(g.globalAutoResponders || {}),
    ...Object.keys(g.autoresponder?.triggers || {}),
  ]);
  const count = keys.size;
  g.globalAutoResponders = {};
  if (!g.autoresponder) g.autoresponder = { enabled: true, triggers: {} };
  g.autoresponder.triggers = {};
  for (const key of [...globalAutoResponders.keys()]) {
    if (key.startsWith(`${guildId}:`) || globalAutoResponders.get(key)?.guildId === guildId) {
      globalAutoResponders.delete(key);
    }
  }

  saveDB();
  return count;
}

function listAutoResponders(guildId, options = {}) {
  const g = guildData(guildId);
  const merged = { ...(g.globalAutoResponders || {}), ...(g.autoresponder?.triggers || {}) };
  return Object.entries(merged)
    .map(([trigger, data]) => ({ trigger: data?.trigger || trigger, ...data, guildId }))
    .filter(data => options.includeDisabled || data.enabled !== false);
}

function editAutoResponder(guildId, oldTrigger, newTrigger, newResponse, userId, options = {}) {
  const oldKey = String(oldTrigger || "").toLowerCase().replace(/\s+/g, " ").trim();
  const nextKey = String(newTrigger || oldTrigger || "").toLowerCase().replace(/\s+/g, " ").trim();
  const response = String(newResponse || "").trim();
  if (!oldKey || !nextKey || !response) return { error: "missing_fields" };
  const g = guildData(guildId);
  const current = g.autoresponder?.triggers?.[oldKey] || g.globalAutoResponders?.[oldKey];
  if (!current) return { error: "not_found" };
  const all = listAutoResponders(guildId, { includeDisabled: true });
  if (nextKey !== oldKey && all.some(r => String(r.trigger || "").toLowerCase().replace(/\s+/g, " ").trim() === nextKey)) {
    return { error: "duplicate_trigger", trigger: nextKey };
  }
  if (all.some(r => String(r.trigger || "").toLowerCase().replace(/\s+/g, " ").trim() !== oldKey && String(r.response || "").toLowerCase().trim() === response.toLowerCase())) {
    return { error: "duplicate_response" };
  }
  removeAutoResponder(guildId, oldKey);
  const updated = {
    ...current,
    trigger: String(newTrigger || oldTrigger).trim(),
    response,
    matchMode: options.matchMode || current.matchMode || "contains",
    replyMode: options.replyMode || current.replyMode || "reply",
    cooldown: options.cooldown === undefined ? (current.cooldown || 0) : Math.max(0, Number(options.cooldown || 0)),
    caseSensitive: options.caseSensitive === undefined ? current.caseSensitive === true : options.caseSensitive === true,
    updatedBy: userId,
    updatedAt: Date.now(),
  };
  if (!g.globalAutoResponders) g.globalAutoResponders = {};
  if (!g.autoresponder) g.autoresponder = { enabled: true, triggers: {} };
  if (!g.autoresponder.triggers) g.autoresponder.triggers = {};
  g.globalAutoResponders[nextKey] = updated;
  g.autoresponder.triggers[nextKey] = updated;
  globalAutoResponders.set(`${guildId}:${nextKey}`, updated);
  saveDB();
  return updated;
}

function isAutoResponderDirectMedia(url) {
  if (typeof url !== "string") return false;
  const clean = url.split("?")[0].toLowerCase();
  return /^https?:\/\//i.test(url) && /\.(png|jpe?g|gif|webp|avif)$/i.test(clean);
}

function isAutoResponderRichMediaLink(url) {
  if (typeof url !== "string") return false;
  return /^https?:\/\//i.test(url) && (
    isAutoResponderDirectMedia(url) ||
    /(?:tenor\.com|giphy\.com|media\.tenor\.com|c\.tenor\.com|imgur\.com|discordapp\.com|discord\.com\/channels|cdn\.discordapp\.com)/i.test(url)
  );
}

function buildAutoResponderReplyPayload(response, guildId = null) {
  const raw = String(response || "").trim();
  if (!raw) return null;

  return {
    content: raw.slice(0, 2000),
    allowedMentions: { repliedUser: false },
  };
}

/* ================= AUTO REACT FUNCTIONS ================= */

function addAutoReact(guildId, trigger, emojis, userId, options = {}) {
  const g = guildData(guildId);
  if (!g.autoreact) g.autoreact = { enabled: true, triggers: {} };
  const _gat = g.autoreact;

  const key = String(trigger || "").toLowerCase().replace(/\s+/g, " ").trim();
  const cleanEmojis = [...new Set((emojis || []).map(e => String(e).trim()).filter(Boolean))];
  if (!key || cleanEmojis.length === 0) return { error: "missing_fields" };
  if (!_gat.triggers) _gat.triggers = {};
  const existing = listAutoReacts(guildId, { includeDisabled: true });
  if (existing.some(r => String(r.trigger || "").toLowerCase().replace(/\s+/g, " ").trim() === key)) return { error: "duplicate_trigger", trigger: key };
  if (!g.autoReact) g.autoReact = {};
  if (!g.autoReact[guildId]) g.autoReact[guildId] = {};

  const data = {
    trigger: String(trigger || "").trim(),
    emojis: cleanEmojis,
    matchMode: options.matchMode || "contains",
    cooldown: Math.max(0, Number(options.cooldown || 0)),
    createdBy: userId,
    createdAt: Date.now(),
    enabled: true
  };

  g.autoReact[guildId][key] = data;
  _gat.triggers[key] = data;

  saveDB();
  return data;
}

function removeAutoReact(guildId, trigger) {
  const key = String(trigger || "").toLowerCase().replace(/\s+/g, " ").trim();
  const g = guildData(guildId);
  const existed = Boolean(g.autoReact?.[guildId]?.[key] || g.autoreact?.triggers?.[key]);
  if (g.autoReact?.[guildId]) delete g.autoReact[guildId][key];
  if (g.autoreact?.triggers) delete g.autoreact.triggers[key];
  if (existed) saveDB();
  return existed;
}

function clearAutoReacts(guildId) {
  const g = guildData(guildId);
  const keys = new Set([
    ...Object.keys(g.autoReact?.[guildId] || {}),
    ...Object.keys(g.autoreact?.triggers || {}),
  ]);
  const count = keys.size;
  if (!g.autoReact) g.autoReact = {};
  g.autoReact[guildId] = {};
  if (!g.autoreact) g.autoreact = { enabled: true, triggers: {} };
  g.autoreact.triggers = {};
  saveDB();
  return count;
}

function listAutoReacts(guildId, options = {}) {
  const g = guildData(guildId);
  const merged = { ...(g.autoReact?.[guildId] || {}), ...(g.autoreact?.triggers || {}) };
  return Object.entries(merged)
    .map(([trigger, data]) => ({ trigger: data?.trigger || trigger, ...data, guildId }))
    .filter(data => options.includeDisabled || data.enabled !== false);
}

function editAutoReact(guildId, oldTrigger, newTrigger, emojis, userId, options = {}) {
  const oldKey = String(oldTrigger || "").toLowerCase().replace(/\s+/g, " ").trim();
  const nextKey = String(newTrigger || oldTrigger || "").toLowerCase().replace(/\s+/g, " ").trim();
  const cleanEmojis = [...new Set((emojis || []).map(e => String(e).trim()).filter(Boolean))];
  if (!oldKey || !nextKey || cleanEmojis.length === 0) return { error: "missing_fields" };
  const g = guildData(guildId);
  const current = g.autoreact?.triggers?.[oldKey] || g.autoReact?.[guildId]?.[oldKey];
  if (!current) return { error: "not_found" };
  const all = listAutoReacts(guildId, { includeDisabled: true });
  if (nextKey !== oldKey && all.some(r => String(r.trigger || "").toLowerCase().replace(/\s+/g, " ").trim() === nextKey)) {
    return { error: "duplicate_trigger", trigger: nextKey };
  }
  removeAutoReact(guildId, oldKey);
  const updated = {
    ...current,
    trigger: String(newTrigger || oldTrigger).trim(),
    emojis: cleanEmojis,
    matchMode: options.matchMode || current.matchMode || "contains",
    cooldown: options.cooldown === undefined ? (current.cooldown || 0) : Math.max(0, Number(options.cooldown || 0)),
    updatedBy: userId,
    updatedAt: Date.now(),
  };
  if (!g.autoReact) g.autoReact = {};
  if (!g.autoReact[guildId]) g.autoReact[guildId] = {};
  if (!g.autoreact) g.autoreact = { enabled: true, triggers: {} };
  if (!g.autoreact.triggers) g.autoreact.triggers = {};
  g.autoReact[guildId][nextKey] = updated;
  g.autoreact.triggers[nextKey] = updated;
  saveDB();
  return updated;
}

function formatAutoConfigPreview(items, type) {
  const ARR = getEmoji("arrow");
  if (!items.length) return `${ARR} *No triggers configured yet.*`;
  return items.slice(0, 8).map((item, index) => {
    const trigger = String(item.trigger || "").slice(0, 48);
    const status = item.enabled === false ? "Off" : "On";
    if (type === "react") return `${ARR} \`${index + 1}.\` \`${trigger}\` -> ${(item.emojis || []).join(" ")} (${status})`;
    return `${ARR} \`${index + 1}.\` \`${trigger}\` -> ${String(item.response || "").slice(0, 56)}${String(item.response || "").length > 56 ? "..." : ""} (${status})`;
  }).join("\n");
}

function buildProtectionNavigation(userId, active) {
  return new ActionRowBuilder().addComponents(
    ...[["automod", "AutoMod"], ["antinuke", "AntiNuke"]].map(([key, label]) =>
      new ButtonBuilder().setCustomId(`protection_nav_${key}_${userId}`)
        .setLabel(label).setStyle(ButtonStyle.Secondary).setDisabled(active === key))
  );
}

function buildAntiRaidConfigPanel(guildId, user) {
  return buildAntiNukeConfigContainer(guildId, `${user.id}_${Date.now()}`, user);
}

function securityConfigFeatureList() {
  return [
    { id: "antiphishing", key: "antiPhishing", label: "Anti-Phishing", description: "Unsafe link and scam detection" },
    { id: "anticaps", key: "antiCaps", label: "Anti-Caps", description: "Block excessive uppercase spam" },
    { id: "antizalgo", key: "antiZalgo", label: "Anti-Zalgo", description: "Block corrupted stacking text" },
    { id: "antiduplicate", key: "antiDuplicate", label: "Anti-Duplicate", description: "Block repeated identical messages" },
    { id: "antieveryone", key: "antiEveryoneBP", label: "Anti-Everyone Bypass", description: "Block hidden @everyone tricks" },
    { id: "webhookguard", key: "webhookGuard", label: "Webhook Guard", description: "Alert on webhook create, update, or delete" },
  ];
}

function getSecurityConfigState(guildId) {
  const sec = typeof soezySecurity?.getSecurity === "function"
    ? soezySecurity.getSecurity(guildId)
    : ((guildData(guildId).security ||= {}));
  for (const key of ["joinCaptcha", "noAvatarGate", "slowmodeManager", "slowmodeThresh", "slowmodeSeconds", "ghostPingDetect"]) delete sec[key];
  delete guildData(guildId).ghostPingLog;
  if (!sec.inviteWhitelist) sec.inviteWhitelist = [];
  if (!sec.channelMaxLength) sec.channelMaxLength = {};
  if (!sec.logChannels) sec.logChannels = {};
  if (sec.antiPhishing === undefined) sec.antiPhishing = false;
  if (sec.antiCaps === undefined) sec.antiCaps = false;
  if (sec.antiCapsThresh === undefined) sec.antiCapsThresh = 70;
  if (sec.antiCapsMinLen === undefined) sec.antiCapsMinLen = 8;
  if (sec.antiZalgo === undefined) sec.antiZalgo = false;
  if (sec.antiDuplicate === undefined) sec.antiDuplicate = false;
  if (sec.antiEveryoneBP === undefined) sec.antiEveryoneBP = false;
  if (sec.accountAgeDays === undefined) sec.accountAgeDays = 0;
  if (sec.webhookGuard === undefined) sec.webhookGuard = false;
  return sec;
}

function securityConfigMasterEnabled(guildId, sec = null) {
  const state = sec || getSecurityConfigState(guildId);
  const featureOn = typeof getFeatureState === "function" ? getFeatureState(guildId, "security") : state.enabled !== false;
  return state.enabled !== false && featureOn !== false;
}

function setSecurityConfigMasterState(guildId, enabled, client = null, reason = "security_config") {
  const sec = getSecurityConfigState(guildId);
  sec.enabled = enabled === true;
  if (typeof setFeatureState === "function") {
    setFeatureState(guildId, "automod", sec.enabled, { client, linked: false, refreshPanels: false });
  } else if (typeof toggleSystem === "function") {
    toggleSystem("security", sec.enabled, guildId);
  } else {
    const gd = guildData(guildId);
    gd.features ||= {};
    gd.features.automod = sec.enabled;
    gd.features.security = sec.enabled;
    gd.automod ||= {};
    gd.automod.systemEnabled = gd.automod.enabled = sec.enabled;
    db.guildSystems ||= {};
    db.guildSystems[guildId] ||= {};
    db.guildSystems[guildId].automod = sec.enabled;
    db.guildSystems[guildId].security = sec.enabled;
  }
  if (typeof saveDB === "function") saveDB();
  if (typeof refreshGuildConfig === "function") refreshGuildConfig(guildId, reason);
  return sec;
}

function setSecurityConfigAllFeatures(guildId, enabled, client = null, reason = "security_config_all") {
  return setSecurityConfigMasterState(guildId, enabled, client, reason);
}

function syncSecurityConfigMasterFromFeatures(guildId, client = null, reason = "security_config_feature") {
  const sec = getSecurityConfigState(guildId);
  const enabled = guildData(guildId).automod?.enabled === true;
  return setSecurityConfigMasterState(guildId, enabled, client, reason);
}

function buildSecurityLoadingContainer(text) {
  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`> **${getEmoji("arrow")} ${text}**`));
}

function buildSecurityProtectionMenu(guildId, sessionId) {
  const sec = getSecurityConfigState(guildId);
  const features = securityConfigFeatureList().filter(feature => !["anticaps", "antiduplicate"].includes(feature.id));
  const options = [
    ...features.map(feature => ({
      label: `${sec[feature.key] === true ? "Disable" : "Enable"} ${feature.label}`,
      description: feature.description,
      value: `secfg_feature_${feature.id}_${sessionId}`,
    })),
    { label: "Set Anti-Caps", description: "Threshold percent and minimum length", value: `secfg_setcaps_${sessionId}` },
    { label: "Set Max Length", description: "Per-channel message length limit", value: `secfg_setmaxlen_${sessionId}` },
    { label: "Set Account Age", description: "Minimum account age in days", value: `secfg_setaccountage_${sessionId}` },
    { label: "Set Security Logs", description: "Channel for security alerts", value: `secfg_setlogsecurity_${sessionId}` },
    { label: "Set Forensics Logs", description: "Channel for ban-wave snapshots", value: `secfg_setlogforensics_${sessionId}` },
    { label: "Whitelist Invite", description: "Add a trusted invite domain", value: `secfg_whitelistadd_${sessionId}` },
    { label: "Remove Whitelist", description: "Remove a trusted invite domain", value: `secfg_whitelistremove_${sessionId}` },
    { label: "View Whitelist", description: "Show trusted invite domains", value: `secfg_whitelistlist_${sessionId}` },
    { label: "Whitelist Role", description: "Open role selector for bypass roles", value: `secfg_wlrole_${sessionId}` },
    { label: "Whitelist User", description: "Open user selector for bypass users", value: `secfg_wluser_${sessionId}` },
    { label: "Whitelist Channel", description: "Open channel selector for bypass channels", value: `secfg_wlchannel_${sessionId}` },
    { label: "Remove Whitelist Role", description: "Remove a configured bypass role", value: `secfg_rmwlrole_${sessionId}` },
    { label: "Remove Whitelist User", description: "Remove a configured bypass user", value: `secfg_rmwluser_${sessionId}` },
    { label: "Remove Whitelist Channel", description: "Remove a configured bypass channel", value: `secfg_rmwlchannel_${sessionId}` },
  ];

  return new StringSelectMenuBuilder()
    .setCustomId(`secfg_select_${sessionId}`)
    .setPlaceholder("Protection settings...")
    .setDisabled(!guildData(guildId).automod?.enabled)
    .addOptions(options.filter(option => option.value !== `secfg_setcaps_${sessionId}`));
}

function buildSecurityConfigPanel(guildId, sessionId, user, prefix = getPrefix(guildId)) {
  return buildAutomodConfigContainer(guildId, sessionId, user);
}

function buildAutoResponderConfigPanel(guildId, sessionId, user, prefix = getPrefix(guildId)) {
  if (!guildData(guildId).autoresponder) guildData(guildId).autoresponder = { enabled: true, triggers: {} };
  const ar = guildData(guildId).autoresponder;
  const responders = listAutoResponders(guildId, { includeDisabled: true });
  const enabledCount = responders.filter(r => r.enabled !== false).length;
  const ARR = getEmoji("arrow");
  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`arespcfg_select_${sessionId}`)
    .setPlaceholder("Select an autoresponder action...")
    .addOptions([
      { label: "Add Trigger", description: "Create a trigger and reply", value: `arespcfg_add_${sessionId}` },
      { label: "Edit Trigger", description: "Rename a trigger or update its reply", value: `arespcfg_edit_${sessionId}` },
      { label: "Remove Trigger", description: "Delete one trigger", value: `arespcfg_remove_${sessionId}` },
      { label: "View Trigger List", description: "Show all configured replies", value: `arespcfg_list_${sessionId}` },
      { label: "Clear All", description: "Remove every autoresponder trigger", value: `arespcfg_clear_${sessionId}` },
    ]);
  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.thinking} Autoresponder Configuration`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(
      `${ARR} **Status:** <:tick:1559236522711187577> Enabled\n` +
      `${ARR} **Triggers:** \`${responders.length}\` total, \`${enabledCount}\` active\n\n` +
      `**Preview:**\n${formatAutoConfigPreview(responders, "reply")}`
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(dropdown))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t => t.setContent(`-# ${prefix}autoresponder add trigger | response • Requested by ${user?.username || "admin"}`));
}

function buildAutoReactConfigPanel(guildId, sessionId, user, prefix = getPrefix(guildId)) {
  if (!guildData(guildId).autoreact) guildData(guildId).autoreact = { enabled: true, triggers: {} };
  const ar = guildData(guildId).autoreact;
  const reacts = listAutoReacts(guildId, { includeDisabled: true });
  const enabledCount = reacts.filter(r => r.enabled !== false).length;
  const ARR = getEmoji("arrow");
  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`arxcfg_select_${sessionId}`)
    .setPlaceholder("Select an autoreact action...")
    .addOptions([
      { label: "Add Reaction Trigger", description: "Create a trigger and emoji set", value: `arxcfg_add_${sessionId}` },
      { label: "Edit Trigger", description: "Rename a trigger or update emojis", value: `arxcfg_edit_${sessionId}` },
      { label: "Remove Trigger", description: "Delete one reaction trigger", value: `arxcfg_remove_${sessionId}` },
      { label: "View All Triggers", description: "Show all configured reactions", value: `arxcfg_list_${sessionId}` },
      { label: "Clear All", description: "Remove every autoreact trigger", value: `arxcfg_clear_${sessionId}` },
    ]);
  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.thinking} Autoreact Configuration`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(
      `${ARR} **Status:** <:tick:1559236522711187577> Enabled\n` +
      `${ARR} **Triggers:** \`${reacts.length}\` total, \`${enabledCount}\` active\n\n` +
      `**Preview:**\n${formatAutoConfigPreview(reacts, "react")}`
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(dropdown))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t => t.setContent(`-# ${prefix}autoreact add trigger emoji • Requested by ${user?.username || "admin"}`));
}
