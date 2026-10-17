function buildAntiNukeEventsMessage(guildId) {
  const events = guildData(guildId).antinuke.events || {};

  // ANTINUKE_EVENTS may not be populated yet (loaded after database.js) -
  // resolve it safely at call-time from globalThis as a fallback.
  const eventList = (typeof ANTINUKE_EVENTS !== "undefined" && Array.isArray(ANTINUKE_EVENTS) && ANTINUKE_EVENTS.length > 0)
    ? ANTINUKE_EVENTS
    : (globalThis.ANTINUKE_EVENTS || []);

  // If no events are defined at all, return a plain error payload instead of
  // crashing Discord.js with setMaxValues(0).
  if (eventList.length === 0) {
    return {
      content: "\u26a0\ufe0f Anti-Nuke event list is not loaded yet. Please try again in a moment.",
      components: []
    };
  }

  const lines = eventList.map(e => {
    const on = events[e.id] !== false; // default enabled
    return `${on ? "<:tick:1559236522711187577>" : "<:scross:1559257945030525110>"} **${e.label}**`;
  }).join("\n");

  const options = eventList.map(e => {
    const on = events[e.id] !== false;
    return {
      label: e.label,
      value: e.id,
      emoji: on ? { id: "1559133152927293501", name: "enable" } : { id: "1559133148384596028", name: "disable" }
    };
  });

  // Discord clamps: maxValues must be 1-25 and >= minValues.
  const safeMax = Math.min(25, Math.max(1, options.length));

  return {
    content: `**Select the events you want to enable for antinuke measures:**\n${lines}`,
    components: [
      new ActionRowBuilder().addComponents(
        (typeof createSafeSelectMenu === "function"
          ? createSafeSelectMenu({
              customId: "antinuke_event_select",
              placeholder: "Select events to toggle...",
              minValues: 1,
              maxValues: safeMax,
              options,
            })
          : new StringSelectMenuBuilder()
              .setCustomId("antinuke_event_select")
              .setPlaceholder("Select events to toggle...")
              .setMinValues(1)
              .setMaxValues(safeMax)
              .addOptions(options))
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("antinuke_enable_all")
          .setLabel("Enable All")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("antinuke_disable_all")
          .setLabel("Disable All")
          .setStyle(ButtonStyle.Danger)
      )
    ]
  };
}

// ============ TICKET CONFIG PANEL ============
function buildTicketConfigPanel(guild, guildId, sessionId, user) {
  const t = guildData(guildId).ticket || {};
  const ARROW = "<a:zyarrow:1487457493549453339>";
  const EXCL  = "";

  const allSupportRoles = [
    ...(t.supportRoles || []),
    ...(t.supportRole && !(t.supportRoles || []).includes(t.supportRole) ? [t.supportRole] : [])
  ];
  const staffRole    = allSupportRoles.length
    ? allSupportRoles.map(r => `<@&${r}>`).join(", ")
    : "`Not set`";
  const category     = t.category          ? `<#${t.category}>`           : "`Not set`";
  const panelChannel = t.channel           ? `<#${t.channel}>`            : "`Not set`";
  const transcriptCh = t.transcriptChannel ? `<#${t.transcriptChannel}>` : "`Not set`";
  const logChannel   = t.logs              ? `<#${t.logs}>`               : "`Not set`";
  const maxTickets   = t.maxTickets ?? 5;
  const buttonLabel  = t.buttonLabel || "Create Ticket";
  const autoClose    = t.autoClose         ? `${EMOJI_ENABLE} Enabled`    : `${EMOJI_DISABLE} Disabled`;
  const dmOnClose    = t.dmOnClose !== false ? `${EMOJI_ENABLE} Enabled`  : `${EMOJI_DISABLE} Disabled`;

  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`tkcfg_select_${sessionId}`)
    .setPlaceholder("> Select an option to configure...")
    .addOptions([
      { label: "Staff Role",         description: "Set the support staff role",            value: `tkcfg_staffrole_${sessionId}`,      },
      { label: "Add Staff Role",     description: "Add another staff role (Premium)",       value: `tkcfg_addstaffrole_${sessionId}`,   },
      { label: "Remove Staff Role",  description: "Remove a staff role (Premium)",          value: `tkcfg_rmstaffrole_${sessionId}`,    },
      { label: "Panel Channel",      description: "Set the ticket panel channel",          value: `tkcfg_panchannel_${sessionId}`,  },
      { label: "Category",           description: "Set the ticket category",               value: `tkcfg_category_${sessionId}`,    },
      { label: "Transcript Channel", description: "Set where transcripts are sent",        value: `tkcfg_transcript_${sessionId}`,  },
      { label: "Log Channel",        description: "Set the ticket log channel",            value: `tkcfg_logchannel_${sessionId}`,  },
      { label: "Customize Panel",    description: "Edit the ticket panel embed",           value: `tkcfg_custpanel_${sessionId}`,   },
      { label: "Button Name",         description: "Change the Create Ticket button label",  value: `tkcfg_btnname_${sessionId}`,     },
      { label: "Advanced Settings",  description: "Max tickets, auto-close, DM on close", value: `tkcfg_advanced_${sessionId}`,    },
      { label: "Deploy Panel",       description: "Send the ticket panel to the channel",  value: `tkcfg_deploy_${sessionId}`,     },
    ]);

  const dropdownRow = new ActionRowBuilder().addComponents(dropdown);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text =>
          text.setContent(`## ${EMOJIS.thinking} Ticket System Configuration`)
        )
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(text =>
      text.setContent(
        `${ARROW} **Staff Role:** ${staffRole}${EXCL}\n` +
        `${ARROW} **Panel Channel:** ${panelChannel}${EXCL}\n` +
        `${ARROW} **Category:** ${category}${EXCL}\n` +
        `${ARROW} **Transcript Channel:** ${transcriptCh}${EXCL}\n` +
        `${ARROW} **Log Channel:** ${logChannel}${EXCL}\n` +
        `${ARROW} **Button Name:** \`${buttonLabel}\`${EXCL}\n` +
        `${ARROW} **Max Tickets:** \`${maxTickets}\`${EXCL}\n` +
        `${ARROW} **Auto-Close:** ${autoClose}${EXCL}\n` +
        `${ARROW} **DM on Close:** ${dmOnClose}${EXCL}`
      )
    )
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(dropdownRow)
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(text =>
      text.setContent(`-# Requested by ${user?.username ?? 'Unknown'}`)
    );

  return { container, components: [] };
}

// ============ WELCOME CONFIG PANEL ============
const configEditorPairs = globalThis.__soezyConfigEditorPairs || (globalThis.__soezyConfigEditorPairs = new Map());
async function sendConfigPreview(channel, panel) {
  return channel.send({
    ...(panel.previewContent ? { content: panel.previewContent, allowedMentions: { parse: [], users: [...String(panel.previewContent).matchAll(/<@!?(\d+)>/g)].map(m => m[1]) } } : {}),
    ...(panel.previewEmbed ? { embeds: [panel.previewEmbed] } : {}),
  });
}
async function replyWithConfigEditor(interaction, panel) {
  const preview = await interaction.reply({
    ...(panel.previewContent ? { content: panel.previewContent, allowedMentions: { parse: [], users: [...String(panel.previewContent).matchAll(/<@!?(\d+)>/g)].map(m => m[1]) } } : {}),
    ...(panel.previewEmbed ? { embeds: [panel.previewEmbed] } : {}),
    fetchReply: true,
  });
  const controls = await interaction.followUp({ components: [panel.container], flags: MessageFlags.IsComponentsV2, fetchReply: true });
  registerConfigEditorPair(controls, preview);
  return controls;
}
function registerConfigEditorPair(controls, preview) {
  if (controls?.id && preview?.id) configEditorPairs.set(controls.id, preview);
}
async function refreshConfigEditorPreview(interaction, panel) {
  const payload = {
    content: panel.previewContent || null,
    embeds: panel.previewEmbed ? [panel.previewEmbed] : [],
    allowedMentions: { parse: [], users: [...String(panel.previewContent || "").matchAll(/<@!?(\d+)>/g)].map(m => m[1]) },
  };
  const controlId = interaction.message?.id;
  let preview = configEditorPairs.get(controlId);
  if (preview) await preview.edit(payload).catch(() => {});
  else if (interaction.channel) {
    preview = await interaction.channel.send(payload).catch(() => null);
    if (preview) configEditorPairs.set(controlId, preview);
  }
}
async function replaceSetupWithConfigEditor(interaction, panel) {
  await interaction.deferUpdate();
  await interaction.message?.delete().catch(() => {});
  const preview = await sendConfigPreview(interaction.channel, panel);
  const controls = await interaction.channel.send({ components: [panel.container], flags: MessageFlags.IsComponentsV2 });
  registerConfigEditorPair(controls, preview);
  return controls;
}
Object.assign(globalThis, { sendConfigPreview, replyWithConfigEditor, registerConfigEditorPair, refreshConfigEditorPreview, replaceSetupWithConfigEditor });

function formatWelcomeVariables(text, guild, user, member = null) {
  const avatar = member?.displayAvatarURL?.({ size: 256 }) || user?.displayAvatarURL?.({ size: 256 }) || "https://cdn.discordapp.com/embed/avatars/0.png";
  const values = {
    user: user?.id ? `<@${user.id}>` : "@Username", ping: user?.id ? `<@${user.id}>` : "@Username",
    "user.mention": user?.id ? `<@${user.id}>` : "@Username",
    username: user?.username || "Username", "user.name": user?.username || "Username",
    tag: user?.tag || user?.username || "Username", userid: user?.id || "",
    server: guild?.name || "YourServer", "guild.name": guild?.name || "YourServer",
    membercount: String(guild?.memberCount ?? 100), "guild.member_count": String(guild?.memberCount ?? 100),
    user_avatar: avatar, "user.avatar": avatar,
    "user.banner": user?.bannerURL?.({ size: 1024 }) || "",
    server_icon: guild?.iconURL?.() || "", server_avatar: guild?.iconURL?.() || "",
    bot_avatar: guild?.client?.user?.displayAvatarURL?.({ size: 256 }) || "",
    joined_date: member?.joinedAt?.toISOString().slice(0, 10) || "",
  };
  return String(text || "").replace(/\{([^{}]+)\}/g, (match, key) => values[key] ?? match);
}

function buildWelcomeConfigPanel(guild, guildId, sessionId, user) {
  const w = guildData(guildId).welcome || {};
  const enabled = typeof getFeatureState === "function" ? getFeatureState(guildId, "welcome") : w.enabled === true;
  const _fill = txt => formatWelcomeVariables(txt, guild, user, guild?.members?.cache?.get(user?.id));
  // Discord requires content even for an empty draft preview.
  let preview;
  if (w.embedEnabled !== false) {
    const embed = new EmbedBuilder().setColor(w.color ?? 0x808080)
      .setDescription(_fill(w.message) || "\u200b");
    const imageURL = value => /^https?:\/\//i.test(_fill(value)) ? _fill(value) : undefined;
    if (w.footer || imageURL(w.footerIcon)) embed.setFooter({ text: _fill(w.footer) || "\u200b", iconURL: imageURL(w.footerIcon) });
    if (w.authorText || imageURL(w.authorIcon)) embed.setAuthor({ name: _fill(w.authorText) || "\u200b", iconURL: imageURL(w.authorIcon) });
    if (imageURL(w.image)) embed.setImage(imageURL(w.image));
    if (imageURL(w.thumbnail)) embed.setThumbnail(imageURL(w.thumbnail));
    preview = embed;
  } else {
    preview = new TextDisplayBuilder().setContent(_fill(w.message) || "\u200b");
  }

  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`wlcfg_select_${sessionId}`)
    .setPlaceholder("Choose an option to configure Welcome")
    .addOptions([
      { label: enabled ? "Disable Welcome" : "Enable Welcome",  description: enabled ? "Turn off welcome messages" : "Turn on welcome messages",  value: `wlcfg_toggle_${sessionId}`    },
      { label: "Set Channel",        description: "Set the welcome message channel",                    value: `wlcfg_channel_${sessionId}`    },
      { label: "Set Message",        description: "Edit the embed title & description text",            value: `wlcfg_message_${sessionId}`    },
      { label: "Toggle Embed",       description: "Enable or disable the embed welcome style",          value: `wlcfg_welcome_${sessionId}`    },
      { label: "Color",              description: "Edit the embed accent color",                        value: `wlcfg_color_${sessionId}`      },
      { label: "Image & Thumbnail",  description: "Set banner image & thumbnail (clear to remove)",    value: `wlcfg_imagethumb_${sessionId}` },
      { label: "Footer & Icon",      description: "Edit footer text and icon URL",                      value: `wlcfg_footer_${sessionId}`     },
      { label: "Author & Icon",      description: "Edit author name and icon URL",                      value: `wlcfg_author_${sessionId}`     },
    ]);

  const dropdownRow = new ActionRowBuilder().addComponents(dropdown);

  const container = new ContainerBuilder()
    .addActionRowComponents(dropdownRow)
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wlsetup:save:${sessionId.replaceAll("_", ":")}`).setLabel("Save & Enable").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wlsetup:delay:${sessionId.replaceAll("_", ":")}`).setLabel("Auto Delete Delay").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`wlsetup:variables:${sessionId.replaceAll("_", ":")}`).setLabel("View Variables").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`wlsetup:cancel:${sessionId.replaceAll("_", ":")}`).setLabel("Cancel").setStyle(ButtonStyle.Danger)
    ));

  const previewContent = w.embedEnabled !== false ? _fill(w.title || "Welcome {user}!") : _fill(w.message || "Welcome {user} to {server}!");
  return { container, components: [container], previewContent, previewEmbed: w.embedEnabled !== false ? preview : null };
}

function buildWelcomeSetupPanel(guild, guildId, user, sessionId, selectedChannel = null, view = "setup") {
  const currentChannel = selectedChannel || guildData(guildId).welcome?.channel || null;
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.thinking} Welcomer Configuration System`))
    .addTextDisplayComponents(t => t.setContent(
      "```Configure greeting welcome messages for new members.```\n\n" +
      `${EMOJIS.welcome_arrow} **Select a destination channel** below.\n` +
      `${EMOJIS.welcome_arrow} **Choose a message style** or **browse templates** to customize.`
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true));
  if (view === "templates") {
    const templates = new StringSelectMenuBuilder()
      .setCustomId(`wlsetup:template:${sessionId}`)
      .setPlaceholder("Choose a welcome template")
      .addOptions([
        { label: "Friendly", description: "A simple friendly greeting", value: "friendly" },
        { label: "Member Milestone", description: "Include the member count", value: "milestone" },
        { label: "Community Welcome", description: "A warm server introduction", value: "community" },
      ]);
    container.addTextDisplayComponents(t => t.setContent(`${currentChannel ? `**Destination:** <#${currentChannel}>` : "**Destination:** `Select a channel first`"}\nChoose a starting template:`))
      .addActionRowComponents(new ActionRowBuilder().addComponents(templates))
      .addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`wlsetup:back:${sessionId}`).setLabel("Back").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`wlsetup:cancel:${sessionId}`).setLabel("Cancel").setStyle(ButtonStyle.Danger)
      ));
  } else {
    if (currentChannel) container.addTextDisplayComponents(t => t.setContent(`**Destination:** <#${currentChannel}>`));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`wlsetup:channel:${sessionId}`)
        .setPlaceholder(currentChannel ? "Choose a different destination channel" : "Select a destination channel")
        .setChannelTypes(ChannelType.GuildText)
    ));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wlsetup:style:normal:${sessionId}`).setLabel("Normal").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wlsetup:style:embed:${sessionId}`).setLabel("Embed").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`wlsetup:browse:${sessionId}`).setLabel("Template").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`wlsetup:cancel:${sessionId}`).setLabel("Cancel").setStyle(ButtonStyle.Danger)
    ));
  }
  container.addTextDisplayComponents(t => t.setContent(`-# Requested by ${user?.username ?? "Unknown"}`));
  return container;
}

function welcomeSetupVariablesContainer(sessionId, user) {
  return new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(
      `## ${EMOJIS.welcome_ping} Welcome Variables\n` +
      "`{user}` / `{ping}` - Mention the new member\n" +
      "`{user.name}` / `{username}` - Member username\n" +
      "`{guild.name}` / `{server}` - Server name\n" +
      "`{guild.member_count}` / `{membercount}` - Total member count\n" +
      "`{user.avatar}` / `{user_avatar}` - Member avatar URL\n" +
      "`{user.banner}` - Member banner URL\n" +
      "`{joined_date}` - Date the member joined"
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`wlsetup:back-editor:${sessionId}`).setLabel("Back to editor").setStyle(ButtonStyle.Secondary)
    ))
    .addTextDisplayComponents(t => t.setContent(`-# Requested by ${user?.username ?? "Unknown"}`));
}

async function handleWelcomeSetupInteraction(interaction) {
  if (!interaction.customId?.startsWith("wlsetup:")) return false;
  const parts = interaction.customId.split(":"), action = parts[1];
  const userId = parts.at(-2), stamp = Number(parts.at(-1));
  if (!interaction.guild || !isAuthorizedInteraction(interaction)) {
    await safeReply(interaction, { components: [createErrorContainer("Access Denied", "Only authorized administrators can configure welcome messages.")], flags: MessageFlags.IsComponentsV2 | 64 });
    return true;
  }
  if (userId !== interaction.user.id || !Number.isFinite(stamp) || Date.now() - stamp > 900000) {
    await safeReply(interaction, { components: [createErrorContainer("Setup Expired", "Open welcome config again to start a fresh setup.")], flags: MessageFlags.IsComponentsV2 | 64 });
    return true;
  }
  const sessionId = `${userId}:${stamp}`;
  const gId = interaction.guildId;
  const w = guildData(gId).welcome ||= {};
  try {
    if (action === "channel") {
      const channelId = interaction.values?.[0];
      const channel = interaction.guild.channels.cache.get(channelId);
      if (!channel || channel.type !== ChannelType.GuildText) throw new Error("Choose a text channel from this server.");
      w.channel = channelId;
      guildData(gId).greet ||= {};
      guildData(gId).greet.channel = channelId;
      saveDB();
      await interaction.update({ components: [buildWelcomeSetupPanel(interaction.guild, gId, interaction.user, sessionId, channelId)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }
    if (action === "browse") {
      await interaction.update({ components: [buildWelcomeSetupPanel(interaction.guild, gId, interaction.user, sessionId, w.channel, "templates")], flags: MessageFlags.IsComponentsV2 });
      return true;
    }
    if (action === "template") {
      const presets = {
        friendly: { title: "Welcome, {username}!", message: "Welcome {user} to {server}! We're glad you're here." },
        milestone: { title: "Welcome to {server}!", message: "Welcome {user}! You're member #{membercount}." },
        community: { title: "A new face in {server}!", message: "Please give {user} a warm welcome. Make yourself at home!" },
      };
      const preset = presets[interaction.values?.[0]];
      if (!preset) throw new Error("That welcome template is not available.");
      Object.assign(w, preset, { embedEnabled: true });
      saveDB();
      const editorId = `${userId}_${stamp}`;
      const panel = buildWelcomeConfigPanel(interaction.guild, gId, editorId, interaction.user);
      await replaceSetupWithConfigEditor(interaction, panel);
      return true;
    }
    if (action === "back") {
      await interaction.update({ components: [buildWelcomeSetupPanel(interaction.guild, gId, interaction.user, sessionId, w.channel)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }
    if (action === "style") {
      w.embedEnabled = parts[2] === "embed";
      saveDB();
      const editorId = `${userId}_${stamp}`;
      const panel = buildWelcomeConfigPanel(interaction.guild, gId, editorId, interaction.user);
      await replaceSetupWithConfigEditor(interaction, panel);
      return true;
    }
    if (action === "delay") {
      const modal = new ModalBuilder()
        .setCustomId(`wlsetup:delay-submit:${userId}:${stamp}`)
        .setTitle("Welcome Auto Delete Delay")
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("delay")
            .setLabel("Duration (e.g. 30s, 5m) or off")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("off disables automatic deletion")
            .setValue(w.deleteDelayMs ? formatDuration(w.deleteDelayMs) : "off")
            .setRequired(true)
            .setMaxLength(20)
        ));
      await interaction.showModal(modal);
      return true;
    }
    if (action === "delay-submit") {
      await interaction.deferReply({ flags: 64 });
      const raw = interaction.fields.getTextInputValue("delay").trim().toLowerCase();
      let delayMs = 0;
      if (!["off", "0", "none", "disable", "disabled"].includes(raw)) {
        delayMs = parseDuration(raw);
        if (!Number.isFinite(delayMs) || delayMs <= 0 || delayMs > 2147000000) {
          return interaction.editReply({ components: [createErrorContainer("Invalid Delay", "Use `off` or a duration up to `24d` (for example `30s` or `5m`).")], flags: MessageFlags.IsComponentsV2 });
        }
      }
      w.deleteDelayMs = delayMs;
      saveDB();
      const panel = buildWelcomeConfigPanel(interaction.guild, gId, `${userId}_${stamp}`, interaction.user);
      const { components } = panel;
      await refreshConfigEditorPreview(interaction, panel);
      await interaction.message?.edit({ components, flags: MessageFlags.IsComponentsV2 }).catch(() => {});
      await interaction.editReply({ components: [createSuccessContainer("Auto Delete Delay Updated", delayMs ? `Welcome messages will be deleted after \`${formatDuration(delayMs)}\`.` : "Automatic deletion is off.")], flags: MessageFlags.IsComponentsV2 });
      return true;
    }
    if (action === "save") {
      await interaction.deferUpdate();
      if (typeof setFeatureState === "function") setFeatureState(gId, "welcome", true, { client: interaction.client });
      else { w.enabled = true; toggleSystem("welcome", true, gId); saveDB(); }
      if (typeof syncFeatureState === "function") await syncFeatureState(gId, "welcome", { client: interaction.client, refreshPanels: false, reason: "welcome_setup_save" });
      await interaction.editReply({ components: [createSuccessContainer("Welcome Enabled", w.channel ? `Now Welcome is enabled in <#${w.channel}>.` : "Now Welcome is enabled. Set a destination channel when you're ready to send messages.")], flags: MessageFlags.IsComponentsV2 });
      return true;
    }
    if (action === "variables") {
      await interaction.update({ components: [welcomeSetupVariablesContainer(sessionId, interaction.user)], flags: MessageFlags.IsComponentsV2 });
      return true;
    }
    if (action === "back-editor") {
      const panel = buildWelcomeConfigPanel(interaction.guild, gId, `${userId}_${stamp}`, interaction.user);
      const { components } = panel;
      await refreshConfigEditorPreview(interaction, panel);
      await interaction.update({ components, flags: MessageFlags.IsComponentsV2 });
      return true;
    }
    if (action === "cancel") {
      await interaction.update({ components: [createInfoContainer("Welcome Setup Closed", "Setup was closed. Any selections already made remain saved.")], flags: MessageFlags.IsComponentsV2 });
      return true;
    }
  } catch (error) {
    const response = { components: [createErrorContainer("Welcome Setup", error.message || "Something went wrong. Please try again.")], flags: MessageFlags.IsComponentsV2 | 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(response);
    else await interaction.reply(response);
    return true;
  }
  return false;
}
globalThis.soezyWelcomeSetup = { interaction: handleWelcomeSetupInteraction };

function buildMessageFeatureSetupPanel(guild, user, sessionId, feature) {
  const names = { goodbye: "Goodbye", boost: "Boost", joindm: "Join DM" };
  const title = names[feature];
  const state = guildData(guild.id)[feature === "joindm" ? "joinDm" : feature] || {};
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.thinking} ${title} Configuration System`))
    .addTextDisplayComponents(t => t.setContent(
      `\`\`\`Configure ${feature === "goodbye" ? "farewell messages for members who leave" : feature === "boost" ? "messages for new server boosts" : "welcome direct messages for new members"}.\`\`\`\n\n` +
      `${EMOJIS.welcome_arrow} **${feature === "joindm" ? "Choose a message style" : "Select a destination channel"}** below.\n` +
      `${EMOJIS.welcome_arrow} **Choose a message style** or **browse templates** to customize.`
    ));
  if (feature !== "joindm") {
    if (state.channel) container.addTextDisplayComponents(t => t.setContent(`**Destination:** <#${state.channel}>`));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder().setCustomId(`msgsetup:channel:${feature}:${sessionId}`)
        .setPlaceholder(state.channel ? "Choose a different destination channel" : "Select a destination channel")
        .setChannelTypes(ChannelType.GuildText)
    ));
  } else {
    container.addTextDisplayComponents(t => t.setContent("**Destination:** New members' direct messages"));
  }
  container.addActionRowComponents(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`msgsetup:style:${feature}:normal:${sessionId}`).setLabel("Normal").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`msgsetup:style:${feature}:embed:${sessionId}`).setLabel("Embed").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`msgsetup:template:${feature}:${sessionId}`).setLabel("Template").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`msgsetup:cancel:${feature}:${sessionId}`).setLabel("Cancel").setStyle(ButtonStyle.Danger)
  ));
  container.addTextDisplayComponents(t => t.setContent(`-# Requested by ${user?.username || "Unknown"}`));
  return container;
}

async function handleMessageFeatureSetupInteraction(interaction) {
  if (!interaction.customId?.startsWith("msgsetup:")) return false;
  const parts = interaction.customId.split(":"), action = parts[1], feature = parts[2];
  const style = action === "style" ? parts[3] : null;
  const userId = parts.at(-2), stamp = Number(parts.at(-1));
  const key = feature === "joindm" ? "joinDm" : feature;
  if (!interaction.guild || !["goodbye", "boost", "joindm"].includes(feature) || !isAuthorizedInteraction(interaction) || userId !== interaction.user.id || !Number.isFinite(stamp) || Date.now() - stamp > 900000) {
    await safeReply(interaction, { components: [createErrorContainer("Setup Expired", "Open the configuration again to continue.")], flags: MessageFlags.IsComponentsV2 | 64 });
    return true;
  }
  const state = guildData(interaction.guildId)[key] ||= {};
  if (action === "cancel") {
    await interaction.update({ components: [createInfoContainer("Setup Closed", "Your current settings remain saved.")], flags: MessageFlags.IsComponentsV2 });
    return true;
  }
  if (action === "channel") {
    const channelId = interaction.values?.[0];
    const channel = interaction.guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildText) {
      await safeReply(interaction, { components: [createErrorContainer("Invalid Channel", "Choose a text channel from this server.")], flags: MessageFlags.IsComponentsV2 | 64 });
      return true;
    }
    state.channel = channelId;
    saveDB();
    await interaction.update({ components: [buildMessageFeatureSetupPanel(interaction.guild, interaction.user, `${userId}:${stamp}`, feature)], flags: MessageFlags.IsComponentsV2 });
    return true;
  }
  if (action === "template") {
    const defaults = {
      goodbye: { title: "Goodbye {username}", message: "Goodbye {user}! We'll miss you." },
      boost: { title: "Server Boosted!", description: "{user} just boosted {server}!" },
      joindm: { title: "Welcome to {server}!", message: "Welcome {user}! We're glad you're here." },
    };
    if (feature === "boost") state.embed = { ...(state.embed || {}), ...defaults.boost };
    else Object.assign(state, defaults[feature], { embedEnabled: true });
    saveDB();
  } else if (action === "style") {
    state.embedEnabled = style === "embed";
    saveDB();
  } else return false;

  const session = `${userId}_${stamp}`;
  const panel = feature === "goodbye" ? buildGoodbyeConfigPanel(interaction.guild, interaction.guildId, session, interaction.user)
    : feature === "boost" ? buildBoostConfigPanel(interaction.guild, interaction.guildId, session, interaction.user)
    : buildJoinDmConfigPanel(interaction.guild, interaction.guildId, session, interaction.user);
  await replaceSetupWithConfigEditor(interaction, panel);
  return true;
}
globalThis.handleMessageFeatureSetupInteraction = handleMessageFeatureSetupInteraction;

// ============ GOODBYE CONFIG PANEL ============
function buildGoodbyeConfigPanel(guild, guildId, sessionId, user) {
  const g = guildData(guildId).goodbye || {};
  const ARROW = "<a:zyarrow:1487457493549453339>";
  const EMOJI_ENABLE  = EMOJIS.success;
  const EMOJI_DISABLE = EMOJIS.error;

  const embedStatus = g.embedEnabled !== false ? `${EMOJI_ENABLE} Enabled` : `${EMOJI_DISABLE} Disabled`;
  const msgFooter   = g.footer || g.dmFooter ? `\`${(g.footer || g.dmFooter).slice(0, 40)}${(g.footer || g.dmFooter).length > 40 ? "..." : ""}\`` : "`Not set`";
  const msgImage    = g.image  || g.dmImage  ? `\`${(g.image  || g.dmImage).slice(0, 40)}...\`` : "`Not set`";
  const channelText = g.channel ? `<#${g.channel}>` : "`Not set`";

  const _fill = txt => txt
    .replace(/{user}/g, "@Username")
    .replace(/{username}/g, "Username")
    .replace(/{server}/g, guild?.name || "YourServer")
    .replace(/{membercount}/g, "100")
    .replace(/{user_avatar}/g, "https://cdn.discordapp.com/embed/avatars/0.png")
    .replace(/{server_avatar}/g, guild?.iconURL({ dynamic: true }) || "https://cdn.discordapp.com/embed/avatars/0.png")
    .replace(/{bot_avatar}/g, "https://cdn.discordapp.com/embed/avatars/0.png");

  const imageURL = value => /^https?:\/\//i.test(_fill(value || "")) ? _fill(value) : undefined;
  const previewEmbed = new EmbedBuilder().setColor(g.color ?? 0x808080).setDescription(_fill(g.message || "Goodbye {user}! We'll miss you."));
  if (g.authorText || imageURL(g.authorIcon)) previewEmbed.setAuthor({ name: _fill(g.authorText) || "\u200b", iconURL: imageURL(g.authorIcon) });
  if (g.thumbnail && imageURL(g.thumbnail)) previewEmbed.setThumbnail(imageURL(g.thumbnail));
  if (g.image && imageURL(g.image)) previewEmbed.setImage(imageURL(g.image));
  const footerText = g.footer || g.dmFooter;
  if (footerText || imageURL(g.footerIcon)) previewEmbed.setFooter({ text: _fill(footerText) || "\u200b", iconURL: imageURL(g.footerIcon) });
  const preview = previewEmbed;

  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`gbcfg_select_${sessionId}`)
    .setPlaceholder("Choose an option to configure Goodbye")
    .addOptions([
      { label: g.enabled ? "Disable Goodbye" : "Enable Goodbye", description: g.enabled ? "Turn off goodbye messages" : "Turn on goodbye messages", value: `gbcfg_toggle_${sessionId}` },
      { label: "Set Goodbye Channel", description: "Choose where leave messages are posted",       value: `gbcfg_channel_${sessionId}`    },
      { label: "Remove Goodbye Channel", description: "Remove the channel and disable goodbye",    value: `gbcfg_removechannel_${sessionId}` },
      { label: "Show Goodbye Channel", description: "Show the currently configured channel",       value: `gbcfg_showchannel_${sessionId}` },
      { label: "Set Message",       description: "Edit the goodbye title & description text",      value: `gbcfg_message_${sessionId}`    },
      { label: "Toggle Embed",      description: "Enable or disable the embed message style",      value: `gbcfg_embed_${sessionId}`      },
      { label: "Color",             description: "Edit the embed accent color",                  value: `gbcfg_color_${sessionId}`      },
      { label: "Image & Thumbnail", description: "Set banner image & thumbnail (clear to remove)", value: `gbcfg_imagethumb_${sessionId}` },
      { label: "Footer",            description: "Edit footer text & icon URL (clear to remove)", value: `gbcfg_footer_${sessionId}`     },
      { label: "Author",            description: "Edit author name & icon URL (clear to remove)", value: `gbcfg_author_${sessionId}`     },
    ]);

  const container = new ContainerBuilder()
    .addActionRowComponents(new ActionRowBuilder().addComponents(dropdown))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`gbsetup:save:${sessionId.replace("_", ":")}`).setLabel("Save & Enable").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`gbsetup:cancel:${sessionId.replace("_", ":")}`).setLabel("Cancel").setStyle(ButtonStyle.Danger)
    ));

  return { container, components: [container], previewContent: _fill(g.title || "Goodbye {user}!"), previewEmbed: g.embedEnabled !== false ? preview : null };
}

// ============ JOINDM CONFIG PANEL ============
function buildJoinDmConfigPanel(guild, guildId, sessionId, user) {
  const jd = guildData(guildId).joinDm || {};
  const ARROW = "<a:zyarrow:1487457493549453339>";
  const EMOJI_ENABLE  = EMOJIS.success;
  const EMOJI_DISABLE = EMOJIS.error;

  const embedStatus = jd.embedEnabled !== false ? `${EMOJI_ENABLE} Enabled` : `${EMOJI_DISABLE} Disabled`;
  const msgFooter   = jd.footer || jd.dmFooter ? `\`${(jd.footer || jd.dmFooter).slice(0, 40)}${(jd.footer || jd.dmFooter).length > 40 ? "..." : ""}\`` : "`Not set`";
  const msgImage    = jd.image  || jd.dmImage  ? `\`${(jd.image  || jd.dmImage).slice(0, 40)}...\`` : "`Not set`";

  const _fill = txt => txt
    .replace(/{user}/g, "@Username")
    .replace(/{username}/g, "Username")
    .replace(/{server}/g, guild?.name || "YourServer")
    .replace(/{membercount}/g, "100")
    .replace(/{user_avatar}/g, "https://cdn.discordapp.com/embed/avatars/0.png")
    .replace(/{server_avatar}/g, guild?.iconURL({ dynamic: true }) || "https://cdn.discordapp.com/embed/avatars/0.png")
    .replace(/{bot_avatar}/g, "https://cdn.discordapp.com/embed/avatars/0.png");

  const imageURL = value => /^https?:\/\//i.test(_fill(value || "")) ? _fill(value) : undefined;
  const previewEmbed = new EmbedBuilder().setColor(jd.color ?? 0x808080).setDescription(_fill(jd.message || "Welcome {user} to {server}!"));
  if (jd.authorText || imageURL(jd.authorIcon)) previewEmbed.setAuthor({ name: _fill(jd.authorText) || "\u200b", iconURL: imageURL(jd.authorIcon) });
  if (jd.thumbnail && imageURL(jd.thumbnail)) previewEmbed.setThumbnail(imageURL(jd.thumbnail));
  if (jd.image && imageURL(jd.image)) previewEmbed.setImage(imageURL(jd.image));
  const footerText = jd.footer || jd.dmFooter;
  if (footerText || imageURL(jd.footerIcon)) previewEmbed.setFooter({ text: _fill(footerText) || "\u200b", iconURL: imageURL(jd.footerIcon) });
  const preview = previewEmbed;

  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`jdcfg_select_${sessionId}`)
    .setPlaceholder("Choose an option to configure Join DM")
    .addOptions([
      { label: jd.enabled ? "Disable Join DM" : "Enable Join DM", description: jd.enabled ? "Turn off join DM" : "Turn on join DM", value: `jdcfg_toggle_${sessionId}` },
      { label: "Set Message",       description: "Edit the DM title & description text",         value: `jdcfg_message_${sessionId}`    },
      { label: "Toggle Embed",      description: "Enable or disable the embed DM style",         value: `jdcfg_embed_${sessionId}`      },
      { label: "Color",             description: "Edit the embed accent color",                  value: `jdcfg_color_${sessionId}`      },
      { label: "Image & Thumbnail", description: "Set banner image & thumbnail (clear to remove)", value: `jdcfg_imagethumb_${sessionId}` },
      { label: "Footer",            description: "Edit footer text & icon URL (clear to remove)", value: `jdcfg_footer_${sessionId}`     },
      { label: "Author",            description: "Edit author name & icon URL (clear to remove)", value: `jdcfg_author_${sessionId}`     },
      { label: "Test Message",      description: "Send yourself a test DM",                      value: `jdcfg_test_${sessionId}`       },
    ]);

  const container = new ContainerBuilder()
    .addActionRowComponents(new ActionRowBuilder().addComponents(dropdown))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`jdsetup:save:${sessionId.replace("_", ":")}`).setLabel("Save & Enable").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`jdsetup:cancel:${sessionId.replace("_", ":")}`).setLabel("Cancel").setStyle(ButtonStyle.Danger)
    ));

  return { container, components: [container], previewContent: _fill(jd.title || "Welcome {user}!"), previewEmbed: jd.embedEnabled !== false ? preview : null };
}

// ============ BOOST CONFIG PANEL ============
function buildBoostConfigPanel(guild, guildId, sessionId, user) {
  const b = guildData(guildId).boost || {};
  const ARROW = "<a:zyarrow:1487457493549453339>";
  const EXCL  = "";

  const boostChannel = b.channel ? `<#${b.channel}>` : "`Not set`";
  const e = b.embed || {};

  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`bstcfg_select_${sessionId}`)
    .setPlaceholder("Select an option to configure...")
    .addOptions([
      { label: b.enabled ? "Disable Boost Messages" : "Enable Boost Messages", description: b.enabled ? "Turn off boost messages" : "Turn on boost messages", value: `bstcfg_toggle_${sessionId}` },
      { label: "Set Channel",     description: "Set the boost message channel",      value: `bstcfg_channel_${sessionId}` },
      { label: "Customize Embed", description: "Edit the boost embed title/message", value: `bstcfg_embed_${sessionId}`   },
      { label: "Test Message",    description: "Send a test boost message",          value: `bstcfg_test_${sessionId}`    },
    ]);

  const dropdownRow = new ActionRowBuilder().addComponents(dropdown);

  const fill = text => String(text || "").replace(/{user}/g, `<@${user?.id || "0"}>`).replace(/{username}/g, user?.username || "Username").replace(/{count}/g, String(guild?.premiumSubscriptionCount || 1)).replace(/{server}/g, guild?.name || "Server");
  const boostEmbed = createEmbed({ title: fill(e.title || `${EMOJIS.boost} Server Boosted!`), description: fill(e.description || "{user} just boosted {server}!"), thumbnail: user?.displayAvatarURL?.({ size: 256 }), image: e.image || undefined, color: e.color ? parseInt(String(e.color).replace("#", ""), 16) : getThemeColor(guildId), author: e.authorText ? fill(e.authorText) : undefined, authorIcon: e.authorIcon || undefined, footer: e.footer ? { text: fill(e.footer), iconURL: e.footerIcon || undefined } : undefined });
  const preview = boostEmbed;
  const container = new ContainerBuilder().addActionRowComponents(dropdownRow)
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`bstsetup:save:${sessionId.replace("_", ":")}`).setLabel("Save & Enable").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`bstsetup:cancel:${sessionId.replace("_", ":")}`).setLabel("Cancel").setStyle(ButtonStyle.Danger)
    ));
  return {
    container,
    components: [container],
    previewContent: b.embedEnabled === false
      ? fill(e.description || "{user} just boosted {server}!")
      : fill(e.title || `${EMOJIS.boost} Server Boosted!`),
    previewEmbed: b.embedEnabled === false ? null : preview,
  };
}


// ============ SELFIE CONFIG PANEL ============
function buildSelfieConfigPanel(guild, guildId, sessionId, user) {
  const ARROW = "<a:zyarrow:1487457493549453339>";
  const images = guildData(guildId).selfie?.images || [];
  const imageCount = images.length;
  const maxImages = 10;

  const preview = imageCount > 0
    ? images.slice(0, 5).map((img, i) => `${ARROW} **[${i + 1}]** [View Image](${img.url}) — ${img.caption ? `\`${img.caption.slice(0,40)}\`` : "*No caption*"}`).join("\n") +
      (imageCount > 5 ? `\n*...and ${imageCount - 5} more*` : "")
    : `*No selfie images added yet.*`;

  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`selfiecfg_select_${sessionId}`)
    .setPlaceholder("⚙️ Select an option...")
    .addOptions([
      { label: "Add Image",     description: "Add a new selfie image URL and optional caption",        value: `selfiecfg_add_${sessionId}`,     emoji: "➕" },
      { label: "Remove Image",  description: "Remove a selfie image by its number",                    value: `selfiecfg_remove_${sessionId}`,  emoji: "🗑️" },
      { label: "Clear All",     description: "Remove all selfie images",                               value: `selfiecfg_clear_${sessionId}`,   emoji: "🧹" },
      { label: "Preview",       description: "Preview a random selfie image as the bot would send it", value: `selfiecfg_preview_${sessionId}`, emoji: "👁️" },
    ]);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(text =>
          text.setContent(`## ${EMOJIS.thinking} Selfie Configuration\n-# Premium Feature`)
        )
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(text =>
      text.setContent(
        `${ARROW} **Images Saved:** \`${imageCount} / ${maxImages}\`\n` +
        `${ARROW} **Usage:** \`${getPrefix(guildId)}selfie\` — sends a random image\n` +
        `${ARROW} **Usage:** \`${getPrefix(guildId)}selfie send @user\` — sends to a user's DMs\n\n` +
        `**Saved Images:**\n${preview}`
      )
    )
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(new ActionRowBuilder().addComponents(dropdown))
    .addSeparatorComponents(sep => sep.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`-# Requested by ${user?.username ?? 'Unknown'}`));

  return { container };
}

// ============ WARN CONFIG PANEL ============
function buildWarnConfigPanel(guild, guildId, sessionId, user) {
  const wp  = guildData(guildId).warnPunish || {};
  const ARR = "<a:zyarrow:1487457493549453339>";
  const thresholds = wp.thresholds || {};

  // Build threshold display lines with per-action emoji
  const actionEmoji = { mute: EMOJIS.mute, kick: EMOJIS.kick, ban: EMOJIS.ban };
  const thresholdLines = Object.entries(thresholds)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([wc, val]) => {
      const action   = typeof val === "object" ? val.action : val;
      const duration = typeof val === "object" ? val.duration : null;
      const emoji    = actionEmoji[action] || EMOJIS.warn;
      const dur      = (action === "mute" && duration) ? ` *(${duration} min)*` : "";
      return `${emoji} **${wc} warns** → \`${action.toUpperCase()}\`${dur}`;
    })
    .join("\n") || `${ARR} *No thresholds set yet — add one below!*`;

  const dropdown = new StringSelectMenuBuilder()
    .setCustomId(`wncfg_select_${sessionId}`)
    .setPlaceholder("> Select an option to configure...")
    .addOptions([
      { label: wp.enabled ? "Disable Auto-Punishment" : "Enable Auto-Punishment", description: wp.enabled ? "Turn off warn escalation" : "Turn on warn escalation", value: `wncfg_toggle_${sessionId}` },
      { label: "Add / Edit Threshold",  description: "Set warns → punishment (+ mute duration)", value: `wncfg_add_${sessionId}` },
      { label: "Remove Threshold",      description: "Remove a warn threshold by warn count",     value: `wncfg_remove_${sessionId}` },
      { label: "Clear All Thresholds",  description: "Wipe every configured threshold",           value: `wncfg_clear_${sessionId}` },
    ]);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.warn} Warn Auto-Punishment`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(
      `${ARR} **Status:** ${wp.enabled ? `${EMOJIS.success} Enabled` : `${EMOJIS.error} Disabled`}`
    ))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(t => t.setContent(`**Auto-Punishment Thresholds:**\n${thresholdLines}`))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addActionRowComponents(new ActionRowBuilder().addComponents(dropdown))
    .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`-# Requested by ${user?.username ?? "Unknown"} • <t:${Math.floor(Date.now() / 1000)}:t>`));

  return { container };
}

const managedMaps = new Set();

class ManagedMap extends Map {
  constructor(name, options = {}) {
    super();
    this.name = name;
    this.ttl = options.ttl || 0;
    this.max = options.max || Infinity;
    this.onEvict = options.onEvict || null;
    this._meta = new Map();

    if (this.ttl || Number.isFinite(this.max)) {
      const interval = this.ttl ? Math.min(Math.max(Math.floor(this.ttl / 2), 30000), 300000) : 300000;
      this._cleanupTimer = setInterval(() => this.cleanup(), interval);
      this._cleanupTimer.unref?.();
      managedMaps.add(this);
    }
  }

  _evict(key, reason = "evict") {
    const value = super.get(key);
    this._meta.delete(key);
    const removed = super.delete(key);
    if (removed && this.onEvict) {
      try { this.onEvict(value, key, reason); } catch {}
    }
    return removed;
  }

  _isExpired(key, now = Date.now()) {
    const meta = this._meta.get(key);
    return !!(meta?.expiresAt && meta.expiresAt <= now);
  }

  _pruneMax() {
    if (!Number.isFinite(this.max)) return;
    while (this.size > this.max) {
      let oldestKey = null;
      let oldestSeen = Infinity;
      for (const [key, meta] of this._meta.entries()) {
        const seen = meta.lastAccess || meta.createdAt || 0;
        if (seen < oldestSeen) {
          oldestSeen = seen;
          oldestKey = key;
        }
      }
      if (oldestKey === null) break;
      this._evict(oldestKey, "max");
    }
  }

  set(key, value) {
    const now = Date.now();
    super.set(key, value);
    this._meta.set(key, {
      createdAt: this._meta.get(key)?.createdAt || now,
      lastAccess: now,
      expiresAt: this.ttl ? now + this.ttl : 0,
    });
    this._pruneMax();
    return this;
  }

  get(key) {
    if (this._isExpired(key)) {
      this._evict(key, "ttl");
      return undefined;
    }
    const value = super.get(key);
    const meta = this._meta.get(key);
    if (meta) meta.lastAccess = Date.now();
    return value;
  }

  has(key) {
    if (this._isExpired(key)) {
      this._evict(key, "ttl");
      return false;
    }
    return super.has(key);
  }

  delete(key) {
    return this._evict(key, "delete");
  }

  clear() {
    this._meta.clear();
    return super.clear();
  }

  cleanup(now = Date.now()) {
    for (const key of Array.from(this._meta.keys())) {
      if (this._isExpired(key, now)) this._evict(key, "ttl");
    }
    this._pruneMax();
  }
}

function cleanupManagedMaps() {
  for (const map of managedMaps) map.cleanup();
}

const clearSessionTimeout = value => {
  if (value?.timeout) clearTimeout(value.timeout);
};

function isDiscordGuildId(value) {
  return /^\d{17,20}$/.test(String(value || ""));
}

function getKnownGuildIds() {
  return Object.keys(db.guilds || {}).filter(isDiscordGuildId);
}

function pruneInvalidGuildBuckets() {
  if (!db.guilds || typeof db.guilds !== "object") return 0;
  let pruned = 0;
  for (const key of Object.keys(db.guilds)) {
    if (isDiscordGuildId(key)) continue;
    // Preserve unknown/legacy records. Runtime enumeration filters snowflakes;
    // their schema must be identified before any destructive migration.
    pruned++;
  }
  if (db.guildSystems && typeof db.guildSystems === "object") {
    for (const key of Object.keys(db.guildSystems)) {
      if (isDiscordGuildId(key)) continue;
      // Retain legacy records for an explicit, backed-up migration.
      pruned++;
    }
  }
  return pruned;
}

const autoResponders = new Map();
const autoDeleteTextOnly = new Map();
const globalAutoResponders = new Map();
const mediaDeleteLogs = new Map();
const stolenStickers = new Map();
const giveaways = new Map();
const giveawayTimeouts = new Map();
const stickyMessages = new Map();
const inviteTracking = new Map();
const tempVoiceChannels = new Map();
const customRoles = new Map();
const userCooldowns = new ManagedMap("userCooldowns", { ttl: 15 * 60 * 1000, max: 100000 });
const snipedMessages = new ManagedMap("snipedMessages", { ttl: 24 * 60 * 60 * 1000, max: 10000 });
const editSnipedMessages = new ManagedMap("editSnipedMessages", { ttl: 5 * 60 * 1000, max: 10000 });
const musicQueues = new Map();
const channelSnipeHistory = new ManagedMap("channelSnipeHistory", { ttl: 24 * 60 * 60 * 1000, max: 10000 });
const channelEditHistory = new ManagedMap("channelEditHistory", { ttl: 5 * 60 * 1000, max: 10000 });
const countingChannels = new Map();
const antiNukeActions = new ManagedMap("antiNukeActions", { ttl: 10 * 60 * 1000, max: 50000 });
const nukeSnapshots   = new ManagedMap("nukeSnapshots", { ttl: 60 * 60 * 1000, max: 500 }); // guildId → { channels: [], roles: [], takenAt: Number }
const pendingNukes = new ManagedMap("pendingNukes", { ttl: 60 * 1000, max: 5000 }); // key: `${channelId}_${authorId}` => reason
// Tracks fallback (error/info/warning) containers & embeds so reply wrappers
// can schedule auto-delete without touching every individual call site.
const _dbAutoDeletePayloads = new WeakSet();
const spamTracker = new ManagedMap("spamTracker", { ttl: 2 * 60 * 1000, max: 50000 });
const ticketTranscripts = new ManagedMap("ticketTranscripts", { ttl: 30 * 60 * 1000, max: 1000 });
const disabledCommands = new Map();
const embedEditorData = new ManagedMap("embedEditorData", { ttl: 30 * 60 * 1000, max: 5000 });
const rrSessions = new ManagedMap("rrSessions", { ttl: 30 * 60 * 1000, max: 5000 }); // reaction role builder sessions
const wordleGames = new ManagedMap("wordleGames", { ttl: 2 * 60 * 60 * 1000, max: 10000 });   // key: `${guildId}_${userId}` → { answer, guesses[] }
const hangmanGames = new ManagedMap("hangmanGames", { ttl: 2 * 60 * 60 * 1000, max: 10000 });  // key: `${guildId}_${userId}` → { word, guessed Set, wrongCount }
const selfieSessions = new ManagedMap("selfieSessions", { ttl: 10 * 60 * 1000, max: 5000 }); // key: sessionId → { guildId, userId, step, data }
const blackjackSessions = new ManagedMap("blackjackSessions", { ttl: 2 * 60 * 60 * 1000, max: 10000 });  // key: `${guildId}_${userId}` → game state
const serverMailBoxes   = new ManagedMap("serverMailBoxes", { ttl: 60 * 60 * 1000, max: 10000 });  // key: `${guildId}_${userId}` → [{ from, content, ts }]
const vouchSessions     = new ManagedMap("vouchSessions", { ttl: 30 * 60 * 1000, max: 5000 });  // key: sessionId → { guildId, userId }
const triviaGames       = new ManagedMap("triviaGames", { ttl: 5 * 60 * 1000, max: 5000, onEvict: clearSessionTimeout });  // key: `${guildId}_${userId}` → { question, answer, choices, timeout }
const scrambleGames     = new ManagedMap("scrambleGames", { ttl: 30 * 60 * 1000, max: 1000 });  // key: `${guildId}` → { word, scrambled, hostId, timeout, collector }
const wordChainGames    = new ManagedMap("wordChainGames", { ttl: 30 * 60 * 1000, max: 1000, onEvict: clearSessionTimeout });  // key: `${guildId}` → { lastWord, lastLetter, usedWords Set, players Set, timeout }
const chessGames        = new ManagedMap("chessGames", { ttl: 2 * 60 * 60 * 1000, max: 1000, onEvict: clearSessionTimeout });  // key: `${guildId}` → { board, turn, p1, p2, selected, timeout }
const PIECE_NAMES_CH = {
  "\u2654":"King","\u2655":"Queen","\u2656":"Rook","\u2657":"Bishop","\u2658":"Knight","\u2659":"Pawn",
  "\u265A":"King","\u265B":"Queen","\u265C":"Rook","\u265D":"Bishop","\u265E":"Knight","\u265F":"Pawn"
};
if (!db.globalNoPrefixTrials) db.globalNoPrefixTrials = {}; // global trial records (cross-server)

// ── Clean up expired no-prefix trials on startup (setTimeout lost on restart) ──
(function cleanExpiredTrialsOnStartup() {
  const now = Date.now();
  let changed = false;
  for (const [userId, trial] of Object.entries(db.globalNoPrefixTrials)) {
    if (!trial?.expiresAt || trial.expiresAt >= now) continue;
    // Trial has expired — remove user from their guild's noPrefixUsers
    const targetGuildIds = trial.guildId
      ? [trial.guildId]
      : getKnownGuildIds(); // fallback: search all guilds (old records without guildId)
    for (const gId of targetGuildIds) {
      const users = db.guilds?.[gId]?.noPrefixUsers;
      if (!users) continue;
      const idx = users.indexOf(userId);
      if (idx !== -1) { users.splice(idx, 1); changed = true; }
    }
  }
  if (changed) saveDB();
})();

// ── Also re-arm setTimeout for trials still active at startup ──
(function rearmTrialTimers() {
  function scheduleTrialExpiry(userId, trial) {
    const remaining = trial.expiresAt - Date.now();
    if (remaining <= 0) {
      const users = db.guilds?.[trial.guildId]?.noPrefixUsers;
      if (!users) return;
      const idx = users.indexOf(userId);
      if (idx !== -1) { users.splice(idx, 1); saveDB(); }
      return;
    }
    setTimeout(() => scheduleTrialExpiry(userId, trial), Math.min(remaining, 2147483647));
  }

  const now = Date.now();
  for (const [userId, trial] of Object.entries(db.globalNoPrefixTrials)) {
    if (!trial?.expiresAt || trial.expiresAt <= now) continue;
    if (!trial.guildId) continue;
    scheduleTrialExpiry(userId, trial);
  }
})();

// Action GIFs for fun commands
const actionGifs = {
  hug: [
    "https://cdn.discordapp.com/attachments/1473568523866476645/1473608862484398171/image0.gif?ex=69c25633&is=69c104b3&hm=017a2c143293eadd2b0749a9d9df89e6b75ba3937451d0e2a8fb880181413bf5&",
    "https://cdn.discordapp.com/attachments/1473568523866476645/1473608863084318843/image1.gif?ex=69c25633&is=69c104b3&hm=021d23b4ab81d4c131432c716d5bd001834b2e81cdbf5fa7ba26045b9eb5d648&",
    "https://cdn.discordapp.com/attachments/1473568523866476645/1473608863562338324/image2.gif?ex=69c25633&is=69c104b3&hm=6cea6c06f2f0b62cf702f88281a8b201a78f8f9866b0e547ebd981f62d6459cd&",
    "https://cdn.discordapp.com/attachments/1473568523866476645/1473608864435011646/image3.gif?ex=69c25633&is=69c104b3&hm=1452e034e4fc3f06e15c6bab5fcb08c2d12a25978c4ed16c71086f08e46106e3&",
    "https://cdn.discordapp.com/attachments/1473568523866476645/1473608865055510639/image4.gif?ex=69c25633&is=69c104b3&hm=ac7e4890ed73be5f0dac2028a66d9e2e40f827552a9d03155438f5dae4281999&",
    "https://cdn.discordapp.com/attachments/1473568523866476645/1473608865512820776/image5.gif?ex=69c25633&is=69c104b3&hm=ce0d1ac6b347c9ff01f1375ba0321b7a2025af82bbd6b5592c1f177a62a8d336&",
    "https://cdn.discordapp.com/attachments/1473568523866476645/1473608866141831260/image6.gif?ex=69c25634&is=69c104b4&hm=2e3da16d8d27c6ca35bdcbf8aebfdc6e7808d7c242f2fc299d2f41ca366bb536&",
    "https://cdn.discordapp.com/attachments/1473568523866476645/1473608866972307530/image7.gif?ex=69c25634&is=69c104b4&hm=d6f4f1c282cddab2320a41d7e08a9ad01766bebab6aa4e15814602e6a1e6cc2c&",
    "https://cdn.discordapp.com/attachments/1473568523866476645/1473608867282948217/image8.gif?ex=69c25634&is=69c104b4&hm=c11626714bda27490358d80c3dc97e4839d5bd0ed5461cb4d9d1d13a61cb951e&",
    "https://cdn.discordapp.com/attachments/1473568523866476645/1473608867798585455/image9.gif?ex=69c25634&is=69c104b4&hm=ed2c08de321b4bd80392dcc84441cf87e85c0f5a47158820945db8e5847b51b9&",
  ],
  kiss: [
    "https://cdn.discordapp.com/attachments/1473568599242440816/1473609042319638651/image0.gif?ex=69c2565e&is=69c104de&hm=b71dde73da071acd768769c45d39ef25d35f829452c793df6b8200b342eddac9&",
    "https://cdn.discordapp.com/attachments/1473568599242440816/1473609042638274725/image1.gif?ex=69c2565e&is=69c104de&hm=1736dd940cc44adf280a6f1da8d9dec9fa711e5753622240aaf369822fca3579&",
    "https://cdn.discordapp.com/attachments/1473568599242440816/1473609042961371237/image2.gif?ex=69c2565e&is=69c104de&hm=d78f94d70229198863859b4c0154ace7f89dba7166b954dd74d16d1ddb9a74d3&",
    "https://cdn.discordapp.com/attachments/1473568599242440816/1473609043322077238/image3.gif?ex=69c2565e&is=69c104de&hm=3d8ace1c5b7f369c0ebf6caf720a653f89468be44e76ca62e391967467601453&",
    "https://cdn.discordapp.com/attachments/1473568599242440816/1473609043674267781/image4.gif?ex=69c2565e&is=69c104de&hm=d3334185ea9593451dbc19743eb1b1a4fa5b433b880ab4ff191f9edefdc6a142&",
    "https://cdn.discordapp.com/attachments/1473568599242440816/1473609044039307305/image5.gif?ex=69c2565e&is=69c104de&hm=4e63c7fa45bddad80a5624e4f0ebd82a241368cecf3bdf8d3546f00e7e7a0d8c&",
    "https://cdn.discordapp.com/attachments/1473568599242440816/1473609044295155732/image6.gif?ex=69c2565e&is=69c104de&hm=18e1f8660090cb74daee3d63fc5485c341e58373eb8d5c73dbc5fbb978372aa7&",
    "https://cdn.discordapp.com/attachments/1473568599242440816/1473609044609470496/image7.gif?ex=69c2565e&is=69c104de&hm=dc2545a8b2490d7068308ea246bbd7b8613e8be9d4eb51954d9c1b28b50dc637&",
    "https://cdn.discordapp.com/attachments/1473568599242440816/1473609044991283230/image8.gif?ex=69c2565e&is=69c104de&hm=4caa3142526101851d62019f41c92b133096b331ea9d98b8342d304bdc2d017a&",
    "https://cdn.discordapp.com/attachments/1473568599242440816/1473609086305177660/image0.gif?ex=69c25668&is=69c104e8&hm=fdc493068b7f823d6a1917399ba89fe9aa6f14489be48e3b1ae4a807c3dc4155&",
  ],
  pat: [
    "https://cdn.discordapp.com/attachments/1473568716342956136/1473609198159007856/image0.gif?ex=69c25683&is=69c10503&hm=9ab78e3f08250ae65394f64148d73e7118b384c0a1a7306af4cad386310aada0&",
    "https://cdn.discordapp.com/attachments/1473568716342956136/1473609198829961327/image1.gif?ex=69c25683&is=69c10503&hm=66c58626b846b37e66c893bf294499aa1fbc566d75d4783c43a4d2a2ca5d1daf&",
    "https://cdn.discordapp.com/attachments/1473568716342956136/1473609199299592314/image2.gif?ex=69c25683&is=69c10503&hm=88a81d45d189cb3fcedf3fee948ef8afcf8864738fb8c53b155b9fb2d1b3f582&",
    "https://cdn.discordapp.com/attachments/1473568716342956136/1473609199626879058/image3.gif?ex=69c25683&is=69c10503&hm=77f9701fc9598fc8dc94814a00bfdaf4ce71468fb88f441828e6745519b9d784&",
    "https://cdn.discordapp.com/attachments/1473568716342956136/1473609200008695838/image4.gif?ex=69c25683&is=69c10503&hm=e7b6e39b1e7f9dddf749eef10f8ab58b517e72eafb4a066db10d409ac56f14c8&",
    "https://cdn.discordapp.com/attachments/1473568716342956136/1473609200549498972/image5.gif?ex=69c25683&is=69c10503&hm=7e10c83843f37395885b83e17d3540aad335cc460264024fc11c6a2c3cacaa43&",
    "https://cdn.discordapp.com/attachments/1473568716342956136/1473609201019518976/image6.gif?ex=69c25683&is=69c10503&hm=ce1dcc19adef67d5b0455cfc8c3c8deab8e0c53c444a0e1ba95abab410cb539c&",
    "https://cdn.discordapp.com/attachments/1473568716342956136/1473609201367388170/image7.gif?ex=69c25683&is=69c10503&hm=391e61dc564bb5d237c77a3519908e55f568c2261a8bac294d8ff8b90aef7151&",
    "https://cdn.discordapp.com/attachments/1473568716342956136/1473609201749327882/image8.gif?ex=69c25684&is=69c10504&hm=165e0a9c20c131d0e568460394b2c6a850ced80cda6fd8073a2edb268627e5a7&",
    "https://cdn.discordapp.com/attachments/1473568716342956136/1473609202042667049/image9.gif?ex=69c25684&is=69c10504&hm=2fe049285c46e8e0d57b45471b7b4c92493020e4caa8b6a5d15402d25e6296c4&",
  ],
  slap: [
    "https://cdn.discordapp.com/attachments/1473568769493172371/1473609315968352349/image0.gif?ex=69c2569f&is=69c1051f&hm=e1c6a5cc8f34e42ac6dad5828ace35c0c7cd9a3f8d8cc3a9b533cc1a7d7dbb90&",
    "https://cdn.discordapp.com/attachments/1473568769493172371/1473609316396302419/image1.gif?ex=69c2569f&is=69c1051f&hm=c44f4a4165c5de48866fe6aef60f3f885b53b25ea80c26f2f03cf947d11b3076&",
    "https://cdn.discordapp.com/attachments/1473568769493172371/1473609316744298577/image2.gif?ex=69c2569f&is=69c1051f&hm=2c67ab7c6c408400382433134b208622edb30853bf76d27fde98e05be73a4b6f&",
    "https://cdn.discordapp.com/attachments/1473568769493172371/1473609317168054436/image3.gif?ex=69c2569f&is=69c1051f&hm=e139bdb695f54c0b96d70c809bb90f1eb7bc2b11deee0b8b7c3e3605aaf4fcd0&",
    "https://cdn.discordapp.com/attachments/1473568769493172371/1473609317532827770/image4.gif?ex=69c2569f&is=69c1051f&hm=95f5a109a572c0d5dc17ab30e0ce86c7768fb8d3a14f8f33fce001200df6cb66&",
    "https://cdn.discordapp.com/attachments/1473568769493172371/1473609317814112256/image5.gif?ex=69c2569f&is=69c1051f&hm=23a81261d501c3332e921b32dfbbfdbbba28c4b73ecc61506d9754109dc6a06c&",
    "https://cdn.discordapp.com/attachments/1473568769493172371/1473609318086738061/image6.gif?ex=69c2569f&is=69c1051f&hm=5e9f1ea59edf6510e4c6c26bb8a12a5204d4cc48c46b8e7583e1f67b2cb5ce7c&",
    "https://cdn.discordapp.com/attachments/1473568769493172371/1473609318409437297/image7.gif?ex=69c2569f&is=69c1051f&hm=0376847adc284bd2aac0cc1193c13de53fe3d6403a81901cc80bef19035f9eb1&",
    "https://cdn.discordapp.com/attachments/1473568769493172371/1473609318711693312/image8.gif?ex=69c2569f&is=69c1051f&hm=403d1d623cace7b109528f42e4645110f2e4a83930590d3f0c6c746f3f60bf5f&",
    "https://cdn.discordapp.com/attachments/1473568769493172371/1473609319051427986/image9.gif?ex=69c2569f&is=69c1051f&hm=d5a5dbbad03b4be87bc57307b280f039136ca51b0aafc94f71602102922cdad1&",
  ],
  cuddle: [
    "https://cdn.discordapp.com/attachments/1473568882068426815/1473609552296542338/image0.gif?ex=69c256d7&is=69c10557&hm=e29493c33ec71e2f50e8cd027c955f69b08953860d488b800f85a03fd33fba5c&",
    "https://cdn.discordapp.com/attachments/1473568882068426815/1473609552695132230/image1.gif?ex=69c256d7&is=69c10557&hm=215a5e26314382f003c8359482fe9088602656cb64c30acec78140480dcc118b&",
    "https://cdn.discordapp.com/attachments/1473568882068426815/1473609553059774577/image2.gif?ex=69c256d7&is=69c10557&hm=f15a2520d4b4da2c81ddd75f53c4c9f86aa9bab7d8c6ceef789111e91273b628&",
    "https://cdn.discordapp.com/attachments/1473568882068426815/1473609553508827221/image3.gif?ex=69c256d7&is=69c10557&hm=566eb607d0a08eabf3e04383850a727018ed4fc42ecf8ee0b7d8a22646601b0d&",
    "https://cdn.discordapp.com/attachments/1473568882068426815/1473609553999564822/image4.gif?ex=69c256d8&is=69c10558&hm=e6336853398b9b8b3025f10bb321c8315c07b7d723b9ac6ae6e8844a74804b7e&",
    "https://cdn.discordapp.com/attachments/1473568882068426815/1473609554355814463/image5.gif?ex=69c256d8&is=69c10558&hm=1f0e59cbf7b4ad6170940c22a5f52bbfff8b5750aebce271a27624cf51d921a5&",
    "https://cdn.discordapp.com/attachments/1473568882068426815/1473609555014324347/image6.gif?ex=69c256d8&is=69c10558&hm=b19f98aae17234be7c7530c3f0c7cfd58414d25b2be4094016e04879bca5315b&",
    "https://cdn.discordapp.com/attachments/1473568882068426815/1473609555396001812/image7.gif?ex=69c256d8&is=69c10558&hm=0179abf2f5a8c2bf16da418b697d086d48c9cf2c94d68ddd36ab1bfdfbecec5d&",
    "https://cdn.discordapp.com/attachments/1473568882068426815/1473609555953848321/image8.gif?ex=69c256d8&is=69c10558&hm=c5b5d18305383e3d4d52362fe58e93ccb8f9e638c34b7cc0873d514b322e2875&",
    "https://cdn.discordapp.com/attachments/1473568882068426815/1473609556398575708/image9.gif?ex=69c256d8&is=69c10558&hm=e41ac111f5d4db52d722f4ca67cf5c5e1e5db8d7407a845554839d56dfd3b9b4&",
  ],
  poke: [
    "https://cdn.discordapp.com/attachments/1473568916365119593/1473609709603913881/image0.gif?ex=69c256fd&is=69c1057d&hm=b95756f0531cc7236a0443f172e7e4b3112677e3a1c6631c8c4ce9a620fe30ec&",
    "https://cdn.discordapp.com/attachments/1473568916365119593/1473609709993988219/image1.gif?ex=69c256fd&is=69c1057d&hm=a49f2b4dd3d7f0f3ed64babc420a6ec652c0fa83dc4ef874ccea6f6e217377e4&",
    "https://cdn.discordapp.com/attachments/1473568916365119593/1473609710405025812/image2.gif?ex=69c256fd&is=69c1057d&hm=7d6777978f1bcf8331b0ab888a84a89f729158d215ddf5591f4f552823e42f09&",
    "https://cdn.discordapp.com/attachments/1473568916365119593/1473609710719729706/image3.gif?ex=69c256fd&is=69c1057d&hm=8170211cd9adbd987fa06b1b2dff4f323f5d65a40c8c0d7269f02facce1520a2&",
    "https://cdn.discordapp.com/attachments/1473568916365119593/1473609711432765492/image4.gif?ex=69c256fd&is=69c1057d&hm=8e3ceea0e2e5a3005817e0ca2e9d7142bd77faafa89bfb9a99810e695f0c339c&",
    "https://cdn.discordapp.com/attachments/1473568916365119593/1473609711768043602/image5.gif?ex=69c256fd&is=69c1057d&hm=8fc11019853b5262982ca977b26227f5131dc44df423b3e341bb45684791ed8e&",
    "https://cdn.discordapp.com/attachments/1473568916365119593/1473609712325890202/image6.gif?ex=69c256fd&is=69c1057d&hm=b00eec9132a6e710ec43a1b2fb7e8e0ef0a15e96f1c7432e013dc5c734c6cf0c&",
    "https://cdn.discordapp.com/attachments/1473568916365119593/1473609712737058857/image7.gif?ex=69c256fd&is=69c1057d&hm=8351932007fdc4a71563976f2aae44585a6ed0e593b78739a0fbccfc85f1c4e6&",
    "https://cdn.discordapp.com/attachments/1473568916365119593/1473609713269866569/image8.gif?ex=69c256fd&is=69c1057d&hm=26b0abd6df1800681425fbee996c2c4fbf7e75f9fbcf4ca047f642691bfbc505&",
    "https://cdn.discordapp.com/attachments/1473568916365119593/1473609713596895354/image9.gif?ex=69c256fe&is=69c1057e&hm=c1d5a360477f154ff23f64f6152a7d8bd4322e0e9ea31f0f814d1699f8192de0&",
  ],
  wave: [
    "https://cdn.discordapp.com/attachments/1473568980202557521/1473609853867004058/image0.gif?ex=69c2571f&is=69c1059f&hm=f3ef9b871ea6ee98e2365932ea4babbe22b9ef9431dde27965e39b90b58f1abe&",
    "https://cdn.discordapp.com/attachments/1473568980202557521/1473609854491951188/image1.gif?ex=69c2571f&is=69c1059f&hm=bc4940a6d042da6605b291c032de222e74a65e198e0fffbc2cab62fe460fc211&",
    "https://cdn.discordapp.com/attachments/1473568980202557521/1473609855737532529/image2.gif?ex=69c2571f&is=69c1059f&hm=5b13bc0b673a3a86ed3369ab8fe68ac63b5ee34871f2c4dac3017ed78c09c9ca&",
    "https://cdn.discordapp.com/attachments/1473568980202557521/1473609856203227248/image3.gif?ex=69c25720&is=69c105a0&hm=757f5eb7c035cdff4e1bde6ff3599baf099a5aaf087328698618a815bd5112ae&",
    "https://cdn.discordapp.com/attachments/1473568980202557521/1473609856765136987/image4.gif?ex=69c25720&is=69c105a0&hm=6c3c904537aa6829b409e500133c8fbc1086e12e321b0b1b8d465c7780acba51&",
    "https://cdn.discordapp.com/attachments/1473568980202557521/1473609857516044389/image5.gif?ex=69c25720&is=69c105a0&hm=1d7e7e8a50eca4ff06caa187dee3f10aa8da2a3bff60232787b9b475c41ba605&",
    "https://cdn.discordapp.com/attachments/1473568980202557521/1473609858161836124/image6.gif?ex=69c25720&is=69c105a0&hm=506eb3a6c2fb86eb68d31a862825c21f51983e96fc4bd6a722b84a1e28c8e355&",
    "https://cdn.discordapp.com/attachments/1473568980202557521/1473609858703032463/image7.gif?ex=69c25720&is=69c105a0&hm=4015cc65afacb147c4214b45327786b0e70f6d5ad8b83e802f102de8905d5ac8&",
    "https://cdn.discordapp.com/attachments/1473568980202557521/1473609859495759894/image8.gif?ex=69c25720&is=69c105a0&hm=b9305fc2e508612ae6e4b096612b62b7c3d6c3b4c62852207546435e7a2f66c7&",
    "https://cdn.discordapp.com/attachments/1473568980202557521/1473609860460445786/image9.gif?ex=69c25721&is=69c105a1&hm=629a15a5fa8254c34c7fc52443d49358b6025bb947dfae5f404318de1d4577a3&",
  ],
  bite: [
    "https://cdn.discordapp.com/attachments/1473569008203857960/1473609971936661606/image0.gif?ex=69c2573b&is=69c105bb&hm=d31218ec8708d49ff8aff740ad1259c93d22bafe63cd91a3825cd53ddc661471&",
    "https://cdn.discordapp.com/attachments/1473569008203857960/1473609972255555719/image1.gif?ex=69c2573b&is=69c105bb&hm=a46b8fde3993d62049843dc42de33557e95a28dda91586133262c7adf6b6aa7e&",
    "https://cdn.discordapp.com/attachments/1473569008203857960/1473609972616007731/image2.gif?ex=69c2573b&is=69c105bb&hm=ebfb05b39a91dec3e6414492bc5d1a811bad33bf9f30884b0907ba8d66314104&",
    "https://cdn.discordapp.com/attachments/1473569008203857960/1473609972939100211/image3.gif?ex=69c2573b&is=69c105bb&hm=2371a01c4f28ebfe3a6ae73fcf380f1fcefbe901e587ea7fbe07ec9d6621b58f&",
    "https://cdn.discordapp.com/attachments/1473569008203857960/1473609973685817447/image4.gif?ex=69c2573c&is=69c105bc&hm=00b879862d0d3d4fa3fe771468ae3d49406d54296f275a383b30e3b17326250d&",
    "https://cdn.discordapp.com/attachments/1473569008203857960/1473609974138536107/image5.gif?ex=69c2573c&is=69c105bc&hm=4d4c0da6f72494c752e46fe2dbe42157af6e718f632b38dab180fabc4e25d5e7&",
    "https://cdn.discordapp.com/attachments/1473569008203857960/1473609974684061796/image6.gif?ex=69c2573c&is=69c105bc&hm=d3da3ab165bc58227045c198cad4ab4b8abab57561523d71800c91aa7571ca53&",
    "https://cdn.discordapp.com/attachments/1473569008203857960/1473609975161946206/image7.gif?ex=69c2573c&is=69c105bc&hm=d4f713adcae18ddbef103b1925dafd6e4b1f1c16abea949ff5a5ae5886b64cee&",
    "https://cdn.discordapp.com/attachments/1473569008203857960/1473609975812325468/image8.gif?ex=69c2573c&is=69c105bc&hm=060d0dfbc0402b8e6418e9bd42513e09be62fe197e65ebda1ab0c302ab68e3fe&",
    "https://cdn.discordapp.com/attachments/1473569008203857960/1473609976428761140/image9.gif?ex=69c2573c&is=69c105bc&hm=74d52fddcf179cdfece1923c6e8a7d754e748adfc74fdc2b9d1ba99dffbf50bc&",
  ],
  cry: [
    "https://cdn.discordapp.com/attachments/1473570009447141501/1485591269697654844/image0.gif?ex=69c26c2f&is=69c11aaf&hm=2302f3835ab4ce33ad0d800606d5929193c06e9a031cd6b075ba06da0717d7d0&",
    "https://cdn.discordapp.com/attachments/1473570009447141501/1485591270394171432/image1.gif?ex=69c26c2f&is=69c11aaf&hm=55f131fd8e29da6e78ea7d332cd16458d3c6770efed538be35ae5bf573687c66&",
    "https://cdn.discordapp.com/attachments/1473570009447141501/1485591270830116929/image2.gif?ex=69c26c2f&is=69c11aaf&hm=6b9c18cb6239c9c8113cfccf370fd58692b38573c9bb1537e830b1508014dc1d&",
    "https://cdn.discordapp.com/attachments/1473570009447141501/1485591271262392493/image3.gif?ex=69c26c30&is=69c11ab0&hm=c5e4a99948c116a636b63f217ab6a381d4a0713d8b754765a23d9f73c9a7cba5&",
    "https://cdn.discordapp.com/attachments/1473570009447141501/1485591271614582865/image4.gif?ex=69c26c30&is=69c11ab0&hm=d152c5512330dd5d5b68ada78adefa03c0e1bb6400b3f66b06527d80ce3df6d7&",
    "https://cdn.discordapp.com/attachments/1473570009447141501/1485591271992066099/image5.gif?ex=69c26c30&is=69c11ab0&hm=a8ab4d2a691c559dc86f6f7f176d5056176434123cfd8eaa39d22b576ab25827&",
    "https://cdn.discordapp.com/attachments/1473570009447141501/1485591272445054996/image6.gif?ex=69c26c30&is=69c11ab0&hm=117547bf31d777b8b62d03746de5967e6daf7b9f49d746af9d157cb5c3fbf8bc&",
    "https://cdn.discordapp.com/attachments/1473570009447141501/1485591272834994307/image7.gif?ex=69c26c30&is=69c11ab0&hm=a87a3f5a7fe03ef6ead6bc9aebaba96f0acb3b0f1a41b5978fdc0315fb201894&",
    "https://cdn.discordapp.com/attachments/1473570009447141501/1485591273313407006/image8.gif?ex=69c26c30&is=69c11ab0&hm=d4b502fe1f2f2123f7722fb5854ef588be28030caf9cc504676888b75b380780&",
    "https://cdn.discordapp.com/attachments/1473570009447141501/1485591273740959916/image9.gif?ex=69c26c30&is=69c11ab0&hm=ef03086a7a042e643218feb06dffcc042efbfec39529572d43348e2cd7e3bb6b&",
  ],
  dance: [
    "https://cdn.discordapp.com/attachments/1473570048479199338/1485591435389440132/image0.gif?ex=69c26c57&is=69c11ad7&hm=cd018312e71f00dfd8c7194c6b80fb06e8ec38789def314a8ed000be8d6ea56c&",
    "https://cdn.discordapp.com/attachments/1473570048479199338/1485591435834294362/image1.gif?ex=69c26c57&is=69c11ad7&hm=2c5b337dcb85ed157567b3f9a1755d2f326642d8a600b4f70a25fa31a92201c6&",
    "https://cdn.discordapp.com/attachments/1473570048479199338/1485591436358324265/image2.gif?ex=69c26c57&is=69c11ad7&hm=f67d7a565d8452af38687ea9af55e5ab2ee48960df6caeaa7649b772f9a8cf9f&",
    "https://cdn.discordapp.com/attachments/1473570048479199338/1485591436773818499/image3.gif?ex=69c26c57&is=69c11ad7&hm=1d97177eedab0c152f13a61dee0f2f75882c8ee3876d98286d7920a3d51bfa57&",
    "https://cdn.discordapp.com/attachments/1473570048479199338/1485591437155242155/image4.gif?ex=69c26c57&is=69c11ad7&hm=85b673aeee1d4f1f021e585a5fc4c7824bf7490bc04c24fdc1c69a5715798ca8&",
    "https://cdn.discordapp.com/attachments/1473570048479199338/1485591437591707709/image5.gif?ex=69c26c57&is=69c11ad7&hm=a9dd20ee56ab451ac1f020753fb790daa7c8b01862c96c576b8f70f03121088f&",
    "https://cdn.discordapp.com/attachments/1473570048479199338/1485591437990039652/image6.gif?ex=69c26c57&is=69c11ad7&hm=1377b7892b7c50d48a53286555ae6d0278a8b6b7a95b6131e874dfa7a2024a7c&",
    "https://cdn.discordapp.com/attachments/1473570048479199338/1485591438484836395/image7.gif?ex=69c26c57&is=69c11ad7&hm=d4f7c5855944a42d43ca5bf28fb4879a2e87a19e211ba186013cee2f9fc7418b&",
    "https://cdn.discordapp.com/attachments/1473570048479199338/1485591439097200771/image8.gif?ex=69c26c58&is=69c11ad8&hm=8a69d285649807dcace56e428a272b6fb978449e4b6006c85fc5ef922bb67857&",
    "https://cdn.discordapp.com/attachments/1473570048479199338/1485591439474950174/image9.gif?ex=69c26c58&is=69c11ad8&hm=092b8b0a60ec8fa143de4dcb513e4d5949f58fa36518d02480288b62715389ec&",
  ],
  blush: [
    "https://cdn.discordapp.com/attachments/1473570111641223289/1485591517509980210/image0.gif?ex=69c26c6a&is=69c11aea&hm=ced6e58453b20ec77f24793b7f1abaa729363131ff91a1c722f95017bbd2ca2d&",
    "https://cdn.discordapp.com/attachments/1473570111641223289/1485591518075945031/image1.gif?ex=69c26c6a&is=69c11aea&hm=00b8c1c1108319612db8589f377918d2b2b7dfae1d136e720abfab4a88740b9f&",
    "https://cdn.discordapp.com/attachments/1473570111641223289/1485591518646632589/image2.gif?ex=69c26c6b&is=69c11aeb&hm=83152f909661b31087b4b3e894c1f6a19af74161491e3cd0fd426e87a09d7658&",
    "https://cdn.discordapp.com/attachments/1473570111641223289/1485591519053217863/image3.gif?ex=69c26c6b&is=69c11aeb&hm=cb5c17f2e9ddb421c75a1442afe0b64eb60c731b505723d0fcdf2ba8b24daeb1&",
    "https://cdn.discordapp.com/attachments/1473570111641223289/1485591519493885952/image4.gif?ex=69c26c6b&is=69c11aeb&hm=ac27d81eb32fba19d54fd916eb21a3431791d5420de0ce6f8036f90c8798d3f2&",
    "https://cdn.discordapp.com/attachments/1473570111641223289/1485591519842009188/image5.gif?ex=69c26c6b&is=69c11aeb&hm=888b36455aef5cb7dac98302a7406ff10156060edb020f580717bb31f438b97e&",
    "https://cdn.discordapp.com/attachments/1473570111641223289/1485591520231817421/image6.gif?ex=69c26c6b&is=69c11aeb&hm=805830361e413a79d8576f797426380cfc1e440fc95f9bac2fc033f66555097f&",
    "https://cdn.discordapp.com/attachments/1473570111641223289/1485591520630407231/image7.gif?ex=69c26c6b&is=69c11aeb&hm=02752cddd8da9a6064750e7991ccd3e303c724d71388da3f5b0f33536c9cc24b&",
    "https://cdn.discordapp.com/attachments/1473570111641223289/1485591520978407456/image8.gif?ex=69c26c6b&is=69c11aeb&hm=2b60666faeb51bf04911df4d8892f3bda510a9d9a5735c3c697da2b15e94f1e9&",
    "https://cdn.discordapp.com/attachments/1473570111641223289/1485591521318404096/image9.gif?ex=69c26c6b&is=69c11aeb&hm=f46c6fdcea94252d146cc63d962f7f2c576628a6362758d6216e7cb82de7d2b1&",
  ],
  smile: [
    "https://cdn.discordapp.com/attachments/1473570154490364116/1485591626603696271/image0.gif?ex=69c26c84&is=69c11b04&hm=fc9e31e8c6bf6467dc2f6e7bfe3595b6568822547ec49eead50c8d88efece6d5&",
    "https://cdn.discordapp.com/attachments/1473570154490364116/1485591627186835487/image1.gif?ex=69c26c84&is=69c11b04&hm=46c671967185bab8a5405065896c6ada073a70058312ee6f9d56d54839bb0e56&",
    "https://cdn.discordapp.com/attachments/1473570154490364116/1485591627710992464/image2.gif?ex=69c26c85&is=69c11b05&hm=f3951d6718768fc2210c49c0d6a178f822c9c66c83d6dd7a85d8f03dcdcb7213&",
    "https://cdn.discordapp.com/attachments/1473570154490364116/1485591628608569425/image3.gif?ex=69c26c85&is=69c11b05&hm=b77c4a728d5680a36889aee0b8f85fc0d114621ca7161ffb50ad349b50ac6e73&",
    "https://cdn.discordapp.com/attachments/1473570154490364116/1485591629250302062/image4.gif?ex=69c26c85&is=69c11b05&hm=725c0d16e445e5a0ed223e893d9ffd17a7a9d5696f7ac65a02b451406ecc4c71&",
    "https://cdn.discordapp.com/attachments/1473570154490364116/1485591629828984932/image5.gif?ex=69c26c85&is=69c11b05&hm=c0632c52ce62dcfea7657e3fbf2dc332cb3aa7469fac6374bac61bd60febde05&",
    "https://cdn.discordapp.com/attachments/1473570154490364116/1485591630596673546/image6.gif?ex=69c26c85&is=69c11b05&hm=234c2c64f6e9b6d8925215fc4c29f30d3fc438bae22a1ec8974a677132d3b6f0&",
    "https://cdn.discordapp.com/attachments/1473570154490364116/1485591631116636272/image7.gif?ex=69c26c85&is=69c11b05&hm=2a63180a73b308bd7a8d1ae255cfe8cdc6ca21d115a71a5541b423f85130bb7e&",
    "https://cdn.discordapp.com/attachments/1473570154490364116/1485591631393722429/image8.gif?ex=69c26c85&is=69c11b05&hm=9c4caefdbc6fa31c2ed2f929e3112bcffd123c85f77c4622f785f44e3c94900b&",
    "https://cdn.discordapp.com/attachments/1473570154490364116/1485591631708160130/image9.gif?ex=69c26c85&is=69c11b05&hm=0853afcfe680ef38f460a08a57454bec4a539f4ea3a040f4df184395553dbb11&",
  ],
  highfive: [
    "https://cdn.discordapp.com/attachments/1473569092035412171/1473610209904693309/image0.gif?ex=69c25774&is=69c105f4&hm=5f31bb9075a539427bf0cfa4d8473e3aaa6c137e63960dbf9405928377273e38&",
    "https://cdn.discordapp.com/attachments/1473569092035412171/1473610210437365772/image1.gif?ex=69c25774&is=69c105f4&hm=8aff323b61cdfa172b48b6955f39a7b051a643f4f72d136941c557896e80ef41&",
    "https://cdn.discordapp.com/attachments/1473569092035412171/1473610210974240893/image2.gif?ex=69c25774&is=69c105f4&hm=d4a193e0919e9a08cf96909eed1302a9afa3e48b42a8958b7761681a832e3132&",
    "https://cdn.discordapp.com/attachments/1473569092035412171/1473610211313844284/image3.gif?ex=69c25774&is=69c105f4&hm=762b74c8ce9c764cd2b6ea1cd294a5c281885f51ed02488c043068eb4d72b11d&",
    "https://cdn.discordapp.com/attachments/1473569092035412171/1473610211867627623/image4.gif?ex=69c25774&is=69c105f4&hm=713cdde71a153b4611f80d3931827a7404932542e12e23782e489c200b7fce7c&",
    "https://cdn.discordapp.com/attachments/1473569092035412171/1473610212257562725/image5.gif?ex=69c25774&is=69c105f4&hm=71a10f1fd629c8e47d2ca9516bb78a0527c6d65efc7bfefd92e42e610e6d99e1&",
    "https://cdn.discordapp.com/attachments/1473569092035412171/1473610212597567662/image6.gif?ex=69c25775&is=69c105f5&hm=8c0049e30c5a529a46159527dbd5b3bf89f082f5eb6d2db5b97bbad19052bf91&",
    "https://cdn.discordapp.com/attachments/1473569092035412171/1473610212962340864/image7.gif?ex=69c25775&is=69c105f5&hm=f93d1b9bf1d3357fc5bc854e6e32d4df97f7f51f83c0a4a968704aafd63ef12d&",
    "https://cdn.discordapp.com/attachments/1473569092035412171/1473610213297754266/image8.gif?ex=69c25775&is=69c105f5&hm=d0db94478927dcc243381f048cfa22a2692d93928483a304773bcc099517b60f&",
    "https://cdn.discordapp.com/attachments/1473569092035412171/1473610213612589186/image9.gif?ex=69c25775&is=69c105f5&hm=4bf1612c11fcdfa9a7dbc23a43486a06843402766d870dcd2626933473f0ecf2&",
  ],
  bonk: [
    "https://cdn.discordapp.com/attachments/1473569167339945994/1473610327752048711/image0.gif?ex=69c25790&is=69c10610&hm=bbe7a3649f844024031caccc6cb05f39f0687ea3e90b8e196f20bfe60caa1881&",
    "https://cdn.discordapp.com/attachments/1473569167339945994/1473610328427200553/image1.gif?ex=69c25790&is=69c10610&hm=8e0b4629ccbc21101f7d244c4709450701f22dc355fa06cc387f16cf5011d0b5&",
    "https://cdn.discordapp.com/attachments/1473569167339945994/1473610329157140562/image2.gif?ex=69c25790&is=69c10610&hm=239424a77b15266cbc1b4bdecd9bed43a5037c30b1a4e3ff91d0591da109d685&",
    "https://cdn.discordapp.com/attachments/1473569167339945994/1473610329710792724/image3.gif?ex=69c25790&is=69c10610&hm=aafe4ec45b965df98414521149b60621262e2aab37e1b95db25c172a66f075ed&",
    "https://cdn.discordapp.com/attachments/1473569167339945994/1473610330314903592/image4.gif?ex=69c25791&is=69c10611&hm=769f20bbe76781f3a875716a9f54492402d8c41bc65a2639249072d370f5f9e1&",
    "https://cdn.discordapp.com/attachments/1473569167339945994/1473610330709037168/image5.gif?ex=69c25791&is=69c10611&hm=26e4c64ccc3434a0bfebb81cf3333cc0e008f8cff0677b59147242240d515203&",
    "https://cdn.discordapp.com/attachments/1473569167339945994/1473610331170541578/image6.gif?ex=69c25791&is=69c10611&hm=aaecaf94cd7325fe436fd853499effb6a606e13a0b6f85b9bf5de90b16a863e3&",
    "https://cdn.discordapp.com/attachments/1473569167339945994/1473610331506081832/image7.gif?ex=69c25791&is=69c10611&hm=5884e39143612028fbe9ec85e87343078f31c92fd14b5678c216210da9a3b091&",
    "https://cdn.discordapp.com/attachments/1473569167339945994/1473610331870990397/image8.gif?ex=69c25791&is=69c10611&hm=94ed9d9c53529323a02144940d4f79249b0f70d7b582f5e2ffb4624320c82a63&",
    "https://cdn.discordapp.com/attachments/1473569167339945994/1473610332189491220/image9.gif?ex=69c25791&is=69c10611&hm=8012760b23497661316bf8c5e9e8fae41a85e66bb31d1816ac2252d5cef40818&",
  ],
  yeet: [
    "https://cdn.discordapp.com/attachments/1473569232322166886/1473610463651696641/image0.gif?ex=69c257b0&is=69c10630&hm=3877e2e5e6484fc2fbe27c49e9ef6ed539128310506913bdfedf52c7c7e85e4b&",
    "https://cdn.discordapp.com/attachments/1473569232322166886/1473610464129978419/image1.gif?ex=69c257b1&is=69c10631&hm=97b549076ce1a0b08a8dcd21c3ccb7f279539a05af0564fdf0b2c416fba2ca0e&",
    "https://cdn.discordapp.com/attachments/1473569232322166886/1473610464452804699/image2.gif?ex=69c257b1&is=69c10631&hm=e38a4371031bdaa10be68b3a773398d37b7802f596c59a2fad5848aed3d428ae&",
    "https://cdn.discordapp.com/attachments/1473569232322166886/1473610464779829319/image3.gif?ex=69c257b1&is=69c10631&hm=666e683e24b44c95fafdfee58569b29e340428e78494ffed6d585205f463be87&",
    "https://cdn.discordapp.com/attachments/1473569232322166886/1473610465115508827/image4.gif?ex=69c257b1&is=69c10631&hm=2e829d3dc324123b4f76b843d201f1f601753b5372b8b0181c73640b297b7e89&",
    "https://cdn.discordapp.com/attachments/1473569232322166886/1473610465434407044/image5.gif?ex=69c257b1&is=69c10631&hm=873062d57dbf41201135bca27265c247cf10c26e375bdb0de20c7dcc81e8c3eb&",
    "https://cdn.discordapp.com/attachments/1473569232322166886/1473610465710968986/image6.gif?ex=69c257b1&is=69c10631&hm=e6b55e78c8896984c4e372602553836c9ceabdaab047bb47664d037250a72315&",
    "https://cdn.discordapp.com/attachments/1473569232322166886/1473610466101035079/image7.gif?ex=69c257b1&is=69c10631&hm=625d1ae217d3b7c41248c2fe186243f1445c3091eb5e2949f7118b3d0be4155c&",
    "https://cdn.discordapp.com/attachments/1473569232322166886/1473610466537377873/image8.gif?ex=69c257b1&is=69c10631&hm=dadf306366e7930b163a13472fa4859f2e6f7930fa20f2264b37e8711ff69cba&",
    "https://cdn.discordapp.com/attachments/1473569232322166886/1473610466969256007/image9.gif?ex=69c257b1&is=69c10631&hm=9eb5bb37068b3be2e64d92a317058078dc453392da100bde4ba5c77fc77cd35f&",
  ],
  punch: [
    "https://cdn.discordapp.com/attachments/1473569262269632533/1473610734138032231/image0.gif?ex=69c257f1&is=69c10671&hm=2ef648018f49fd7c3e3cb50b4fe7d98228cf8ec5d920793cadf2eeff54c9dc94&",
    "https://cdn.discordapp.com/attachments/1473569262269632533/1473610734515654697/image1.gif?ex=69c257f1&is=69c10671&hm=735f3c7bc298b0ce843c997afd513565d71cf7c5a520a3f64c4f0603dbdb8a43&",
    "https://cdn.discordapp.com/attachments/1473569262269632533/1473610734947536916/image2.gif?ex=69c257f1&is=69c10671&hm=a4fea14e6bcddf61fea6187d38ba36a9b44501237935c5e40a55411d12aca6ea&",
    "https://cdn.discordapp.com/attachments/1473569262269632533/1473610735241134193/image3.gif?ex=69c257f1&is=69c10671&hm=5119ff3606c3a0e15ecf1cf6be5f0ef2fd274cd998f3d85bd7e672253e97ee48&",
    "https://cdn.discordapp.com/attachments/1473569262269632533/1473610735539060736/image4.gif?ex=69c257f1&is=69c10671&hm=8d6efe458a44d1bba1458eecd2e9e2b921db557cbe0075582dd3cc576536fa09&",
    "https://cdn.discordapp.com/attachments/1473569262269632533/1473610735933194343/image5.gif?ex=69c257f1&is=69c10671&hm=c1457d9022b22bdd46fc1656897dabecc1e0f375b1218a325e0a48d55ecfa665&",
    "https://cdn.discordapp.com/attachments/1473569262269632533/1473610736264675431/image6.gif?ex=69c257f1&is=69c10671&hm=bb65448310f17941249b2511cb319afd768be0a03a585b3cb03e09ccbadbc64f&",
    "https://cdn.discordapp.com/attachments/1473569262269632533/1473610736659075188/image7.gif?ex=69c257f1&is=69c10671&hm=6b5763119641bd4796e2aafc31fda8ffd7222c2eee3d148c4aa985d6856858a0&",
    "https://cdn.discordapp.com/attachments/1473569262269632533/1473610736960798928/image8.gif?ex=69c257f2&is=69c10672&hm=020e18ab326a7d0b641da9da1b2498b61b14ef22772504e19ce3b485dbbadd07&",
    "https://cdn.discordapp.com/attachments/1473569262269632533/1473610737292279838/image9.gif?ex=69c257f2&is=69c10672&hm=8b1a08ca98f634db5c8919a348662fa58056192b4da75ef6ccfb9537df5613af&",
  ],
  kill: [
    "https://cdn.discordapp.com/attachments/1473569316115845160/1473611028565852302/image0.gif?ex=69c25837&is=69c106b7&hm=4eb3ed8aa9ccf90bfa9205835c3d91a74fce56c8673fc2ebe6ab57ed3c224bac&",
    "https://cdn.discordapp.com/attachments/1473569316115845160/1473611028901400586/image1.gif?ex=69c25837&is=69c106b7&hm=9d147b18965ce88138f74408e868317f02e0be63a5dda8bc862e092b77b1c33d&",
    "https://cdn.discordapp.com/attachments/1473569316115845160/1473611029266042891/image2.gif?ex=69c25837&is=69c106b7&hm=e0735dab54974824f2e89a281aea1f87502c35f1eb1ea7dd25b61a33ecea2cce&",
    "https://cdn.discordapp.com/attachments/1473569316115845160/1473611029580873748/image3.gif?ex=69c25837&is=69c106b7&hm=073abd842fa3d510827a46be786c5aa62e443ab0f449de103411b177dd37e390&",
    "https://cdn.discordapp.com/attachments/1473569316115845160/1473611029937262622/image4.gif?ex=69c25837&is=69c106b7&hm=d5b0fb5ea8aa8472a6b8b25ffb08d283b001e88a5911ea1fcf6d894842097ed1&",
    "https://cdn.discordapp.com/attachments/1473569316115845160/1473611030247637085/image5.gif?ex=69c25837&is=69c106b7&hm=65cb340cc43f1dc423cee388129a8286b5ffdbe2417f0f6026ab15f34274b94a&",
    "https://cdn.discordapp.com/attachments/1473569316115845160/1473611031044690021/image7.gif?ex=69c25838&is=69c106b8&hm=b51f7df025c30cf53c7be7d9cb7712596ce4c6f6d2fba0e9c27d09254d7064d1&",
    "https://cdn.discordapp.com/attachments/1473569316115845160/1473611031464116294/image8.gif?ex=69c25838&is=69c106b8&hm=63ae2f2af0b8d055f0c41895695ceee9b0f52c45d746b091418fa29991d04bee&",
    "https://cdn.discordapp.com/attachments/1473569316115845160/1473611031820636324/image9.gif?ex=69c25838&is=69c106b8&hm=b8803cc9f47f0e02c96e69392310cfe4a79a250f59e21d60ab0d43de75e86026&",
    "https://cdn.discordapp.com/attachments/1473569316115845160/1473611081422340106/image0.gif?ex=69c25844&is=69c106c4&hm=690197c777c165e1b80d089df0d43405707724982282162e308fe3741692f664&",
  ],
  wink: [
    "https://cdn.discordapp.com/attachments/1473569355039248466/1485588993969229842/image0.gif?ex=69c26a11&is=69c11891&hm=a7a5be00b6b73a842052c1195a84e9e1d9ad11ba478e4a98f970e736adcdcd31&",
    "https://cdn.discordapp.com/attachments/1473569355039248466/1485588994656960592/image1.gif?ex=69c26a11&is=69c11891&hm=85b7b7d0cb4f016f04735d41d71761af7a1d1fa995e1378ecf165de7ea13b814&",
    "https://cdn.discordapp.com/attachments/1473569355039248466/1485588995412070441/image2.gif?ex=69c26a11&is=69c11891&hm=36877a48912a53634a7bac6f9ea24d420f731252332a562a6b9bf71c600a6ac5&",
    "https://cdn.discordapp.com/attachments/1473569355039248466/1485588997077205132/image3.gif?ex=69c26a11&is=69c11891&hm=296ba5ccd9c059fe09f0875c26e75ac6b6bf565e29c628a8747866062bf72598&",
    "https://cdn.discordapp.com/attachments/1473569355039248466/1485588998306009209/image4.gif?ex=69c26a12&is=69c11892&hm=e50a59e41294f2c923b551c4299e6e78d3ea93e4f43956709fd9042f6dd537e6&",
    "https://cdn.discordapp.com/attachments/1473569355039248466/1485588999119573123/image5.gif?ex=69c26a12&is=69c11892&hm=fe04514b7e39bd8f5d8743a11537a7f2b09bf89a3ba5b41790f915d6fae6fb7d&",
    "https://cdn.discordapp.com/attachments/1473569355039248466/1485588999795114085/image6.gif?ex=69c26a12&is=69c11892&hm=f0388d5df22b5959e66c789b51bff38bb7b445a85d79d1217e9ea091df9499e3&",
    "https://cdn.discordapp.com/attachments/1473569355039248466/1485589000679854080/image7.gif?ex=69c26a12&is=69c11892&hm=604fc6ee437aaf4ac63c8b2b1c465139d2497f258bd715f7678defa056d6447d&",
    "https://cdn.discordapp.com/attachments/1473569355039248466/1485589001611120760/image8.gif?ex=69c26a12&is=69c11892&hm=e179a452cf5880a5e837afc113c1f93a285cc05d531c036cfffb9b733793c38a&",
    "https://cdn.discordapp.com/attachments/1473569355039248466/1485589002324017217/image9.gif?ex=69c26a13&is=69c11893&hm=f1328001e71ae42bb9ad51dad3c838a3795f48e144908e1182ed35c5d0285822&",
  ],
  pout: [
    "https://cdn.discordapp.com/attachments/1473570260232831110/1485591698460508170/image0.gif?ex=69c26c95&is=69c11b15&hm=93c73a3b77c7f6f42630ad5003db51c048494317bdc74eb7456354cd7bde55cf&",
    "https://cdn.discordapp.com/attachments/1473570260232831110/1485591698783342622/image1.gif?ex=69c26c95&is=69c11b15&hm=746203644ce6f59526710044ac861be46d32f93dff6fa1b8f61ca544189b459e&",
    "https://cdn.discordapp.com/attachments/1473570260232831110/1485591699119149117/image2.gif?ex=69c26c96&is=69c11b16&hm=cc28bfcd879caa4ff2d099066f197944ed582e33d501ed4d1c30a5523ba37286&",
    "https://cdn.discordapp.com/attachments/1473570260232831110/1485591699500564530/image3.gif?ex=69c26c96&is=69c11b16&hm=5a4b107ae0e2f50dc5c738e7c9e1deae66229f118c0b593e02894542b4c90485&",
    "https://cdn.discordapp.com/attachments/1473570260232831110/1485591699848695908/image4.gif?ex=69c26c96&is=69c11b16&hm=db849c5233bbdb574777628ed7d840464a37bdc145012a102246572c43d3c4a0&",
    "https://cdn.discordapp.com/attachments/1473570260232831110/1485591700217921677/image5.gif?ex=69c26c96&is=69c11b16&hm=d96107130a46f22e4bcf00e8d38e510ea3c3e9c688dfd689d6260591393f0a4f&",
    "https://cdn.discordapp.com/attachments/1473570260232831110/1485591700528304138/image6.gif?ex=69c26c96&is=69c11b16&hm=17a7cfd33c96674b118c743784320efec26586d6c29748ae7ee17413e25abc1e&",
    "https://cdn.discordapp.com/attachments/1473570260232831110/1485591700859785216/image7.gif?ex=69c26c96&is=69c11b16&hm=d93fba75889812c55282c6ea7fa69b57bd845344bd76c4c1580cffaed029527c&",
    "https://cdn.discordapp.com/attachments/1473570260232831110/1485591701174091918/image8.gif?ex=69c26c96&is=69c11b16&hm=387add65a349aafe334f83503b1c586c467bfee8b47d22c8a9fb67b9c74bdf31&",
    "https://cdn.discordapp.com/attachments/1473570260232831110/1485591701480538153/image9.gif?ex=69c26c96&is=69c11b16&hm=9e5c929a20fca4da3667b44421e44013dadd94958ed8ef43d974d9525e2ae60b&",
  ],
  laugh: [
    "https://cdn.discordapp.com/attachments/1473570381272055901/1485591839485464596/image0.gif?ex=69c26cb7&is=69c11b37&hm=e94addde1158746ac93bfa07b3d7a9f9e266c7e6a6a47cf50bd3bd81b06d703c&",
    "https://cdn.discordapp.com/attachments/1473570381272055901/1485591839821004931/image1.gif?ex=69c26cb7&is=69c11b37&hm=c355571ea9fc0ad268beca69773284e7223b0de45eac7ead1f8f545f80af2193&",
    "https://cdn.discordapp.com/attachments/1473570381272055901/1485591840152485969/image2.gif?ex=69c26cb7&is=69c11b37&hm=d78342e72586cdded15215a29339abe3ff27ed56c71900a066ada3311e83fc42&",
    "https://cdn.discordapp.com/attachments/1473570381272055901/1485591840458543235/image3.gif?ex=69c26cb7&is=69c11b37&hm=e10f0788dcde465ce0cae1f981ff0ca54fa68cbe28db9269ecf51f7016ef0a7d&",
    "https://cdn.discordapp.com/attachments/1473570381272055901/1485591840802472038/image4.gif?ex=69c26cb7&is=69c11b37&hm=ac664f3c9897ad93074583cf0cf4bb1cfd9f3de855c9f95be9b792d184f802f1&",
    "https://cdn.discordapp.com/attachments/1473570381272055901/1485591841335279766/image5.gif?ex=69c26cb7&is=69c11b37&hm=5ae26c37ad657db535b53515eae7e54e70acbd675fd8ba60a02c3ad8c17cd7f2&",
    "https://cdn.discordapp.com/attachments/1473570381272055901/1485591841725485178/image6.gif?ex=69c26cb8&is=69c11b38&hm=e661b1f590a534d2b5f749c4f474bc3f1deddbe17eb5f08050e821ad2346ed16&",
    "https://cdn.discordapp.com/attachments/1473570381272055901/1485591842123677736/image7.gif?ex=69c26cb8&is=69c11b38&hm=3503f87bef532fb949c421157750af8d6d27781e05de083c16ee674e681987db&",
    "https://cdn.discordapp.com/attachments/1473570381272055901/1485591842451095592/image8.gif?ex=69c26cb8&is=69c11b38&hm=1270081585a81f0b1875ad6533fbe6a2113eb5c72bfaf0f8bdc1958c417dc6e1&",
    "https://cdn.discordapp.com/attachments/1473570381272055901/1485591842941567006/image9.gif?ex=69c26cb8&is=69c11b38&hm=641010f24829c5034ca1c9580aad68d5a90859eacc01fa88de8684d827954e4e&",
  ],
  confused: [
    "https://cdn.discordapp.com/attachments/1473570472539980042/1485591909094391828/image0.gif?ex=69c26cc8&is=69c11b48&hm=4f498d5a14dadfc22ef5c20604ace2c53ed17413fbe38304888590fd3444c5ab&",
    "https://cdn.discordapp.com/attachments/1473570472539980042/1485591909576478881/image1.gif?ex=69c26cc8&is=69c11b48&hm=cffad40a14e03105ce915979ba7ec2475e4d2d43629ae954a436e449d089a327&",
    "https://cdn.discordapp.com/attachments/1473570472539980042/1485591909991976990/image2.gif?ex=69c26cc8&is=69c11b48&hm=36d9c8c1a7ca2ddd9e06b4bc6b882e5f30ff12eea7127d77af9df1622ce20048&",
    "https://cdn.discordapp.com/attachments/1473570472539980042/1485591910507872306/image3.gif?ex=69c26cc8&is=69c11b48&hm=710b59458c00b655cf1c2c9eb05057257d253e6673f2f5b13e2413b64211e545&",
    "https://cdn.discordapp.com/attachments/1473570472539980042/1485591911472304199/image4.gif?ex=69c26cc8&is=69c11b48&hm=82a519672be29ca2a12c4058d9aed0db9da8d78b565294ec61f9b6485d451fb6&",
    "https://cdn.discordapp.com/attachments/1473570472539980042/1485591912105771008/image5.gif?ex=69c26cc8&is=69c11b48&hm=4120920086678739caf7dedb32a649badb141ad5551a31fbc750e42deae85997&",
    "https://cdn.discordapp.com/attachments/1473570472539980042/1485591912583794749/image6.gif?ex=69c26cc8&is=69c11b48&hm=31d702ead2d6b1615f618ea093e6cf9db75ce2dae973076208e2546caa8afc6f&",
    "https://cdn.discordapp.com/attachments/1473570472539980042/1485591912974127144/image7.gif?ex=69c26cc9&is=69c11b49&hm=f830e9fb3cbb56640f09cc7537ab5c1212da5cf13ef7b4eb64e469231f285fe7&",
    "https://cdn.discordapp.com/attachments/1473570472539980042/1485591913414262844/image8.gif?ex=69c26cc9&is=69c11b49&hm=02d1fa958f76bb6b27da0be39276d93361e93e35bf49401388c68fa84a751dcd&",
    "https://cdn.discordapp.com/attachments/1473570472539980042/1485591914270167050/image9.gif?ex=69c26cc9&is=69c11b49&hm=bd713751d125c2daf6c88a59a4909f72499d825d974b60d102accaedc09fe1cf&",
  ],
  sleep: [
    "https://cdn.discordapp.com/attachments/1473570562705195058/1485591963574210570/image0.gif?ex=69c26cd5&is=69c11b55&hm=78af21b99d0b289f255bc1df69ee1a94f86f1d1bd38ae6b91fae4151fe7fd444&",
    "https://cdn.discordapp.com/attachments/1473570562705195058/1485591964010156122/image1.gif?ex=69c26cd5&is=69c11b55&hm=3243fc8856b2e4b9e71db3ed59ae54b7f601250fa84e8ac07c297ee7b3592661&",
    "https://cdn.discordapp.com/attachments/1473570562705195058/1485591964412940328/image2.gif?ex=69c26cd5&is=69c11b55&hm=df6b529f4c3f1e0639f90315b0dbdd5ed4b134c217fd9eb4c2313f3b30917b5a&",
    "https://cdn.discordapp.com/attachments/1473570562705195058/1485591964786364458/image3.gif?ex=69c26cd5&is=69c11b55&hm=3533536acc0cf17a17ff6450a53af43d9d08435227a8421491331d91d9c17e62&",
    "https://cdn.discordapp.com/attachments/1473570562705195058/1485591965058728038/image4.gif?ex=69c26cd5&is=69c11b55&hm=03cc29604bb8060d004f7f52082dbaec1fc539fd03a22e75a4bb36f7cd73b0ab&",
    "https://cdn.discordapp.com/attachments/1473570562705195058/1485591965457453096/image5.gif?ex=69c26cd5&is=69c11b55&hm=3bb566f82a4c63c711cc8949b223a3b6eb78ac0c1192ba86b8454c244bf34fe8&",
    "https://cdn.discordapp.com/attachments/1473570562705195058/1485591965910433853/image6.gif?ex=69c26cd5&is=69c11b55&hm=699afb0f8de0415740d64aac5ccd5640804d118337b7b52db196de144a6f8914&",
    "https://cdn.discordapp.com/attachments/1473570562705195058/1485591966451368096/image7.gif?ex=69c26cd5&is=69c11b55&hm=0108e00c5cefa4c5e2b408eea68132632b2b42c6817e8cabc35834436fb28cc4&",
    "https://cdn.discordapp.com/attachments/1473570562705195058/1485591966920999023/image8.gif?ex=69c26cd5&is=69c11b55&hm=3f735a6235c17c4815633498c1334179127377cf6f75fb6322f1cb373188116f&",
    "https://cdn.discordapp.com/attachments/1473570562705195058/1485591974647042088/image9.gif?ex=69c26cd7&is=69c11b57&hm=0af37b6b49c3d304732a6dd6807baa5a508b7a331eb27d7b95eab5ecfe39513a&",
  ],
  run: [
    "https://cdn.discordapp.com/attachments/1473570594028261388/1485592064849612820/image0.gif?ex=69c26ced&is=69c11b6d&hm=14d0868595553fb47f0df15c022ba01221a295ba4351e2b2f54bf845c54d909f&",
    "https://cdn.discordapp.com/attachments/1473570594028261388/1485592065101529169/image1.gif?ex=69c26ced&is=69c11b6d&hm=5243b7fe3203ab93826c222752b9ab83277f28058b36135450d4d88d909aa885&",
    "https://cdn.discordapp.com/attachments/1473570594028261388/1485592177047371816/image2.gif?ex=69c26d07&is=69c11b87&hm=4643255833f0a43fda2a3a37e45780519f9cb8f79da666099e955fdbcb7af9ed&",
    "https://cdn.discordapp.com/attachments/1473570594028261388/1485592177386983455/image3.gif?ex=69c26d08&is=69c11b88&hm=53dee80d5cc8fd5a733857d596c2a86a18d7a555851b100ca9907be23382bec9&",
    "https://cdn.discordapp.com/attachments/1473570594028261388/1485592176338669719/image1.gif?ex=69c26d07&is=69c11b87&hm=f3fdb56d9a452e3e3c51b803f79601b94907f7aa47a6194b471bf5935e367697&",
    "https://cdn.discordapp.com/attachments/1473570594028261388/1485592066078674944/image4.gif?ex=69c26ced&is=69c11b6d&hm=60db2e5b4efa951991781cdb8129811d9e3f81435f2b535dbbad8aa17a748c65&",
    "https://cdn.discordapp.com/attachments/1473570594028261388/1485592066925924472/image7.gif?ex=69c26ced&is=69c11b6d&hm=5bf49c8d04fcece0bdec6fa11a86ef08c2371a9d6e50142b65a4d1342cb669ff&",
    "https://cdn.discordapp.com/attachments/1473570594028261388/1485592067504607313/image9.gif?ex=69c26ced&is=69c11b6d&hm=72f36c6f5cad17aff67dfb8dede5c7b55e16b536c5338f28e4ca95c7dd4454cc&",
    "https://cdn.discordapp.com/attachments/1473570594028261388/1485592065395134524/image2.gif?ex=69c26ced&is=69c11b6d&hm=f6097c30da77290f4ef1e920eb80bcae1cf60f8a929744dbe206d447e6d79ed7&",
    "https://cdn.discordapp.com/attachments/1473570594028261388/1485592065709572186/image3.gif?ex=69c26ced&is=69c11b6d&hm=5e06b5055d1b4783914c0a447156c1952c057e4adfdce8c3497f1152a9d54e32&",
  ],
  lick: [
    "https://cdn.discordapp.com/attachments/1473569482252353638/1485590289367302206/image2.gif?ex=69c26b45&is=69c119c5&hm=33d42ab5380e73937e89fba72f60f0a0154a9279c30c369c001e690609228dcd&",
    "https://cdn.discordapp.com/attachments/1473569482252353638/1485590290428596224/image4.gif?ex=69c26b46&is=69c119c6&hm=65041811654b29cd4b04107a8c2d1eacb741e13b3c5bf5b07e6ef976062b34f4&",
    "https://cdn.discordapp.com/attachments/1473569482252353638/1485590288843145436/image1.gif?ex=69c26b45&is=69c119c5&hm=93fd66eea5b81c792c6bb838f892ca0e53604e66d86d6404aae966d49da59935&",
    "https://cdn.discordapp.com/attachments/1473569482252353638/1485590208622759946/image2.gif?ex=69c26b32&is=69c119b2&hm=45f1d963815a42b6a3e6207c70f806a518f54e746fe0a633da0992a39927e097&",
    "https://cdn.discordapp.com/attachments/1473569482252353638/1485590209344049153/image4.gif?ex=69c26b32&is=69c119b2&hm=ea0db3dbfea179b40b913da5c68e4cbddde0c82a5faafd8eb083bafd4308ea5b&",
    "https://cdn.discordapp.com/attachments/1473569482252353638/1485590208971014164/image3.gif?ex=69c26b32&is=69c119b2&hm=15deddfd56120aa578693a30e4b4eafd0cbac40f0a3e2fa7ffffce8859fb713d&",
    "https://cdn.discordapp.com/attachments/1473569482252353638/1485590210757791864/image7.gif?ex=69c26b33&is=69c119b3&hm=0e8936ee29baac66ff90aa2831945ff2b1eba10c2f23478b77985dbae8f98978&",
    "https://cdn.discordapp.com/attachments/1473569482252353638/1485590211244326952/image8.gif?ex=69c26b33&is=69c119b3&hm=5b1bd37bf7a20191bfcf084bff166998d47c65dd76da227f7e8dbed396e7e394&",
    "https://cdn.discordapp.com/attachments/1473569482252353638/1485590207985094777/image0.gif?ex=69c26b32&is=69c119b2&hm=5e3668fa6f5ddbef27480b32e7a325a3192ceecd6bdf59c5b49aba8402e9c28c&",
    "https://cdn.discordapp.com/attachments/1473569482252353638/1485590208291405941/image1.gif?ex=69c26b32&is=69c119b2&hm=c054b468e92809b6e1f70b1d27d473084b32084e4fff90d8ad8c03831cda4243&",
  ],
  stare: [
    "https://cdn.discordapp.com/attachments/1473569521691394142/1485590287148388502/image0.gif?ex=69c26b45&is=69c119c5&hm=35314502cb9b813d51c560e4186026fd72cb0f8279c3fcb67309ae1705d608a8&",
    "https://cdn.discordapp.com/attachments/1473569521691394142/1485590287635185766/image1.gif?ex=69c26b45&is=69c119c5&hm=755584b26f5e9e70cdeea865f83d11d418ff971f7bed9393014071b10f78b51c&",
    "https://cdn.discordapp.com/attachments/1473569521691394142/1485590288079650926/image2.gif?ex=69c26b45&is=69c119c5&hm=4f82ee8fe77d8beec963996a3af71dc4affd2fd3a72bcd2f8a91a3695115ed56&",
    "https://cdn.discordapp.com/attachments/1473569521691394142/1485590288612462712/image3.gif?ex=69c26b45&is=69c119c5&hm=80e340feda154765feede75007a7b9c2a800e5051ab1356589177406a9f6d911&",
    "https://cdn.discordapp.com/attachments/1473569521691394142/1485590289052733470/image4.gif?ex=69c26b45&is=69c119c5&hm=27f1d12c190e871ce12d1aa242aa7a06258bc5dfc347ecb4a532218b4e7fd3ae&",
    "https://cdn.discordapp.com/attachments/1473569521691394142/1485590289774018560/image5.gif?ex=69c26b46&is=69c119c6&hm=fe4d3655f32bdaa983f1be0dc48d8afb084e3ba528475a086ec23625b8c63cc1&",
    "https://cdn.discordapp.com/attachments/1473569521691394142/1485590290021748796/image6.gif?ex=69c26b46&is=69c119c6&hm=d2488252c7f4d1bc2b9bdc218f209a0a1b6316100c160387a9285863596bbcfe&",
    "https://cdn.discordapp.com/attachments/1473569521691394142/1485590290323607613/image7.gif?ex=69c26b46&is=69c119c6&hm=6fe35fe7c08ea4335d6ec45baeeb0f56b099cec8977943c1c238d13c1f323f59&",
    "https://cdn.discordapp.com/attachments/1473569521691394142/1485590290763878490/image8.gif?ex=69c26b46&is=69c119c6&hm=86c6d981c7fe42fae18fc6dabb6558cb0ac79c5e5a022a1ea67e26407f023d6e&",
    "https://cdn.discordapp.com/attachments/1473569521691394142/1485590291300880404/image9.gif?ex=69c26b46&is=69c119c6&hm=6ea3ddf9c86de678fa1cd85927fb2e91d62788b1349bc2d46d152d1bd227eaa7&",
  ],
  thumbsup: [
    "https://cdn.discordapp.com/attachments/1473570702358478970/1485592285956800512/image0.gif?ex=69c26d21&is=69c11ba1&hm=f488972db519a8d6cb6e85f67477706e827d523d782bc47958d4229e3be1c4f3&",
    "https://cdn.discordapp.com/attachments/1473570702358478970/1485592286229172304/image1.gif?ex=69c26d22&is=69c11ba2&hm=71e945bf56710a51dae6ca8b19c2af60efd0b86c6fa736ec421c178646e52218&",
    "https://cdn.discordapp.com/attachments/1473570702358478970/1485592286502064239/image2.gif?ex=69c26d22&is=69c11ba2&hm=d0ddfbfd7d5dfd21b13af77dc20a5beece6e1d6c15c83837b2ae71b4431bd1d2&",
    "https://cdn.discordapp.com/attachments/1473570702358478970/1485592293556617287/image3.gif?ex=69c26d23&is=69c11ba3&hm=4cd5e1e2972c9a6718b31bb3e6e23fcabb5938f6b251dc4de77763e9399738e7&",
    "https://cdn.discordapp.com/attachments/1473570702358478970/1485592293980504124/image4.gif?ex=69c26d23&is=69c11ba3&hm=1d131e96b25d10c3f508938ef69d8604062f3426ffa3af38b140f0aaa54424ff&",
    "https://cdn.discordapp.com/attachments/1473570702358478970/1485592294508728430/image5.gif?ex=69c26d23&is=69c11ba3&hm=65c7db385a917e22471e37cbc02f75095186536d122b684a9db2cadf58943059&",
    "https://cdn.discordapp.com/attachments/1473570702358478970/1485592294852788264/image6.gif?ex=69c26d24&is=69c11ba4&hm=54e81bfaa2918e49f0446e731d02c80e06f7cbd3c2a2a647916e5a5736e7e69f&",
    "https://cdn.discordapp.com/attachments/1473570702358478970/1485592295402111006/image7.gif?ex=69c26d24&is=69c11ba4&hm=3f2cfe9c9057ecb3dee0ebf16e34663c0ec23676b2290c481581806ae8add21a&",
    "https://cdn.discordapp.com/attachments/1473570702358478970/1485592296052494428/image8.gif?ex=69c26d24&is=69c11ba4&hm=dc36a96a94c98375cda4396bbcab8d606ec157063b95ef47a1d2780cabfbfe85&",
    "https://cdn.discordapp.com/attachments/1473570702358478970/1485592296412942356/image9.gif?ex=69c26d24&is=69c11ba4&hm=0cc039845b3da8e9b7262c85b988e4f2d2f2a946b2237923f69142e3447d9ee9&",
  ],
  facepalm: [
    "https://cdn.discordapp.com/attachments/1473570862186893343/1485592388062937168/image0.gif?ex=69c26d3a&is=69c11bba&hm=c47af6b053a209610e39e5ac13ed587354129f0f90b5c411c908643e8ba2f9a5&",
    "https://cdn.discordapp.com/attachments/1473570862186893343/1485592388331245679/image1.gif?ex=69c26d3a&is=69c11bba&hm=f9e544fc7e69fa700f654c504803f92ae6b8422ce4e785777b263549631f62a2&",
    "https://cdn.discordapp.com/attachments/1473570862186893343/1485592388633104506/image2.gif?ex=69c26d3a&is=69c11bba&hm=fe364603d34185e091626bd9e6b9e4258b57da8a73460b08461175265cadf910&",
    "https://cdn.discordapp.com/attachments/1473570862186893343/1485592388910055555/image3.gif?ex=69c26d3a&is=69c11bba&hm=b814b869f55a85cfabefc5e7fa8f93c449febd92cb5dcddc53685648268905ea&",
    "https://cdn.discordapp.com/attachments/1473570862186893343/1485592389249663056/image4.gif?ex=69c26d3a&is=69c11bba&hm=1eee7ec241281b62748f6c5016261fd188ec111fe782773aaabc6e2851f9a27e&",
    "https://cdn.discordapp.com/attachments/1473570862186893343/1485592389799248012/image5.gif?ex=69c26d3a&is=69c11bba&hm=e5070de1c8f5c4a7cac340a0df30c958df2aafba86c3d8ef5eb64355c1725c35&",
    "https://cdn.discordapp.com/attachments/1473570862186893343/1485592390227071026/image6.gif?ex=69c26d3a&is=69c11bba&hm=2aeef348e4f81845363061b9a5c929f84db46b6080b16cd45444c829d41f07af&",
    "https://cdn.discordapp.com/attachments/1473570862186893343/1485592390516346980/image7.gif?ex=69c26d3a&is=69c11bba&hm=750e4b3bd3ffbc6dda6ea738dad2d96e088a789f5f52c2490766911373e85c8e&",
    "https://cdn.discordapp.com/attachments/1473570862186893343/1485592390852018297/image8.gif?ex=69c26d3a&is=69c11bba&hm=8ef4faebc35582b13f2d1b7e3eb2cc48f36fc18d4c0f23db2b6c99b591a4ab9d&",
    "https://cdn.discordapp.com/attachments/1473570862186893343/1485592391372116071/image9.gif?ex=69c26d3b&is=69c11bbb&hm=79a57c79e631597a7d757f013bffa3be614aafc25c46062f5925185c6ba50390&",
  ],
  shrug: [
    "https://cdn.discordapp.com/attachments/1473571000305188896/1485592477695082536/image0.gif?ex=69c26d4f&is=69c11bcf&hm=97364b05bacfd6c2ca61cb1bc19f0d33d9d13c31ba383b31023a9e0b37cd058e&",
    "https://cdn.discordapp.com/attachments/1473571000305188896/1485592477984358410/image1.gif?ex=69c26d4f&is=69c11bcf&hm=08d4fda9aaf3109e62ba66ec57620147f39f52e7fc5e70711b212ec4c3ad53ef&",
    "https://cdn.discordapp.com/attachments/1473571000305188896/1485592478265638975/image2.gif?ex=69c26d4f&is=69c11bcf&hm=0b9ab9831584f786d7837cf2d865fabc8e68f22d35b5d6299008981fc644f714&",
    "https://cdn.discordapp.com/attachments/1473571000305188896/1485592478672490496/image3.gif?ex=69c26d4f&is=69c11bcf&hm=ef03231a329fcd68535ce5f82837064bdd8faaea7b7c4cd33f2f28ab4a696d8f&",
    "https://cdn.discordapp.com/attachments/1473571000305188896/1485592479159025714/image4.gif?ex=69c26d50&is=69c11bd0&hm=b917584c808b99f0d75b1605d7bcdde61e5f53815482fb33277f33316e9f6897&",
    "https://cdn.discordapp.com/attachments/1473571000305188896/1485592479540576308/image5.gif?ex=69c26d50&is=69c11bd0&hm=86935b1233c15e334c2b7ea24a3f5a105bd7f8c402d59b3b8d39de577bbc7337&",
    "https://cdn.discordapp.com/attachments/1473571000305188896/1485592479846629437/image6.gif?ex=69c26d50&is=69c11bd0&hm=631ba750893eaee76155d86370a2bfd780b1daae0e9e6eca60060c2bca514a48&",
    "https://cdn.discordapp.com/attachments/1473571000305188896/1485592480236834876/image7.gif?ex=69c26d50&is=69c11bd0&hm=65f5ec5b0ca2eec7074ab005d39d30a62adf72a2cb3689f700aa30f5c75cb2df&",
    "https://cdn.discordapp.com/attachments/1473571000305188896/1485592480807387226/image8.gif?ex=69c26d50&is=69c11bd0&hm=028e385844b6247bd819f2110354745a73bca576cf99f1eff5b2fccd8baade5a&",
    "https://cdn.discordapp.com/attachments/1473571000305188896/1485592481256046642/image9.gif?ex=69c26d50&is=69c11bd0&hm=d4a955ddca0ec3361c8f2779b8d9247b3a97a11670069a87227c33baff1cc409&",
  ],
  boop: [
    "https://cdn.discordapp.com/attachments/1473569603673129043/1485590374687969360/image0.gif?ex=69c26b5a&is=69c119da&hm=c22013a9aec8dbca6776b78385eba990c9bfa0a92c76c666af6e47b5f72222ca&",
    "https://cdn.discordapp.com/attachments/1473569603673129043/1485590375321043035/image1.gif?ex=69c26b5a&is=69c119da&hm=b496389073c612b167397c533466aa66e20ab3612017720fae597cf89c5fd55d&",
    "https://cdn.discordapp.com/attachments/1473569603673129043/1485590375694471310/image2.gif?ex=69c26b5a&is=69c119da&hm=01eb193e3eb341e3cb5c49a8552b75cd9a1f0acd8d20ff949ad07b4601a11f9a&",
    "https://cdn.discordapp.com/attachments/1473569603673129043/1485590376197656657/image3.gif?ex=69c26b5a&is=69c119da&hm=730a994e390eb00c0585f24f0c01849bdd49a3199368861b875f13667681be1e&",
    "https://cdn.discordapp.com/attachments/1473569603673129043/1485590376822734928/image4.gif?ex=69c26b5a&is=69c119da&hm=8b291634af9413b29f72b76e20afb2623cf3e485e6738d47a2f413fdace9ddca&",
    "https://cdn.discordapp.com/attachments/1473569603673129043/1485590377422651433/image5.gif?ex=69c26b5a&is=69c119da&hm=9761dd914865f021eb526f8116de516a6b9b8f66c4bb4c3c09db7793ef34385a&",
    "https://cdn.discordapp.com/attachments/1473569603673129043/1485590378055864371/image6.gif?ex=69c26b5b&is=69c119db&hm=a14351a0e1c56a07b9f4803f1f917a12b0d50add2e29ea5a73a19e4d5fdb6cfe&",
    "https://cdn.discordapp.com/attachments/1473569603673129043/1485590378538336290/image7.gif?ex=69c26b5b&is=69c119db&hm=0738e9e4fe7519b91e4c98288e2279c8cc279447426f334e1b19e3bf543dea9f&",
    "https://cdn.discordapp.com/attachments/1473569603673129043/1485590379146379365/image8.gif?ex=69c26b5b&is=69c119db&hm=13b2f6a1fd66968b348c266a3b5cec6abfc27d919027906aad14bb258f3a1f09&",
    "https://cdn.discordapp.com/attachments/1473569603673129043/1485590379825987686/image9.gif?ex=69c26b5b&is=69c119db&hm=9a6c63ff62bdf0dd6b8ebc42c8747fbe3c32f46dee1a273155f2f861b2bf387b&",
  ],
  nom: [
    "https://cdn.discordapp.com/attachments/1473569649730781264/1485590745040814170/image0.gif?ex=69c26bb2&is=69c11a32&hm=17b843e1156e61edbd7ec917b2b7299d3d14ace916f6d2cbf5f14c2294620236&",
    "https://cdn.discordapp.com/attachments/1473569649730781264/1485590745602588742/image1.gif?ex=69c26bb2&is=69c11a32&hm=0acd87d62b603dbd3061be4090efceafdb2e16b772bcd553740bae8a35e0c9e1&",
    "https://cdn.discordapp.com/attachments/1473569649730781264/1485590746047447121/image2.gif?ex=69c26bb2&is=69c11a32&hm=2fb83f6cc6f1de3aea2b872fd98debaa04284174eeb51fd7f859aa4c8cff38d4&",
    "https://cdn.discordapp.com/attachments/1473569649730781264/1485590746672140408/image3.gif?ex=69c26bb2&is=69c11a32&hm=a8cd75e127e184790971823ebfbb7041456c0c7f7e4c7f49e489459964af53f7&",
    "https://cdn.discordapp.com/attachments/1473569649730781264/1485590747054084117/image4.gif?ex=69c26bb3&is=69c11a33&hm=699c6ce4350d9f78151d9ace79980058fec299ea96999a0e961f1176f8c40961&",
    "https://cdn.discordapp.com/attachments/1473569649730781264/1485590747620048966/image5.gif?ex=69c26bb3&is=69c11a33&hm=df1ccb4f06fdeb265e7c42076481571f5647d8e80e083467706f928cf6008243&",
    "https://cdn.discordapp.com/attachments/1473569649730781264/1485590748001992744/image6.gif?ex=69c26bb3&is=69c11a33&hm=15128fed3a54478aa9dc9c3a5def569c38c31abadb1bff02ae84e4f2251e9837&",
    "https://cdn.discordapp.com/attachments/1473569649730781264/1485590748593262592/image7.gif?ex=69c26bb3&is=69c11a33&hm=383144fed8ba97a5ba808052421246c7169e2c4b5feb4136dd98c4772b661c12&",
    "https://cdn.discordapp.com/attachments/1473569649730781264/1485590749222273044/image8.gif?ex=69c26bb3&is=69c11a33&hm=8c1e8e2eb67a48b9c794a1a484f19a43b374363259216ade99acc26bfefdf7b3&",
    "https://cdn.discordapp.com/attachments/1473569649730781264/1485590749851684964/image9.gif?ex=69c26bb3&is=69c11a33&hm=cda570b33a7b52c6fe88a95b367a8605a2a2e17369f8ee90e2ac53883d938e6c&",
  ],
  handhold: [
    "https://cdn.discordapp.com/attachments/1473569768014348329/1485590870450372659/image0.gif?ex=69c26bd0&is=69c11a50&hm=03a705cb525db170f0c5bd76ffbff8d4c897cfe06d3822a085120618eecb9776&",
    "https://cdn.discordapp.com/attachments/1473569768014348329/1485590870769143868/image1.gif?ex=69c26bd0&is=69c11a50&hm=c28959d44c1f29675c51e33e66838fc7a290900ef8b655314b062e2fa66a7598&",
    "https://cdn.discordapp.com/attachments/1473569768014348329/1485590871121596486/image2.gif?ex=69c26bd0&is=69c11a50&hm=cf6925a4a8f46cfc683ca3a081da8475afbb2df5100b47dd0294119bf96a47b6&",
    "https://cdn.discordapp.com/attachments/1473569768014348329/1485590871792550008/image3.gif?ex=69c26bd0&is=69c11a50&hm=ed7b3a1140532f5fdd7e11b06f5d86f69e5ca3d02fda1c221e44dcbefc7344df&",
    "https://cdn.discordapp.com/attachments/1473569768014348329/1485590872283287605/image4.gif?ex=69c26bd0&is=69c11a50&hm=cebfb785fe21c8a44148abccdc6d65218d40fd6ed0e4be0b79cfc847993db1c7&",
    "https://cdn.discordapp.com/attachments/1473569768014348329/1485590872669032489/image5.gif?ex=69c26bd0&is=69c11a50&hm=4d683aa77ee6f7afed632f6c38441a2655c336ce960f09373c8307ae4a6e2888&",
    "https://cdn.discordapp.com/attachments/1473569768014348329/1485590873034068098/image6.gif?ex=69c26bd1&is=69c11a51&hm=87e5ad2fd56d1c0eb94c38eb62c5a59c4a40c99204ba95a58f3dd14f739f1bf2&",
    "https://cdn.discordapp.com/attachments/1473569768014348329/1485590873466212352/image7.gif?ex=69c26bd1&is=69c11a51&hm=9272a2a87dfc99e7134566882b16a6be4f5e5a21c150331ee227e107424f4a19&",
    "https://cdn.discordapp.com/attachments/1473569768014348329/1485590873948291072/image8.gif?ex=69c26bd1&is=69c11a51&hm=90cab69a75f6f59cf1b296054d15e2d91bfabba086b0e7bba8d7e0988c20c38d&",
    "https://cdn.discordapp.com/attachments/1473569768014348329/1485590874262999110/image9.gif?ex=69c26bd1&is=69c11a51&hm=2aedacb5fd3790610fc0ccd9b7ec1f398088d2cba5dde5fe68b1748f36fb7ad0&",
  ],
  tickle: [
    "https://cdn.discordapp.com/attachments/1473569838545768655/1485591007188750416/image0.gif?ex=69c26bf1&is=69c11a71&hm=3ffdc4c807dbc161e5812a174f19f7b198a6f2c7c56ecf44fa32d0945c4af4ab&",
    "https://cdn.discordapp.com/attachments/1473569838545768655/1485591007524556800/image1.gif?ex=69c26bf1&is=69c11a71&hm=aa25e150046e612e1da4714b76c4480ec6c1181b2edd7ecd75424f896e405d2f&",
    "https://cdn.discordapp.com/attachments/1473569838545768655/1485591008048840785/image2.gif?ex=69c26bf1&is=69c11a71&hm=dffe321b4f3871a075ea5ce621087ae26ee7238ad480b805c6754c95060bd78e&",
    "https://cdn.discordapp.com/attachments/1473569838545768655/1485591008358957107/image3.gif?ex=69c26bf1&is=69c11a71&hm=574602438366b8917521ccf9be919713f0899ce35bc6aea1705580ec98199968&",
    "https://cdn.discordapp.com/attachments/1473569838545768655/1485591008623464608/image4.gif?ex=69c26bf1&is=69c11a71&hm=9ce24e21f2b1957e971962e415b0583237cd85de1e86897e13286c77849bf2f6&",
    "https://cdn.discordapp.com/attachments/1473569838545768655/1485591009101479976/image5.gif?ex=69c26bf1&is=69c11a71&hm=ff049a78c6381b6063a151fe07e9aef7d01dcb3ab6c868a2b462b1875cbebe6e&",
    "https://cdn.discordapp.com/attachments/1473569838545768655/1485591009386565672/image6.gif?ex=69c26bf1&is=69c11a71&hm=0fae51df1ce1fd6d3cca220d69a60cc5ef4f417c99f69ed2ab41114471f73e24&",
    "https://cdn.discordapp.com/attachments/1473569838545768655/1485591009760120882/image7.gif?ex=69c26bf1&is=69c11a71&hm=cc4170c85ce4af86d16b8af1fb846afef4c35ef3089f87a9927c5e8ea6674372&",
    "https://cdn.discordapp.com/attachments/1473569838545768655/1485591010179416087/image8.gif?ex=69c26bf1&is=69c11a71&hm=bfcde69caa0ec36af4856a8358b79ce38bd1ffae1b79d7564658776aa97809f5&",
    "https://cdn.discordapp.com/attachments/1473569838545768655/1485591010607239258/image9.gif?ex=69c26bf1&is=69c11a71&hm=df37ac06683527c06f95b13bb67ab4c44601503d7f24cd664740c4d5ce78e225&",
  ],
  feed: [
    "https://cdn.discordapp.com/attachments/1473569946041716758/1485591100541505546/image0.gif?ex=69c26c07&is=69c11a87&hm=c738dab1d211969474a05b02ddcfd8d993176bc8de6ef8ea73941b391a1052b8&",
    "https://cdn.discordapp.com/attachments/1473569946041716758/1485591101300539432/image1.gif?ex=69c26c07&is=69c11a87&hm=7d94c2d238efc3e873f5d923d9fade0a4409dd6853d788c35f33423c6f0120cc&",
    "https://cdn.discordapp.com/attachments/1473569946041716758/1485591101929951343/image2.gif?ex=69c26c07&is=69c11a87&hm=d7a3d928107b55419602e0047c9433c44ede27c978376652970cb330396598af&",
    "https://cdn.discordapp.com/attachments/1473569946041716758/1485591102479269970/image3.gif?ex=69c26c07&is=69c11a87&hm=3e0d1d7435a0eab093ed7e1c34bddbaae9cd3e8220b8de36a5aa8a23ce7e32bc&",
    "https://cdn.discordapp.com/attachments/1473569946041716758/1485591103850942546/image5.gif?ex=69c26c08&is=69c11a88&hm=47ffb88fc29977b3a8b41a5650de7ca261641a00a64579c8e8554375a85bebbe&",
    "https://cdn.discordapp.com/attachments/1473569946041716758/1485591103204753489/image4.gif?ex=69c26c07&is=69c11a87&hm=b68a79c617ec4659f2e897da9bac1d7463803dd582575d528363e2596252f431&",
    "https://cdn.discordapp.com/attachments/1473569946041716758/1485591104429625425/image6.gif?ex=69c26c08&is=69c11a88&hm=c75ad760107b2ee079218af0be10c49c6c487763371ca4bfdfef9713ffa09f4d&",
    "https://cdn.discordapp.com/attachments/1473569946041716758/1485591105117622293/image7.gif?ex=69c26c08&is=69c11a88&hm=c39c3d4145478da841b8038faa5f5b73f5f5186d881d7a20429243b7be33a014&",
    "https://cdn.discordapp.com/attachments/1473569946041716758/1485591105553698836/image8.gif?ex=69c26c08&is=69c11a88&hm=8f0211a62d279af5387a8b2ca209d93d3de5c9ecbceab54b430645096c7f8445&",
    "https://cdn.discordapp.com/attachments/1473569946041716758/1485591106115735633/image9.gif?ex=69c26c08&is=69c11a88&hm=2485d54bdd0c4dde014e18bfd771596d4a4e618421b1a94883c2faef885e95ab&",
  ],
};

function getRandomGif(action) {
  const key = String(action || "").toLowerCase();
  const fallbackMap = {
    hug: "https://media.tenor.com/1T1B8HcWalQAAAAC/anime-hug.gif",
    kiss: "https://media.tenor.com/F02Ep3b2jJgAAAAC/cute-kawai.gif",
    cuddle: "https://media.tenor.com/sv9Cz7AB1sIAAAAC/anime-cuddle.gif",
    cry: "https://media.tenor.com/N4x2MgeO3ZQAAAAC/anime-cry.gif",
    dance: "https://media.tenor.com/Ws6Dm1ZW_vMAAAAC/anime-dance.gif",
    smile: "https://media.tenor.com/TIRi77T02eEAAAAC/anime-smile.gif",
    poke: "https://media.tenor.com/3dOqO0Psbx0AAAAC/anime-poke.gif",
    slap: "https://media.tenor.com/rVXByOZKidMAAAAC/anime-slap.gif",
    punch: "https://media.tenor.com/QkB52t9Ylq8AAAAC/anime-punch.gif",
    bite: "https://media.tenor.com/ECCr5MXU4AEAAAAC/anime-bite.gif",
    blush: "https://media.tenor.com/LC0KYmGSC4AAAAAC/blush-anime.gif",
    pat: "https://media.tenor.com/TDqVQaQWcU8AAAAC/anime-pat.gif",
    run: "https://nekos.best/api/v2/run/fa81a18c-6889-4c97-be60-1e1f221d3132.gif",
    laugh: "https://nekos.best/api/v2/laugh/23ea787c-9491-4af8-8e62-e58049d514f7.gif",
    kill: "https://nekos.best/api/v2/shoot/a67524d1-7d9d-48b8-b571-d08d7753f64e.gif",
    yeet: "https://media.tenor.com/QkB52t9Ylq8AAAAC/anime-punch.gif",
    bully: "https://media.tenor.com/QkB52t9Ylq8AAAAC/anime-punch.gif",
    kidnap: "https://nekos.best/api/v2/run/fa81a18c-6889-4c97-be60-1e1f221d3132.gif",
    ...(globalThis.__soezyGifFallbacks || {}),
  };
  const fallbackAliases = {
    extremhug: "hug",
    extremkiss: "kiss",
    extremslap: "slap",
    blushkiss: "kiss",
    lmao: "laugh",
    horny: "blush",
  };
  if (fallbackMap[key]) return fallbackMap[key].replace(/&+$/, "");
  if (fallbackAliases[key] && fallbackMap[fallbackAliases[key]]) {
    return fallbackMap[fallbackAliases[key]].replace(/&+$/, "");
  }
  return null;
}

// ============ BAD WORD FILTER CONFIG ============
const badWordFilter = {
  enabled: true,
  timeoutMs: (badWordData.timeoutSeconds ?? 30) * 1000, // stored in seconds, converted to ms
  warningMessage: "You used a prohibited word and have been muted."
};
// Merge static badWords file with runtime-added words from db
function getGuildCustomBadWords(guildId) {
  if (!guildId) return [];
  const g = guildData(guildId);
  if (!Array.isArray(g.customBadWords)) g.customBadWords = [];
  return g.customBadWords;
}

function getGuildCustomNsfwWords(guildId) {
  if (!guildId) return [];
  const g = guildData(guildId);
  if (!Array.isArray(g.customNsfwWords)) g.customNsfwWords = [];
  return g.customNsfwWords;
}

function migrateGlobalWordListsToGuilds() {
  const globalBadWords = Array.isArray(db.customBadWords)
    ? db.customBadWords.map(w => String(w).toLowerCase()).filter(Boolean)
    : [];
  const globalNsfwWords = Array.isArray(db.customNsfwWords)
    ? db.customNsfwWords.map(w => String(w).toLowerCase()).filter(Boolean)
    : [];
  if (!globalBadWords.length && !globalNsfwWords.length) return false;
  const guildIds = getKnownGuildIds();
  if (!guildIds.length) {
    delete db.customBadWords;
    delete db.customNsfwWords;
    return true;
  }

  for (const guildId of guildIds) {
    const g = guildData(guildId);
    if (globalBadWords.length) {
      if (!Array.isArray(g.customBadWords)) g.customBadWords = [];
      g.customBadWords = [...new Set([...g.customBadWords, ...globalBadWords])];
      g.__badWordsMigratedFromGlobal = true;
    }
    if (globalNsfwWords.length) {
      if (!Array.isArray(g.customNsfwWords)) g.customNsfwWords = [];
      g.customNsfwWords = [...new Set([...g.customNsfwWords, ...globalNsfwWords])];
      g.__nsfwWordsMigratedFromGlobal = true;
    }
  }

  delete db.customBadWords;
  delete db.customNsfwWords;
  return true;
}

function getBadWordSet(guildId = null) {
  const extra = guildId ? getGuildCustomBadWords(guildId) : [];
  return new Set([...badWords, ...extra].map(w => w.toLowerCase()));
}
const badWordSet = new Set(badWords.map(w => w.toLowerCase()));

// ============ AUTOMOD CONFIG ============
const automodConfig = {
  antiSpam: {
    enabled: false,
    maxMessages: 5,
    interval: 5000,
    action: "mute",
    duration: 300000
  },
  antiMassMention: {
    enabled: false,
    maxMentions: 5,
    action: "mute",
    duration: 300000
  },
  antiCaps: {
    enabled: false,
    percentage: 70,
    minLength: 10,
    action: "delete"
  },
  antiEmoji: {
    enabled: false,
    maxEmojis: 10,
    action: "delete"
  }
};

/* ================= CLIENT SETUP ================= */
const client = process.__soezyDiscordClient || (process.__soezyDiscordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildScheduledEvents,
    GatewayIntentBits.AutoModerationConfiguration,
    GatewayIntentBits.AutoModerationExecution,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember, Partials.GuildPresence],
  // Prevent the bot from actually pinging users/roles in its own messages.
  // Mention syntax like <@id> and <@&id> will still display visually but won't notify anyone.
  allowedMentions: { parse: [] },
  sweepers: {
    messages: { interval: 3600, lifetime: 1800 },
    users: { interval: 3600, filter: () => user => user.bot && user.id !== client?.user?.id },
    guildMembers: { interval: 3600, filter: () => member => !member.voice?.channelId },
  },
  rest: {
    retries: 2,
    timeout: 15000,
  },
}));
client._db = db;
client._config = config;
globalThis.db = db;
globalThis.config = config;
globalThis.__soezyConfig = config;
if (typeof installSoezyRestQueue === "function") installSoezyRestQueue(client.rest, "Discord client");
if (typeof installClientRecovery === "function") installClientRecovery(client);
global.client = client;
global.bot = client;

/* ================= PREFIX FUNCTIONS ================= */
function getPrefix(guildId) {
  const botPrefix = String(config?.prefix || DEFAULT_PREFIX || "!").trim() || "!";
  if (!guildId) return botPrefix;
  const guildPrefix = String(db.prefixes?.[guildId] || "").trim();
  return guildPrefix || botPrefix;
}

function setPrefix(guildId, prefix) {
  if (!db.prefixes) db.prefixes = {};
  const clean = String(prefix || "").trim();
  if (!clean) delete db.prefixes[guildId];
  else db.prefixes[guildId] = clean;
  saveDB();
}

/* ================= DATABASE FUNCTIONS ================= */
// ── Debounced async saveDB ──
// Batches rapid successive saves (460 calls scattered throughout the bot)
// into a single disk write at most every 1.5 seconds, keeping the event
// loop unblocked and eliminating the #1 latency spike source.
async function _flushDB() {
  return flushDatabaseWrite("./database.json", () => db);
}

function saveDB(guildId = null) {
  const touched = globalThis.__soezyTouchedGuilds || (globalThis.__soezyTouchedGuilds = new Set());
  if (isDiscordGuildId(guildId)) touched.add(String(guildId));
  for (const id of touched) {
    const guild = db.guilds?.[id];
    if (guild) syncProtectionPreferenceState(guild, "legacy");
    globalThis.scheduleNativeAutomod?.(id);
  }
  if (typeof syncGuildFeatureStoresFromGuildData === "function") {
    for (const id of touched) syncGuildFeatureStoresFromGuildData(id);
    touched.clear();
  }
  if (typeof markDbDirty === "function") markDbDirty("saveDB");
  if (typeof queueDatabaseWrite === "function") {
    queueDatabaseWrite("./database.json", () => db);
    return;
  }
  throw new Error("Database writer was not initialized");
}

// Shutdown persistence is owned by handlers/saveHandler.js.
if (globalThis.soezyDatabase) globalThis.soezyDatabase.requestSave = saveDB;
// Expose the same writer to the dashboard when it shares this bot process.
client._saveDatabase = async guildId => {
  saveDB(guildId);
  if (guildId && typeof refreshGuildConfig === "function") refreshGuildConfig(guildId, "dashboard");
  return flushDatabaseWrite("./database.json", () => db);
};

async function reloadDB() {
  try {
    if (globalThis.soezyDatabase && !await _flushDB()) throw new Error("Redis writes pending; refusing stale reload");
    const fresh = globalThis.soezyDatabase
      ? await globalThis.soezyDatabase.read()
      : JSON.parse(await fs.promises.readFile("./database.json", "utf8"));
    // Reload global giveaway index
    if (fresh.giveaways) {
      if (!db.giveaways) db.giveaways = {};
      for (const [id, data] of Object.entries(fresh.giveaways)) {
        db.giveaways[id] = data;
        if (!data.ended && !data.cancelled) {
          giveaways.set(id, data);
        }
      }
    }
    // Reload guild data
    if (fresh.guilds) {
      db.guilds = fresh.guilds;
    }
    if (typeof syncRuntimeState === "function") syncRuntimeState(null, "reloadDB");
  } catch (err) {
    console.error("reloadDB failed:", err);
  }
}


/* ================= PER-GUILD DATA HELPERS ================= */
/**
 * Returns the per-guild data object (creates/initializes if needed).
 * ALL guild-specific settings must be read/written through this function
 * to prevent cross-server data leakage.
 */
function guildData(guildId) {
  if (!isDiscordGuildId(guildId)) {
    const warned = globalThis.__soezyInvalidGuildDataWarned || (globalThis.__soezyInvalidGuildDataWarned = new Set());
    const key = String(guildId || "null");
    if (!warned.has(key)) {
      if (warned.size >= 100) warned.delete(warned.values().next().value);
      warned.add(key);
      console.warn(`[DB] Ignoring invalid guildData key: ${key}`);
    }
    return {};
  }
  (globalThis.__soezyTouchedGuilds || (globalThis.__soezyTouchedGuilds = new Set())).add(String(guildId));
  if (!db.guilds) db.guilds = {};
  if (!db.guilds[guildId]) db.guilds[guildId] = {};
  const cachedGuild = typeof getCachedGuildSettings === "function" ? getCachedGuildSettings(guildId) : null;
  if (cachedGuild && db.guilds[guildId] === cachedGuild) {
    syncGuildWhitelist(cachedGuild);
    syncGuildSystemFlags(cachedGuild, guildId);
    return cachedGuild;
  }
  initGuildDB(guildId); // Always run — safe because every block is guarded with if(!g.xxx)
  if (typeof cacheGuildSettings === "function") cacheGuildSettings(guildId, db.guilds[guildId], 10 * 60 * 1000);
  return db.guilds[guildId];
}

function syncGuildSystemFlags(g, guildId) {
  if (!g || !guildId || !db.guildSystems?.[guildId]) return;
  if (!g.features || typeof g.features !== "object") g.features = {};
  for (const [key, value] of Object.entries(db.guildSystems[guildId])) {
    if (typeof value !== "boolean") continue;
    const systemRoot = key === "antinuke" ? g.antinuke : key === "automod" ? g.automod : key === "wall" ? g.wallSystem : null;
    const resolved = typeof systemRoot?.systemEnabled === "boolean" ? systemRoot.systemEnabled : value;
    db.guildSystems[guildId][key] = resolved;
    g.features[key] = resolved;
    applyGuildSystemFlag(g, key, resolved);
  }
  for (const key of ["afk", "autoresponder", "autoreact"]) {
    g.features[key] = true;
    db.guildSystems[guildId][key] = true;
    applyGuildSystemFlag(g, key, true);
  }
}

function uniqueIdList(...lists) {
  const out = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const id of list.map(v => String(v || "").trim()).filter(Boolean)) {
      if (!out.includes(id)) out.push(id);
    }
  }
  return out;
}

function syncGuildWhitelist(g) {
  if (!g || typeof g !== "object") return g;
  if (!g.security || typeof g.security !== "object") g.security = { enabled: false };

  const users = uniqueIdList(g.whitelistUsers, g.immuneUsers, g.security.whitelistUsers);
  const roles = uniqueIdList(g.whitelistRoles, g.immuneRoles, g.security.whitelistRoles);
  const channels = uniqueIdList(g.whitelistChannels, g.immuneChannels, g.security.whitelistChannels, g.security.immuneChannels);

  g.whitelistUsers = users;
  g.whitelistRoles = roles;
  g.whitelistChannels = channels;
  g.security.whitelistUsers = g.whitelistUsers;
  g.security.whitelistRoles = g.whitelistRoles;
  g.security.whitelistChannels = g.whitelistChannels;

  // Legacy aliases remain as references so old immune commands keep working.
  g.immuneUsers = g.whitelistUsers;
  g.immuneRoles = g.whitelistRoles;
  g.immuneChannels = g.whitelistChannels;
  g.security.immuneChannels = g.whitelistChannels;

  if (g.antilink && typeof g.antilink === "object") {
    g.antilink.whitelistUsers = uniqueIdList(g.antilink.whitelistUsers, g.antilink.immuneUsers);
    g.antilink.whitelistRoles = uniqueIdList(g.antilink.whitelistRoles, g.antilink.immuneRoles);
    g.antilink.whitelistChannels = uniqueIdList(g.antilink.whitelistChannels, g.antilink.immuneChannels);
    g.antilink.immuneUsers = g.antilink.whitelistUsers;
    g.antilink.immuneRoles = g.antilink.whitelistRoles;
    g.antilink.immuneChannels = g.antilink.whitelistChannels;
  }

  const automodUsers = uniqueIdList(g.automodWhitelistUsers, g.automodImmuneUsers, g.automod?.whitelistUsers, g.automod?.immuneUsers);
  const automodRoles = uniqueIdList(g.automodWhitelistRoles, g.automodImmuneRoles, g.automod?.whitelistRoles, g.automod?.immuneRoles);
  const automodChannels = uniqueIdList(g.automodWhitelistChannels, g.automodImmuneChannels, g.automod?.whitelistChannels, g.automod?.immuneChannels);
  g.automodWhitelistUsers = automodUsers;
  g.automodWhitelistRoles = automodRoles;
  g.automodWhitelistChannels = automodChannels;
  g.automodImmuneUsers = g.automodWhitelistUsers;
  g.automodImmuneRoles = g.automodWhitelistRoles;
  g.automodImmuneChannels = g.automodWhitelistChannels;
  if (g.automod && typeof g.automod === "object") {
    g.automod.whitelistUsers = g.automodImmuneUsers;
    g.automod.whitelistRoles = g.automodImmuneRoles;
    g.automod.whitelistChannels = g.automodImmuneChannels;
    g.automod.immuneUsers = g.automodImmuneUsers;
    g.automod.immuneRoles = g.automodImmuneRoles;
    g.automod.immuneChannels = g.automodImmuneChannels;
    for (const key of ["antiSpam", "antiCaps", "antiMassMention", "antiInvite"]) {
      if (g.automod[key] && typeof g.automod[key] === "object") {
        g.automod[key].whitelistChannels = uniqueIdList(g.automod[key].whitelistChannels, g.automod[key].immuneChannels);
        g.automod[key].immuneChannels = g.automod[key].whitelistChannels;
      }
    }
  }

  g.badWordWhitelistUsers = uniqueIdList(g.badWordWhitelistUsers, g.badWordImmuneUsers);
  g.badWordWhitelistRoles = uniqueIdList(g.badWordWhitelistRoles, g.badWordImmuneRoles);
  g.badWordWhitelistChannels = uniqueIdList(g.badWordWhitelistChannels, g.badWordImmuneChannels);
  g.badWordImmuneUsers = g.badWordWhitelistUsers;
  g.badWordImmuneRoles = g.badWordWhitelistRoles;
  g.badWordImmuneChannels = g.badWordWhitelistChannels;

  g.nsfwWhitelistRoles = uniqueIdList(g.nsfwWhitelistRoles, g.nsfwImmuneRoles);
  g.nsfwWhitelistChannels = uniqueIdList(g.nsfwWhitelistChannels, g.nsfwImmuneChannels);
  g.nsfwImmuneRoles = g.nsfwWhitelistRoles;
  g.nsfwImmuneChannels = g.nsfwWhitelistChannels;

  if (g.wallSystem && typeof g.wallSystem === "object") {
    g.wallSystem.extraOwners = uniqueIdList(g.wallSystem.extraOwners);
    g.wallSystem.whitelistRoleIds = uniqueIdList(
      g.wallSystem.whitelistRoleIds,
      g.wallSystem.immuneRoleIds,
      g.wallSystem.immuneRoleId ? [g.wallSystem.immuneRoleId] : []
    );
    g.wallSystem.immuneRoleIds = g.wallSystem.whitelistRoleIds;
    g.wallSystem.immuneRoleId = g.wallSystem.whitelistRoleIds[0] || null;
  }

  return g;
}

function ensureNestedObject(root, key) {
  if (!root[key] || typeof root[key] !== "object") root[key] = {};
  return root[key];
}

function getWhitelistArray(g, path) {
  if (!g || !Array.isArray(path) || !path.length) return [];
  if (path.length === 1) {
    if (!Array.isArray(g[path[0]])) g[path[0]] = [];
    return g[path[0]];
  }
  let target = g;
  for (let i = 0; i < path.length - 1; i++) {
    target = ensureNestedObject(target, path[i]);
  }
  const key = path[path.length - 1];
  if (!Array.isArray(target[key])) target[key] = [];
  return target[key];
}

function addWhitelistValue(g, path, id) {
  const list = getWhitelistArray(g, path);
  if (!list.includes(id)) list.push(id);
}

function removeWhitelistValue(g, path, id) {
  const list = getWhitelistArray(g, path);
  const filtered = list.filter(value => value !== id);
  list.splice(0, list.length, ...filtered);
}

function mirrorWhitelistAliases(g) {
  syncGuildWhitelist(g);
  if (g.antilink && typeof g.antilink === "object") {
    g.antilink.immuneUsers = g.antilink.whitelistUsers = uniqueIdList(g.antilink.whitelistUsers, g.antilink.immuneUsers);
    g.antilink.immuneRoles = g.antilink.whitelistRoles = uniqueIdList(g.antilink.whitelistRoles, g.antilink.immuneRoles);
    g.antilink.immuneChannels = g.antilink.whitelistChannels = uniqueIdList(g.antilink.whitelistChannels, g.antilink.immuneChannels);
  }
  g.automodImmuneUsers = g.automodWhitelistUsers = uniqueIdList(g.automodWhitelistUsers, g.automodImmuneUsers);
  g.automodImmuneRoles = g.automodWhitelistRoles = uniqueIdList(g.automodWhitelistRoles, g.automodImmuneRoles);
  g.automodImmuneChannels = g.automodWhitelistChannels = uniqueIdList(g.automodWhitelistChannels, g.automodImmuneChannels);
  if (g.automod && typeof g.automod === "object") {
    g.automod.immuneUsers = g.automod.whitelistUsers = g.automodWhitelistUsers;
    g.automod.immuneRoles = g.automod.whitelistRoles = g.automodWhitelistRoles;
    g.automod.immuneChannels = g.automod.whitelistChannels = g.automodWhitelistChannels;
    for (const key of ["antiSpam", "antiCaps", "antiMassMention", "antiInvite"]) {
      if (g.automod[key] && typeof g.automod[key] === "object") {
        g.automod[key].immuneChannels = g.automod[key].whitelistChannels = uniqueIdList(g.automod[key].whitelistChannels, g.automod[key].immuneChannels);
      }
    }
  }
  g.badWordImmuneUsers = g.badWordWhitelistUsers = uniqueIdList(g.badWordWhitelistUsers, g.badWordImmuneUsers);
  g.badWordImmuneRoles = g.badWordWhitelistRoles = uniqueIdList(g.badWordWhitelistRoles, g.badWordImmuneRoles);
  g.badWordImmuneChannels = g.badWordWhitelistChannels = uniqueIdList(g.badWordWhitelistChannels, g.badWordImmuneChannels);
  g.nsfwImmuneChannels = g.nsfwWhitelistChannels = uniqueIdList(g.nsfwWhitelistChannels, g.nsfwImmuneChannels);
}

function syncGlobalWhitelistEntry(g, type, rawId, action, options = {}) {
  if (!g || !rawId) return g;
  const id = String(rawId).trim();
  const targetType = type === "role" ? "role" : type === "channel" ? "channel" : "user";
  const op = action === "remove" ? "remove" : "add";
  const globalPath = targetType === "role" ? ["whitelistRoles"] : targetType === "channel" ? ["whitelistChannels"] : ["whitelistUsers"];
  const legacyPath = targetType === "role" ? ["immuneRoles"] : targetType === "channel" ? ["immuneChannels"] : ["immuneUsers"];
  if (op === "add") {
    addWhitelistValue(g, globalPath, id);
    addWhitelistValue(g, legacyPath, id);
  } else {
    removeWhitelistValue(g, globalPath, id);
    removeWhitelistValue(g, legacyPath, id);
  }

  mirrorWhitelistAliases(g);
  return g;
}

Object.assign(globalThis, { syncGuildWhitelist, syncGlobalWhitelistEntry });

function applyGuildSystemFlag(g, key, enabled) {
  if (!g || !key) return;
  const next = enabled === true;
  const set = {
    ticket: () => { g.ticket ||= {}; g.ticket.enabled = next; },
    counting: () => { g.countingSystem ||= {}; g.countingSystem.enabled = next; },
    confession: () => { g.confession ||= {}; g.confession.enabled = next; },
    economy: () => { g.economy ||= {}; g.economy.enabled = next; },
    giveaway: () => { g.giveawaySystem ||= {}; g.giveawaySystem.enabled = next; },
    sticky: () => { g.stickySystem ||= {}; g.stickySystem.enabled = next; },
    afk: () => { g.afk ||= {}; g.afk.enabled = next; },
    antibot: () => { g.antibot ||= {}; g.antibot.enabled = next; g.automod ||= {}; g.automod.features ||= {}; g.automod.features.antiBot = { ...(g.automod.features.antiBot || {}), enabled: next }; },
    antinuke: () => { g.antinuke ||= {}; g.antinuke.systemEnabled = g.antinuke.enabled = next; },
    antiraid: () => { g.security ||= {}; g.security.antiraid ||= {}; g.security.antiraid.enabled = next; g.antiRaid ||= {}; g.antiRaid.enabled = next; },
    antilink: () => { g.antilink ||= {}; g.antilink.enabled = next; },
    automod: () => { g.automod ||= {}; g.automod.systemEnabled = g.automod.enabled = next; },
    security: () => { g.security ||= {}; g.security.enabled = next; },
    media: () => { g.media ||= {}; g.media.enabled = next; },
    welcome: () => { g.welcome ||= {}; g.welcome.enabled = next; },
    goodbye: () => { g.goodbye ||= {}; g.goodbye.enabled = next; },
    boost: () => { g.boost ||= {}; g.boost.enabled = next; },
    logging: () => { g.logging ||= {}; g.logging.enabled = next; },
    birthday: () => { g.birthday ||= {}; g.birthday.enabled = next; },
    invites: () => { g.inviteSystem ||= {}; g.inviteSystem.enabled = next; },
    wall: () => { g.wallSystem ||= {}; g.wallSystem.systemEnabled = g.wallSystem.enabled = next; },
    autoresponder: () => { g.autoresponder ||= {}; g.autoresponder.enabled = next; },
    autoreact: () => { g.autoreact ||= {}; g.autoreact.enabled = next; },
    customroles: () => { g.customRoles ||= {}; g.customRoles.enabled = next; g.customroles ||= {}; g.customroles.enabled = next; },
    fun: () => { g.fun ||= {}; g.fun.enabled = next; },
    tempvoice: () => { g.tempVoice ||= {}; g.tempVoice.enabled = next; g.tempvoice ||= {}; g.tempvoice.enabled = next; },
    joindm: () => { g.joinDm ||= {}; g.joinDm.enabled = next; },
    accountage: () => { g.accountAge ||= {}; g.accountAge.enabled = next; g.automod ||= {}; g.automod.features ||= {}; g.automod.features.accountAge = { ...(g.automod.features.accountAge || {}), enabled: next }; },
    verify: () => { g.verify ||= {}; g.verify.enabled = next; },
    warnpunish: () => { g.warnPunish ||= {}; g.warnPunish.enabled = next; },
    muteevasion: () => { g.muteEvasion ||= {}; g.muteEvasion.enabled = next; },
  };
  set[String(key).toLowerCase()]?.();
}

function syncProtectionPreferenceState(g, source = "canonical") {
  if (!g || typeof g !== "object") return g;
  const preferCanonical = source === "canonical";
  const setSystem = system => {
    system ||= {};
    const value = typeof system.systemEnabled === "boolean" && preferCanonical
      ? system.systemEnabled
      : system.enabled === true;
    system.systemEnabled = system.enabled = value;
    return system;
  };
  const setFeature = (root, key, legacyValue) => {
    root.features ||= {};
    const previous = root.features[key];
    const enabled = preferCanonical && typeof previous?.enabled === "boolean"
      ? previous.enabled
      : typeof legacyValue === "boolean" ? legacyValue : false;
    root.features[key] = { ...(previous && typeof previous === "object" ? previous : {}), enabled };
    return enabled;
  };
  const legacy = (obj, key) => typeof obj?.[key] === "boolean" ? obj[key] : undefined;

  const an = setSystem(g.antinuke);
  an.events ||= {};
  const configuredEvents = typeof ANTINUKE_EVENTS !== "undefined" && Array.isArray(ANTINUKE_EVENTS)
    ? ANTINUKE_EVENTS
    : globalThis.ANTINUKE_EVENTS;
  const eventIds = new Set([
    ...(Array.isArray(configuredEvents) ? configuredEvents.map(event => event.id) : []),
    ...Object.keys(an.events),
  ]);
  for (const key of eventIds) an.events[key] = setFeature(an, key, legacy(an.events, key));
  g.antinuke = an;

  const am = setSystem(g.automod);
  g.automod = am;
  am.antiSpam ||= {};
  am.antiMassMention ||= {};
  am.antiCaps ||= {};
  am.antiInvite ||= {};
  am.antiLink ||= {};
  g.antibot ||= {};
  g.security ||= {};
  am.advanced ||= {};
  for (const [key, obj, field] of [
    ["antiSpam", am.antiSpam, "enabled"],
    ["antiMassMention", am.antiMassMention, "enabled"],
    ["antiCaps", am.antiCaps, "enabled"],
    ["antiInvite", am.antiInvite, "enabled"],
    ["antiLink", am.antiLink, "enabled"],
    ["antiBot", g.antibot, "enabled"],
    ["badWords", g, "badWordEnabled"],
    ["nsfw", g, "nsfwProtection"],
    ["invite", am.advanced, "invite"],
    ["duplicate", am.advanced, "duplicate"],
    ["scams", am.advanced, "scams"],
    ["imageScam", am.advanced, "imageScam"],
    ["antiPhishing", g.security, "antiPhishing"],
    ["securityAntiCaps", g.security, "antiCaps"],
    ["antiZalgo", g.security, "antiZalgo"],
    ["antiDuplicate", g.security, "antiDuplicate"],
    ["antiEveryoneBP", g.security, "antiEveryoneBP"],
    ["webhookGuard", g.security, "webhookGuard"],
  ]) {
    if (["invite", "duplicate", "scams", "imageScam"].includes(key)) {
      const current = obj[field] && typeof obj[field] === "object" ? obj[field] : {};
      obj[field] = current;
      current.enabled = setFeature(am, key, legacy(current, "enabled"));
    } else {
      obj[field] = setFeature(am, key, legacy(obj, field));
    }
  }
  const antiLinkLegacy = typeof g.antilink?.enabled === "boolean" ? g.antilink.enabled : am.antiLink.enabled;
  am.features.antiLink.enabled = preferCanonical && typeof am.features.antiLink.enabled === "boolean"
    ? am.features.antiLink.enabled
    : antiLinkLegacy === true;
  am.antiLink.enabled = am.features.antiLink.enabled;
  if (g.antilink) g.antilink.enabled = am.features.antiLink.enabled;
  g.accountAge ||= {};
  const accountAgeEnabled = preferCanonical
    ? g.accountAge.enabled === true || Number(g.security.accountAgeDays) > 0
    : typeof g.accountAge.enabled === "boolean" ? g.accountAge.enabled : Number(g.security.accountAgeDays) > 0;
  g.accountAge.enabled = setFeature(am, "accountAge", accountAgeEnabled);

  const wall = setSystem(g.wallSystem);
  wall.features ||= {};
  g.wallSystem = wall;
  return g;
}
globalThis.syncProtectionPreferenceState = syncProtectionPreferenceState;

function initGuildDB(guildId) {
  const g = db.guilds[guildId];
  syncGuildWhitelist(g);
  // Server-only command aliases created with `alias set <command> <name>`.
  if (!g.commandAliases || typeof g.commandAliases !== "object" || Array.isArray(g.commandAliases)) g.commandAliases = {};
  if (!g.features || typeof g.features !== "object") g.features = {};
  if (db.guildSystems?.[guildId]) {
    for (const [key, value] of Object.entries(db.guildSystems[guildId])) {
      if (typeof value === "boolean") g.features[key] = value;
    }
  }

  if (!g.ticket) g.ticket = {
    enabled: false, channel: "", category: "", supportRole: "",
    logs: "", transcriptChannel: null,
    embed: { title: "", description: "", color: "", image: "", footer: "" },
    tickets: {}, maxTickets: 5, autoClose: false, dmOnClose: true
  };
  if (g.ticket.maxTickets === undefined) g.ticket.maxTickets = 5;
  if (g.ticket.autoClose  === undefined) g.ticket.autoClose  = false;
  if (g.ticket.dmOnClose  === undefined) g.ticket.dmOnClose  = true;

  if (!g.welcome) g.welcome = { enabled: false, channel: null, message: "Welcome {user} to {server}!", embedEnabled: true, dmEnabled: false, dmMessage: "" };
  if (!g.goodbye) g.goodbye = { enabled: false, channel: null, message: "Goodbye {user}! We'll miss you.", embedEnabled: true };
  if (g.goodbye.channel === undefined) g.goodbye.channel = null;
  if (g.goodbye.channel !== null && g.goodbye.channel !== undefined) g.goodbye.channel = String(g.goodbye.channel);
  if (!g.boost) g.boost = { enabled: false, channel: null, embed: { title: "", description: "", image: null, footer: "", timestamp: false, color: "" } };
  if (!g.infect || typeof g.infect !== "object") g.infect = { enabled: true, channelId: null, allowedRoleId: null, muteDurationMs: 60000, choiceDurationMs: 60000 };
  if (g.infect.enabled === undefined) g.infect.enabled = true;
  if (g.infect.channelId === undefined) g.infect.channelId = null;
  if (g.infect.allowedRoleId === undefined) g.infect.allowedRoleId = null;
  if (!Number.isFinite(g.infect.muteDurationMs) || g.infect.muteDurationMs <= 0) g.infect.muteDurationMs = 60000;
  if (!Number.isFinite(g.infect.choiceDurationMs) || g.infect.choiceDurationMs <= 0) g.infect.choiceDurationMs = 60000;
  if (!g.logging) g.logging = { enabled: false, channel: null, channels: { message: null, moderation: null, joinLeave: null, invite: null, voice: null, action: null, admin: null }, events: { messageDelete:true, messageEdit:false, memberJoin:true, memberLeave:true, memberUpdate:true, memberBan:true, memberUnban:true, memberKick:true, memberMute:true, memberUnmute:true, memberWarn:true, roleCreate:true, roleDelete:true, roleUpdate:false, channelCreate:true, channelDelete:true, channelUpdate:false, voiceJoin:true, voiceLeave:true, voiceMove:true, inviteCreate:true, inviteDelete:true, emojiCreate:true, emojiDelete:true, emojiUpdate:false, stickerCreate:true, stickerDelete:true, stickerUpdate:false, webhookCreate:true, webhookDelete:true, webhookUpdate:false, autoModerationRuleCreate:true, autoModerationRuleDelete:true, autoModerationRuleUpdate:false, autoModerationActionExecution:true, nicknameChange:true, guildUpdate:true } };
  if (!g.logging.channels) g.logging.channels = { message: null, moderation: null, joinLeave: null, invite: null, voice: null, action: null, admin: null };
  // Back-fill new events that may be missing from old DB entries
  const _lgEvtDefaults = { memberKick:true, memberMute:true, memberUnmute:true, memberWarn:true, infect:true, memberUpdate:true, roleUpdate:false, channelUpdate:false, inviteCreate:true, inviteDelete:true, emojiCreate:true, emojiDelete:true, emojiUpdate:false, stickerCreate:true, stickerDelete:true, stickerUpdate:false, webhookCreate:true, webhookDelete:true, webhookUpdate:false, autoModerationRuleCreate:true, autoModerationRuleDelete:true, autoModerationRuleUpdate:false, autoModerationActionExecution:true, nicknameChange:true, guildUpdate:true };
  for (const [k, v] of Object.entries(_lgEvtDefaults)) { if (g.logging.events[k] === undefined) g.logging.events[k] = v; }
  if (!g.antibot) g.antibot = { enabled: false, joinLogs: null, whitelist: [], action: "kick" };
  if (!g.antinuke) g.antinuke = { enabled: false, whitelist: [], whitelistRoleId: null, logs: null, maxBans: 3, maxKicks: 3, maxChannelDelete: 3, maxRoleDelete: 3, punishment: "ban", timeWindow: 10000, events: {} };
  if (!["ban", "kick", "strip"].includes(g.antinuke.punishment)) g.antinuke.punishment = "ban";
  if (g.antinuke && g.antinuke.whitelistRoleId === undefined) g.antinuke.whitelistRoleId = null;
  if (!g.antinuke.events) g.antinuke.events = {};
  if (!g.antilink) g.antilink = { enabled: false, whitelist: [], whitelistRoles: [], whitelistUsers: [], whitelistChannels: [], immuneRoles: [], immuneUsers: [], immuneChannels: [], action: "delete" };
  // Migrate legacy single-role whitelist fields into centralized featureRoleIds store
  if (!g.featureRoleIds || typeof g.featureRoleIds !== "object" || Array.isArray(g.featureRoleIds)) g.featureRoleIds = {};
  for (const [featureKey, value] of Object.entries({
    access: g.access?.whitelistRoleId || g.security?.whitelistRoleId || null,
    antinuke: g.antinuke?.whitelistRoleId || g.antinuke?.immuneRoleId || null,
    wall: g.wallSystem?.whitelistRoleId || g.wallSystem?.immuneRoleId || null,
    antibot: g.antibot?.whitelistRoleId || g.antibot?.immuneRoleId || null,
    automod: g.automod?.whitelistRoleId || g.automod?.immuneRoleId || null,
    antiraid: g.security?.antiraid?.whitelistRoleId || g.antiRaid?.whitelistRoleId || null,
  })) {
    if (!g.featureRoleIds[featureKey] && value) g.featureRoleIds[featureKey] = String(value);
  }
  // keep legacy fields for backward compatibility until migrated safely
  if (!Array.isArray(g.antilink.immuneUsers)) g.antilink.immuneUsers = [];
  if (!Array.isArray(g.antilink.immuneUsers)) g.antilink.immuneUsers = [];
  if (!g.antispam) g.antispam = { enabled: false, maxMessages: 5, interval: 5000, action: "mute", duration: 300000 };
  if (!g.antimention) g.antimention = { enabled: false, maxMentions: 5, action: "mute", duration: 300000 };
  if (!g.automod) g.automod = { enabled: false, whitelistUsers: [], whitelistRoles: [], whitelistChannels: [], immuneUsers: [], immuneRoles: [], immuneChannels: [], antiSpam: { enabled: false, maxMessages: 5, interval: 5000, action: "mute", duration: 300000, whitelistChannels: [], immuneChannels: [] }, antiMassMention: { enabled: false, maxMentions: 5, action: "mute", duration: 300000, whitelistChannels: [], immuneChannels: [] }, antiCaps: { enabled: false, percentage: 70, minLength: 10, action: "delete", whitelistChannels: [], immuneChannels: [] }, antiEmoji: { enabled: false, maxEmojis: 10, action: "delete" }, antiInvite: { enabled: false, action: "delete", whitelistChannels: [], immuneChannels: [] } };
  if (!g.security) g.security = { enabled: false };
  syncGuildWhitelist(g);
  if (!g.confession) g.confession = { enabled: false, channel: null, logs: null, lastId: 0, bannedUsers: [], confessions: [] };
  if (!g.birthday) g.birthday = { enabled: false, channel: null, role: null, message: "🎂 Happy Birthday {user}! 🎉", users: {} };
  if (!g.autoresponder) g.autoresponder = { enabled: true, triggers: {} };
  if (!g.autoreact) g.autoreact = { enabled: true, triggers: {} };
  if (!g.media) g.media = { enabled: false, uploadLogsChannel: null, deleteLogsChannel: null, onlyChannels: [], logs: {} };
  if (g.media.deleteLogsChannel === undefined) g.media.deleteLogsChannel = g.mediaDeleteChannel || null;
  if (g.media.uploadLogsChannel === undefined) g.media.uploadLogsChannel = g.media.deleteLogsChannel || g.mediaDeleteChannel || null;
  if (!g.stickerChannel) g.stickerChannel = null;
  if (!g.stickyMessages) g.stickyMessages = {};
  if (!g.stickySystem) g.stickySystem = { enabled: false };
  if (db.guildSystems?.[guildId]?.sticky !== undefined) g.stickySystem.enabled = db.guildSystems[guildId].sticky === true;
  if (!g.invites) g.invites = {};
  if (!g.inviteRewards) g.inviteRewards = {};
  if (!g.inviteSystem) g.inviteSystem = { enabled: false };
  if (!g.wallSystem) g.wallSystem = {
    enabled: false,
    extraOwners: [],
    immuneRoleId: null,
    quarantineRoleId: null,
    jailChannelId: null,
    roleId: null,
    channelId: null,
    createdRoleId: null,
    createdChannelId: null,
    createdWhitelistRoleId: null,
    createdByBot: {},
    logChannel: null,
    quarantined: {}
  };
  if (!g.wall || typeof g.wall !== "object" || Array.isArray(g.wall)) g.wall = {};
  g.wall.roleId = g.wallSystem.roleId || g.wallSystem.quarantineRoleId || g.wall.roleId || null;
  g.wall.channelId = g.wallSystem.channelId || g.wallSystem.jailChannelId || g.wall.channelId || null;
  g.wall.enabled = g.wallSystem.enabled === true;
  if (!g.settings || typeof g.settings !== "object" || Array.isArray(g.settings)) g.settings = {};
  if (!g.settings.nightmode || typeof g.settings.nightmode !== "object" || Array.isArray(g.settings.nightmode)) {
    g.settings.nightmode = { enabled: true, startHour: 0, endHour: 6, forceActive: false, updatedAt: null, updatedBy: null };
  }
  if (!g.nightmode || typeof g.nightmode !== "object" || Array.isArray(g.nightmode)) g.nightmode = g.settings.nightmode;
  if (!g.tempVoice) g.tempVoice = { enabled: false, createChannel: null, privateCreateChannel: null, category: null, channels: {}, defaultName: "{user}'s Channel", defaultLimit: 0 };
  if (!g.joinDm) g.joinDm = { enabled: false, message: "Welcome to {server}!" };
  if (!g.warnings) g.warnings = {};
  if (!g.reactionRoles) g.reactionRoles = {};
  if (!g.rrDrafts) g.rrDrafts = {};   // draft rr panels (not yet posted)
  if (!g.brDrafts) g.brDrafts = {};   // draft br panels (not yet posted)

  if (!g.economy) g.economy = { enabled: true, users: {}, daily: 1, work: { min: 50, max: 200 }, shopItems: {}, currency: "💰" };

  // ── Ensure built-in timed shop items exist ──────────────────────────────────
  if (!g.economy.shopItems) g.economy.shopItems = {};
  const _builtins = {
    "builtin_noprefix_1d":  { name: "No Prefix (1 Day)",   price: 5,   description: "Use the bot without a prefix in this server for 1 day.",    stock: -1, _category: "no_prefix", _type: "1d"  },
    "builtin_noprefix_7d":  { name: "No Prefix (7 Days)",  price: 30,  description: "Use the bot without a prefix in this server for 7 days.",   stock: -1, _category: "no_prefix", _type: "7d"  },
    "builtin_noprefix_30d": { name: "No Prefix (1 Month)", price: 100, description: "Use the bot without a prefix in this server for 1 month.",  stock: -1, _category: "no_prefix", _type: "30d" },
    "builtin_avatar_1d":    { name: "Bot Avatar (1 Day)",  price: 10,  description: "Set a custom bot avatar for this server for 1 day.",        stock: -1, _category: "bot_avatar", _type: "1d"  },
    "builtin_avatar_7d":    { name: "Bot Avatar (7 Days)", price: 60,  description: "Set a custom bot avatar for this server for 7 days.",       stock: -1, _category: "bot_avatar", _type: "7d"  },
    "builtin_avatar_30d":   { name: "Bot Avatar (1 Month)",price: 200, description: "Set a custom bot avatar for this server for 1 month.",      stock: -1, _category: "bot_avatar", _type: "30d" },
    "builtin_banner_1d":    { name: "Bot Banner (1 Day)",  price: 10,  description: "Set a custom bot banner for this server for 1 day.",        stock: -1, _category: "bot_banner", _type: "1d"  },
    "builtin_banner_7d":    { name: "Bot Banner (7 Days)", price: 60,  description: "Set a custom bot banner for this server for 7 days.",       stock: -1, _category: "bot_banner", _type: "7d"  },
    "builtin_banner_30d":   { name: "Bot Banner (1 Month)",price: 200, description: "Set a custom bot banner for this server for 1 month.",      stock: -1, _category: "bot_banner", _type: "30d" },
    "builtin_premium_1d":   { name: "Premium (1 Day)",     price: 20,  description: "Premium perks (no prefix, avatar & banner customization) for 1 day.",   stock: -1, _category: "premium", _type: "1d"  },
    "builtin_premium_7d":   { name: "Premium (7 Days)",    price: 120, description: "Premium perks (no prefix, avatar & banner customization) for 7 days.",  stock: -1, _category: "premium", _type: "7d"  },
    "builtin_premium_30d":  { name: "Premium (1 Month)",   price: 400, description: "Premium perks (no prefix, avatar & banner customization) for 1 month.", stock: -1, _category: "premium", _type: "30d" },
  };
  for (const [bid, bitem] of Object.entries(_builtins)) {
    if (!g.economy.shopItems[bid]) g.economy.shopItems[bid] = bitem;
  }
  if (!g.counting) g.counting = {};
  if (!g.countingSystem) g.countingSystem = { enabled: false };
  if (!g.suggestions) g.suggestions = { enabled: false, channel: null, count: 0 };
  if (!g.voiceRoles) g.voiceRoles = {};
  if (!g.modLogs) g.modLogs = null;
  if (!g.autoRoles) g.autoRoles = {};
  if (!g.buttonRoles) g.buttonRoles = {};
  if (!g.dropdownRoles) g.dropdownRoles = {};
  if (!g.connectionRoles) g.connectionRoles = {};
  if (!g.customRoles) g.customRoles = { enabled: false, maxRoles: 1, users: {} };
  if (!g.serverStats) g.serverStats = { enabled: false, channels: {} };
  if (!g.messageCount) g.messageCount = {};
  if (!g.polls) g.polls = {};
  if (!g.music) g.music = { enabled: true, queues: {}, djRole: null, defaultVolume: 100 };
  if (!g.fun) g.fun = { enabled: true };
  if (!g.selfie) g.selfie = { images: [] }; // premium selfie images list
  // ─ Premium feature DB defaults ─
  if (!g.custombg)        g.custombg        = { url: null };
  if (!g.theme)           g.theme           = { color: null };
  if (!g.rotateAvatar)    g.rotateAvatar    = { images: [], intervalHours: 24, lastRotated: null };
  // Removed systems: discard obsolete saved jobs and reward settings on load.
  delete g.schedules;
  delete g.autoposts;
  delete g.vipTiers;
  if (g.economy) delete g.economy.streakMultiplier;
  if (!g.countdowns)      g.countdowns      = [];
  if (!g.shadowMuted)     g.shadowMuted     = [];
  if (!g.modCases)        g.modCases        = [];
  if (!g.banLogs)         g.banLogs         = [];
  if (!g.kickLogs)        g.kickLogs        = [];
  if (!g.muteLogs)        g.muteLogs        = [];
  if (!g.stockMarket)     g.stockMarket     = { enabled: false, portfolios: {}, history: {} };
  if (!g.serverMail)      g.serverMail      = { enabled: false, boxes: {} };
  if (!g.vouchSystem)     g.vouchSystem     = { enabled: false, vouches: {}, channel: null };
  if (!g.premiumChannels) g.premiumChannels = [];
  if (!g.premiumVCs)     g.premiumVCs     = [];      // tracked premium voice channels
  if (!g.premiumRole)    g.premiumRole     = null;
  if (!g.premiumLog)     g.premiumLog      = null;    // channel to log premium events
  if (!g.premiumPerks)   g.premiumPerks    = [];      // server custom perk list
  if (!g.streakData)      g.streakData      = {};
  if (!g.levelRoles)      g.levelRoles      = {};
  if (!g.disabledChannels) g.disabledChannels = [];
  if (!g.autoDeleteChannels) g.autoDeleteChannels = [];
  if (!g.autoDeleteTextOnly) g.autoDeleteTextOnly = {};
  if (!g.disabledCommands) g.disabledCommands = {};
  if (g.nsfwProtection === undefined) g.nsfwProtection = false;
  if (!g.badWordImmuneRoles) g.badWordImmuneRoles = [];
  if (!g.badWordImmuneChannels) g.badWordImmuneChannels = [];
  if (!g.nsfwImmuneRoles) g.nsfwImmuneRoles = [];
  if (!g.nsfwImmuneChannels) g.nsfwImmuneChannels = [];
  if (!g.automodImmuneUsers) g.automodImmuneUsers = [];
  if (!g.automodImmuneRoles) g.automodImmuneRoles = [];
  if (!g.automodImmuneChannels) g.automodImmuneChannels = [];
  if (!g.reminders) g.reminders = [];
  if (!g.reminderChannel) g.reminderChannel = {};
  if (!g.giveaways) g.giveaways = {};
  if (!g.stolenStickers) g.stolenStickers = {};
  if (!g.embeds) g.embeds = {};
  if (!g.afk) g.afk = { enabled: true, message: "{user} is AFK: {reason}", users: {} };
  if (!g.guildBotIdentity) g.guildBotIdentity = {};
  if (!g.selfRoles) g.selfRoles = {};
  if (!g.systems) g.systems = {};
  // ExtraOwners delegate protected-system configuration in this guild only.
  if (!Array.isArray(g.extraOwners)) g.extraOwners = [];
  if (!g.ignore) g.ignore = { commands: [], channels: [], users: [], bypass: [] };
  if (!g.accountAge)  g.accountAge  = { enabled: Number(g.security?.accountAgeDays) > 0, minDays: Number(g.security?.accountAgeDays) || 7, action: "kick", logs: null };
  if (typeof g.accountAge.enabled !== "boolean") g.accountAge.enabled = Number(g.security?.accountAgeDays) > 0;
  if (!Number.isInteger(Number(g.accountAge.minDays)) || Number(g.accountAge.minDays) < 1) g.accountAge.minDays = Number(g.security?.savedAccountAgeDays || g.security?.accountAgeDays) || 7;
  if (!g.antiRaid)    g.antiRaid    = { enabled: false, threshold: 10, interval: 10000, action: "kick", logs: null, joins: [] };
  if (!g.verify)      g.verify      = { enabled: false, category: null, channel: null, role: null, extraRoles: [], unverifiedRole: null, title: "Verification Required", message: "Click the button below to verify!", logs: null, approvalChannel: null, panelMessageId: null, panelChannelId: null, ageGateDays: 30, ageGateEnabled: true, ageGateConfigured: false, pendingApprovals: {}, whitelistUsers: [], whitelistRoles: [], approverUsers: [], approverRoles: [], createdRoleIds: [], createdChannelIds: [] };
  // Migrate old verify objects missing new fields
  if (g.verify && !g.verify.pendingApprovals)               g.verify.pendingApprovals = {};
  if (g.verify && g.verify.ageGateDays    === undefined)    g.verify.ageGateDays      = 30;
  if (g.verify && g.verify.ageGateEnabled === undefined)    g.verify.ageGateEnabled   = false;
  if (g.verify && g.verify.ageGateConfigured === undefined) g.verify.ageGateConfigured = false;
  if (g.verify && g.verify.title          === undefined)    g.verify.title            = "Verification Required";
  if (g.verify && g.verify.category       === undefined)    g.verify.category         = null;
  if (g.verify && !Array.isArray(g.verify.extraRoles))      g.verify.extraRoles       = [];
  if (g.verify && !Array.isArray(g.verify.whitelistUsers))  g.verify.whitelistUsers   = [];
  if (g.verify && !Array.isArray(g.verify.whitelistRoles))  g.verify.whitelistRoles   = [];
  if (g.verify && !Array.isArray(g.verify.approverUsers))   g.verify.approverUsers    = [];
  if (g.verify && !Array.isArray(g.verify.approverRoles))   g.verify.approverRoles    = [];
  if (g.verify && g.verify.panelChannelId === undefined)     g.verify.panelChannelId   = null;
  if (g.verify && !Array.isArray(g.verify.createdRoleIds))  g.verify.createdRoleIds  = [];
  if (g.verify && !Array.isArray(g.verify.createdChannelIds)) g.verify.createdChannelIds = [];
  if (!g.warnPunish)  g.warnPunish  = { enabled: false, thresholds: { 3: "mute", 5: "kick", 7: "ban" } };
  if (!g.muteEvasion) g.muteEvasion = { enabled: false, logs: null, mutedUsers: {} };
  if (!g.vanityRole)  g.vanityRole  = { enabled: false, roleId: null, tag: null, logChannel: null };
  if (!g.tagRole)     g.tagRole     = { enabled: false, roleId: null, tag: null, logChannel: null };
  if (db.guildSystems?.[guildId]) {
    for (const [key, value] of Object.entries(db.guildSystems[guildId])) {
      if (typeof value !== "boolean") continue;
      const systemRoot = key === "antinuke" ? g.antinuke : key === "automod" ? g.automod : key === "wall" ? g.wallSystem : null;
      const resolved = typeof systemRoot?.systemEnabled === "boolean" ? systemRoot.systemEnabled : value;
      db.guildSystems[guildId][key] = resolved;
      g.features[key] = resolved;
      applyGuildSystemFlag(g, key, resolved);
    }
  }

  // These message utilities are always available; migrate any old disabled defaults.
  for (const key of ["afk", "autoresponder", "autoreact"]) {
    g.features[key] = true;
    db.guildSystems ||= {};
    db.guildSystems[guildId] ||= {};
    db.guildSystems[guildId][key] = true;
    applyGuildSystemFlag(g, key, true);
  }
  syncProtectionPreferenceState(g, "canonical");
}

/* ================= GLOBAL USER HELPER ================= */
/**
 * Ensures a global user entry exists in db.users with all required fields.
 * NEVER overwrites existing values — only fills in missing ones.
 *
 * Usage anywhere user data is accessed:
 *   const userData = ensureUser(userId);
 */
function ensureUser(userId) {
  // Step 1: Ensure db.users namespace exists
  if (!db.users) db.users = {};

  // Step 2: Create user entry if it doesn't exist yet
  if (!db.users[userId]) db.users[userId] = {};

  const u = db.users[userId];

  // Step 3: Fill in missing fields without touching existing values
  if (u.points === undefined) u.points = 0;
  if (u.vip    === undefined) u.vip    = false;
  if (u.streak === undefined) u.streak = 0;

  return u;
}

/** Returns true only for an owner trusted by the bot configuration. */
function isConfiguredBotOwner(userId) {
  const id = String(userId || "");
  return Boolean(
    globalThis.soezyOwnerManager?.isBotOwner?.(id) ||
    config.ownerIds?.includes(id) ||
    config.owners?.includes(id)
  );
}
Object.assign(globalThis, { isConfiguredBotOwner });

function canManageWall(guild, userId) {
  if (!guild || !userId) return false;
  const id = String(userId);
  if (typeof canManageSecurityFeature === "function") return canManageSecurityFeature(guild, id, "wall");
  return isConfiguredBotOwner(id) || (Array.isArray(guildData(guild.id).extraOwners) && guildData(guild.id).extraOwners.includes(id));
}
Object.assign(globalThis, { canManageWall });

function isAuthorized(msg, guildId) {
  if (msg._soezyOwnerSecurityCommand) {
    return msg._soezyOwnerSecurityFeature === "wall"
      ? canManageWall(msg.guild, msg.author.id)
      : canManageAntiNuke(msg.guild, msg.author.id);
  }
  if (isConfiguredBotOwner(msg.author.id)) return true;
  if (msg.guild?.ownerId === msg.author.id) return true;
  if (msg.member?.permissions?.has?.(PermissionsBitField.Flags.Administrator)) return true;
  if (msg.member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild)) return true;
  if (typeof hasGuildPermission === "function" ? (hasGuildPermission(msg.member, ["Administrator"]) || hasGuildPermission(msg.member, ["ManageGuild"])) : false) return true;
  return false;
}

/**
 * Same as isAuthorized but for slash command / button interaction objects.
 */
function isAuthorizedInteraction(interaction) {
  if (isOwnerSecurityInteraction(interaction)) {
    const isWallFeature = interaction.commandName === "wall" || /^(wscfg_|wsmod_)/.test(interaction.customId || "");
    return isWallFeature
      ? canManageWall(interaction.guild, interaction.user.id)
      : canManageAntiNuke(interaction.guild, interaction.user.id);
  }
  const guildId = interaction.guildId;
  if (isConfiguredBotOwner(interaction.user.id)) return true;
  if (interaction.guild?.ownerId === interaction.user.id) return true;
  if (interaction.member?.permissions?.has?.(PermissionsBitField.Flags.Administrator)) return true;
  if (interaction.member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild)) return true;
  if (interaction.memberPermissions?.has?.(PermissionsBitField.Flags.Administrator)) return true;
  if (interaction.memberPermissions?.has?.(PermissionsBitField.Flags.ManageGuild)) return true;
  if (typeof hasGuildPermission === "function" ? (hasGuildPermission(interaction.member, ["Administrator"]) || hasGuildPermission(interaction.member, ["ManageGuild"])) : false) return true;
  return false;
}

/**
 * Permission check used by command handlers.
 * Takes (userId, guildId) — mirrors isAuthorized but without a full msg object.
 * Returns true for: bot owners, guild owner, Administrators, or Manage Server.
 */
function isOwner(userId, guildId) {
  if (isConfiguredBotOwner(userId)) return true;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return false;
  if (guild.ownerId === userId) return true;
  const member = guild.members.cache.get(userId);
  if (member?.permissions?.has?.(PermissionsBitField.Flags.Administrator)) return true;
  if (member?.permissions?.has?.(PermissionsBitField.Flags.ManageGuild)) return true;
  if (typeof hasGuildPermission === "function" ? (hasGuildPermission(member, ["Administrator"]) || hasGuildPermission(member, ["ManageGuild"])) : false) return true;
  return false;
}

/**
 * Safe guild-scoped field accessor.
 * Usage: getGF(guildId, 'ticket')
 * Returns the per-guild field, initializing if needed.
 */
function getGF(guildId, field) {
  if (!guildId) return null;
  return guildData(guildId)[field];
}

/**
 * Set a guild-scoped field value and save.
 * Usage: setGF(guildId, 'ticket', updatedObj)
 */
function setGF(guildId, field, value) {
  if (!guildId) return;
  guildData(guildId)[field] = value;
  saveDB();
}

function initDB() {
  const prunedGuildBuckets = pruneInvalidGuildBuckets();
  const migratedWordLists = migrateGlobalWordListsToGuilds();
  // ── Global (top-level db) fields only ──
  // All per-guild fields are handled lazily by initGuildDB() inside guildData()

  // Per-guild feature toggles
  if (!db.guildSystems)  db.guildSystems  = {};
  // Global feature toggles (bot-owner level)
  if (!db.globalSystems) db.globalSystems = {};
  if (!db.global || typeof db.global !== "object") db.global = {};
  if (!db.global.features || typeof db.global.features !== "object") db.global.features = {};
  for (const [key, value] of Object.entries(db.globalSystems)) {
    if (db.global.features[key] === undefined && typeof value === "boolean") db.global.features[key] = value;
  }

  // Premium System
  if (!db.premium)         db.premium        = { users: {}, guilds: {} };
  if (!db.premium.users)   db.premium.users  = {};
  if (!db.premium.guilds)  db.premium.guilds = {};

  // Prefixes
  if (!db.prefixes) db.prefixes = {};

  // Global AFK (cross-server AFK storage)
  if (!db.globalAfk) db.globalAfk = {};

  // ── Re-hydrate in-memory caches from every guild already in the database ──
  if (db.guilds) {
    for (const gId of getKnownGuildIds()) {
      const g = guildData(gId); // ensures initGuildDB ran for this guild

      // Normalise auto-delete map (remove bad entries)
      if (g.autoDeleteTextOnly && typeof g.autoDeleteTextOnly === "object") {
        for (const [channelId, duration] of Object.entries(g.autoDeleteTextOnly)) {
          if (typeof duration !== "number" || duration <= 0) {
            delete g.autoDeleteTextOnly[channelId];
          }
        }
      }

      // Normalise global auto-responder keys to lowercase
      if (g.globalAutoResponders && typeof g.globalAutoResponders === "object") {
        const normalised = {};
        for (const [trigger, data] of Object.entries(g.globalAutoResponders)) {
          normalised[trigger.toLowerCase().trim()] = data;
        }
        g.globalAutoResponders = normalised;
      }
      if (g.autoresponder?.triggers && typeof g.autoresponder.triggers === "object") {
        const normalised = {};
        for (const [trigger, data] of Object.entries(g.autoresponder.triggers)) {
          normalised[trigger.toLowerCase().trim()] = data;
        }
        g.autoresponder.triggers = normalised;
      }

      // Populate giveaways Map
      if (g.giveaways && typeof g.giveaways === "object") {
        for (const [id, data] of Object.entries(g.giveaways)) {
          giveaways.set(id, data);
        }
      }
    }
  }

  if (prunedGuildBuckets) console.warn(`[DB] Preserved ${prunedGuildBuckets} legacy guild bucket(s); excluded from runtime guild enumeration.`);
  if (migratedWordLists) console.log("[DB] Migrated global bad-word/NSFW lists into guild configs.");
  saveDB();

  // ── DEAD CODE removed (was referencing undefined _gId / guildId) ──
  // Per-guild defaults are now fully covered by initGuildDB(). Nothing more needed here.
  if (false) {
  
  // Welcome System
  if (!guildData(guildId).welcome) guildData(guildId).welcome = { 
    enabled: false, 
    channel: null, 
    message: "Welcome {user} to {server}!", 
    embedEnabled: true,
    dmEnabled: false,
    dmMessage: ""
  };
  
  // Goodbye System
  if (!guildData(guildId).goodbye) guildData(guildId).goodbye = { 
    enabled: false, 
    channel: null, 
    message: "Goodbye {user}! We'll miss you.", 
    embedEnabled: true 
  };
  
  // Greet (legacy support)
  if (!guildData(guildId).greet) guildData(guildId).greet = { channel: null, message: "" };
  
  // Embeds
  if (!guildData(guildId).embeds) guildData(guildId).embeds = {};
  if (!guildData(guildId).embedChannel) guildData(guildId).embedChannel = null;
  
  // Boost System
  if (!guildData(guildId).boost) {
    guildData(guildId).boost = {
      enabled: false,
      channel: null,
      embed: {
        title: "",
        description: "",
        image: null,
        footer: "",
        timestamp: false,
        color: ""
      }
    };
  }
  
  // AFK System
  if (!guildData(guildId).afk) guildData(guildId).afk = { 
    enabled: false, 
    message: "{user} is AFK: {reason}", 
    users: {} 
  };
  
  // No-Prefix Users
  if (!guildData(guildId).noPrefixUsers) guildData(guildId).noPrefixUsers = [];

  // Disabled Channels
  if (!guildData(guildId).disabledChannels) guildData(guildId).disabledChannels = [];
  
  // Disabled Commands per guild
  if (!guildData(guildId).disabledCommands) guildData(guildId).disabledCommands = {};
  
  // Auto Delete Channels
  if (!guildData(guildId).autoDeleteChannels) guildData(guildId).autoDeleteChannels = [];
  if (!guildData(guildId).autoDeleteTextOnly) guildData(guildId).autoDeleteTextOnly = {};
  
  // Ticket System
  if (!guildData(guildId).ticket) {
    guildData(guildId).ticket = {
      enabled: false,
      channel: "",
      category: "",
      supportRole: "",
      logs: "",
      transcriptChannel: null,
      embed: { title: "", description: "", color: "", image: "", footer: "" },
      tickets: {},
      maxTickets: 5,
      autoClose: false,
      dmOnClose: true
    };
  }
  if (guildData(guildId).ticket && guildData(guildId).ticket.maxTickets === undefined) guildData(guildId).ticket.maxTickets = 5;
  if (guildData(guildId).ticket && guildData(guildId).ticket.autoClose === undefined) guildData(guildId).ticket.autoClose = false;
  if (guildData(guildId).ticket && guildData(guildId).ticket.dmOnClose === undefined) guildData(guildId).ticket.dmOnClose = true;
  
  // Moderation Logs
  if (!guildData(guildId).modLogs) guildData(guildId).modLogs = null;
  
  // Confession System
  if (!guildData(guildId).confession) guildData(guildId).confession = {
    enabled: false,
    channel: null,
    logs: null,
    lastId: 0,
    bannedUsers: [],
    confessions: []
  };
  // Legacy support
  if (!guildData(guildId).confessions) guildData(guildId).confessions = [];
  if (!guildData(guildId).confessionChannel) guildData(guildId).confessionChannel = null;
  if (!guildData(guildId).confessionLogs) guildData(guildId).confessionLogs = null;
  if (!guildData(guildId).confessionLastId) guildData(guildId).confessionLastId = 0;
  if (!guildData(guildId).confessionBannedUsers) guildData(guildId).confessionBannedUsers = [];
  
  // Role Systems
  if (!guildData(guildId).autoRoles) guildData(guildId).autoRoles = {};
  if (!guildData(guildId).selfRoles) guildData(guildId).selfRoles = {};
  if (!guildData(guildId).buttonRoles) guildData(guildId).buttonRoles = {};
  if (!guildData(guildId).dropdownRoles) guildData(guildId).dropdownRoles = {};
  if (!guildData(guildId).connectionRoles) guildData(guildId).connectionRoles = {};
  if (!guildData(guildId).customRoles) guildData(guildId).customRoles = { enabled: false, maxRoles: 1, users: {} };
  
  // Statistics
  if (!guildData(guildId).messageCount) guildData(guildId).messageCount = {};
  
  // Birthday System
  if (!guildData(guildId).birthday) guildData(guildId).birthday = {
    enabled: false,
    channel: null,
    role: null,
    message: "🎂 Happy Birthday {user}! 🎉",
    users: {}
  };
  // Legacy support
  if (!guildData(guildId).birthdays) guildData(guildId).birthdays = {};
  if (!guildData(guildId).birthdayRoles) guildData(guildId).birthdayRoles = {};
  if (!guildData(guildId).birthdayMessages) guildData(guildId).birthdayMessages = {};
  if (!guildData(guildId).birthdayChecked) guildData(guildId).birthdayChecked = {};
  
  // Filter Immunities
  if (!guildData(guildId).badWordImmuneRoles) guildData(guildId).badWordImmuneRoles = [];
  if (!guildData(guildId).badWordImmuneChannels) guildData(guildId).badWordImmuneChannels = [];
  if (!guildData(guildId).nsfwImmuneRoles) guildData(guildId).nsfwImmuneRoles = [];
  if (!guildData(guildId).nsfwImmuneChannels) guildData(guildId).nsfwImmuneChannels = [];
  
  // Reminders
  if (!guildData(guildId).reminders) guildData(guildId).reminders = [];
  if (!guildData(guildId).reminderChannel) guildData(guildId).reminderChannel = {};
  
  // Auto Responders
  if (!guildData(guildId).autoresponder) guildData(guildId).autoresponder = { enabled: true, triggers: {} };
  if (!guildData(guildId).globalAutoResponders) guildData(guildId).globalAutoResponders = {};
  
  // Auto React
  if (!guildData(guildId).autoreact) guildData(guildId).autoreact = { enabled: true, triggers: {} };
  if (!guildData(guildId).autoReact) guildData(guildId).autoReact = {};
  
  // Media System
  if (!guildData(guildId).media) guildData(guildId).media = {
    enabled: false,
    uploadLogsChannel: null,
    deleteLogsChannel: null,
    onlyChannels: [],
    logs: {}
  };
  if (guildData(guildId).media.deleteLogsChannel === undefined) {
    guildData(guildId).media.deleteLogsChannel = guildData(guildId).mediaDeleteChannel || null;
  }
  if (guildData(guildId).media.uploadLogsChannel === undefined) {
    guildData(guildId).media.uploadLogsChannel = guildData(guildId).media.deleteLogsChannel || guildData(guildId).mediaDeleteChannel || null;
  }
  if (!guildData(guildId).mediaDeleteLogs) guildData(guildId).mediaDeleteLogs = {};
  if (!guildData(guildId).mediaDeleteChannel) guildData(guildId).mediaDeleteChannel = null;
  if (!guildData(guildId).mediaOnlyChannels) guildData(guildId).mediaOnlyChannels = [];
  
  // Stickers
  if (!guildData(guildId).stolenStickers) guildData(guildId).stolenStickers = {};
  if (!guildData(guildId).stickerChannel) guildData(guildId).stickerChannel = null;
  
  // Giveaways
  if (!guildData(guildId).giveaways) guildData(guildId).giveaways = {};
  if (!guildData(guildId).giveawaySystem) guildData(guildId).giveawaySystem = { enabled: false };

  // Per-guild feature toggles
  if (!db.guildSystems) db.guildSystems = {};

  // Global feature toggles (bot-owner level, applies across all servers)
  if (!db.globalSystems) db.globalSystems = {};

  // Premium System
  if (!db.premium) db.premium = {
    users: {},   // userId -> { plan, expiresAt, activatedBy, activatedAt }
    guilds: {}   // guildId -> { plan, expiresAt, activatedBy, activatedAt }
  };
  if (!db.premium.users)  db.premium.users  = {};
  if (!db.premium.guilds) db.premium.guilds = {};

  // Prefixes
  if (!db.prefixes) db.prefixes = {};
  
  // Roles
  if (!guildData(guildId).roles) guildData(guildId).roles = { selfRoles: {}, connectionRoles: {}, buttonRoles: {}, dropdownRoles: {} };
  
  // Logging System
  if (!guildData(guildId).logging) guildData(guildId).logging = {
    enabled: false,
    channel: null,
    channels: { message: null, moderation: null, joinLeave: null, invite: null, voice: null, action: null, admin: null },
    events: {
      messageDelete: true, messageEdit: false,
      memberJoin: true, memberLeave: true, memberUpdate: true,
      memberBan: true, memberUnban: true, infect: true,
      memberKick: true, memberMute: true, memberUnmute: true, memberWarn: true,
      roleCreate: true, roleDelete: true, roleUpdate: false,
      channelCreate: true, channelDelete: true, channelUpdate: false,
      emojiCreate: true, emojiDelete: true, emojiUpdate: false,
      stickerCreate: true, stickerDelete: true, stickerUpdate: false,
      webhookCreate: true, webhookDelete: true, webhookUpdate: false,
      autoModerationRuleCreate: true, autoModerationRuleDelete: true, autoModerationRuleUpdate: false, autoModerationActionExecution: true,
      voiceJoin: true, voiceLeave: true, voiceMove: true,
      inviteCreate: true, inviteDelete: true,
      nicknameChange: true, guildUpdate: true
    }
  };
  if (!guildData(guildId).logging.channels) guildData(guildId).logging.channels = { message: null, moderation: null, joinLeave: null, invite: null, voice: null, action: null, admin: null };
  { const _d = {
    memberKick:true, memberMute:true, memberUnmute:true, memberWarn:true, memberUpdate:true,
    roleUpdate:false, channelUpdate:false, inviteCreate:true, inviteDelete:true,
    nicknameChange:true, guildUpdate:true,
    emojiCreate:true, emojiDelete:true, emojiUpdate:false,
    stickerCreate:true, stickerDelete:true, stickerUpdate:false,
    webhookCreate:true, webhookDelete:true, webhookUpdate:false,
    autoModerationRuleCreate:true, autoModerationRuleDelete:true, autoModerationRuleUpdate:false, autoModerationActionExecution:true
  };
    for (const [k,v] of Object.entries(_d)) { if (guildData(guildId).logging.events[k] === undefined) guildData(guildId).logging.events[k] = v; } }
  
  // Antibot System
  if (!guildData(guildId).antibot) guildData(guildId).antibot = { 
    enabled: false, 
    joinLogs: null, 
    whitelist: [],
    action: "kick" // kick, ban
  };
  
  // Antinuke System
  if (!guildData(guildId).antinuke) guildData(guildId).antinuke = { 
    enabled: false, 
    whitelist: [], 
    logs: null,
    maxBans: 3,
    maxKicks: 3,
    maxChannelDelete: 3,
    maxRoleDelete: 3,
    punishment: "ban",
    timeWindow: 10000,
    events: {}
  };
  if (!guildData(guildId).antinuke.events) guildData(guildId).antinuke.events = {};
  
  // Antilink System
  if (!guildData(guildId).antilink) guildData(guildId).antilink = { 
    enabled: false, 
    whitelist: [], 
    immuneUsers: [],
    immuneRoles: [], 
    immuneChannels: [],
    action: "delete" // delete, warn, mute, kick, ban
  };
  if (!Array.isArray(guildData(guildId).antilink.immuneUsers)) guildData(guildId).antilink.immuneUsers = [];
  
  // Antispam System
  if (!guildData(guildId).antispam) guildData(guildId).antispam = { 
    enabled: false, 
    maxMessages: 5, 
    interval: 5000, 
    action: "mute", 
    duration: 300000 
  };
  
  // Antimention System
  if (!guildData(guildId).antimention) guildData(guildId).antimention = { 
    enabled: false, 
    maxMentions: 5, 
    action: "mute", 
    duration: 300000 
  };
  
  // Automod
  if (!guildData(guildId).automod) guildData(guildId).automod = {
    enabled: false,
    antiSpam: { enabled: false, maxMessages: 5, interval: 5000, action: "mute", duration: 300000 },
    antiMassMention: { enabled: false, maxMentions: 5, action: "mute", duration: 300000 },
    antiCaps: { enabled: false, percentage: 70, minLength: 10, action: "delete" },
    antiEmoji: { enabled: false, maxEmojis: 10, action: "delete" },
    antiInvite: { enabled: false, action: "delete" }
  };
  if (!guildData(guildId).automodImmuneUsers) guildData(guildId).automodImmuneUsers = [];
  
  // Invites Tracking
  if (!guildData(guildId).invites) guildData(guildId).invites = {};
  if (!guildData(guildId).inviteRewards) guildData(guildId).inviteRewards = {};
  if (!guildData(guildId).inviteSystem) guildData(guildId).inviteSystem = { enabled: false };
  
  // Sticky Messages
  if (!guildData(guildId).stickyMessages) guildData(guildId).stickyMessages = {};
  if (!guildData(guildId).stickySystem) guildData(guildId).stickySystem = { enabled: false };
  
  // Wall System (Role Quarantine)
  if (!guildData(guildId).wallSystem) guildData(guildId).wallSystem = {
    enabled: false,
    immuneRoleId: null,
    quarantineRoleId: null,
    jailChannelId: null,
    roleId: null,
    channelId: null,
    createdRoleId: null,
    createdChannelId: null,
    createdWhitelistRoleId: null,
    createdByBot: {},
    jailerRoleId: null,
    whitelistRoleId: null,
    whitelist: [],
    logChannel: null,
    quarantined: {},
    strikes: {},
    leaderboard: {},
    stats: {},
    strikeLimit: 3,
    strikeWindowMs: 24 * 60 * 60 * 1000,
    restoreRoleId: null,
    restoreRoleIds: []
  };
  // Migrate old wall structure
  if (guildData(guildId).wallSystem && guildData(guildId).wallSystem.messages !== undefined) {
    guildData(guildId).wallSystem = {
      enabled: guildData(guildId).wallSystem.enabled || false,
      immuneRoleId: guildData(guildId).wallSystem.immuneRoleId || null,
      quarantineRoleId: guildData(guildId).wallSystem.quarantineRoleId || null,
      jailChannelId: guildData(guildId).wallSystem.jailChannelId || null,
      roleId: guildData(guildId).wallSystem.roleId || guildData(guildId).wallSystem.quarantineRoleId || null,
      channelId: guildData(guildId).wallSystem.channelId || guildData(guildId).wallSystem.jailChannelId || null,
      createdRoleId: guildData(guildId).wallSystem.createdRoleId || null,
      createdChannelId: guildData(guildId).wallSystem.createdChannelId || null,
      createdWhitelistRoleId: guildData(guildId).wallSystem.createdWhitelistRoleId || null,
      createdByBot: guildData(guildId).wallSystem.createdByBot || {},
      extraOwners: guildData(guildId).wallSystem.extraOwners || [],
      jailerRoleId: guildData(guildId).wallSystem.jailerRoleId || null,
      whitelistRoleId: guildData(guildId).wallSystem.whitelistRoleId || null,
      whitelist: guildData(guildId).wallSystem.whitelist || [],
      logChannel: guildData(guildId).wallSystem.logChannel || null,
      quarantined: guildData(guildId).wallSystem.quarantined || {},
      strikes: guildData(guildId).wallSystem.strikes || {},
      leaderboard: guildData(guildId).wallSystem.leaderboard || {},
      stats: guildData(guildId).wallSystem.stats || {},
      strikeLimit: guildData(guildId).wallSystem.strikeLimit || 3,
      strikeWindowMs: guildData(guildId).wallSystem.strikeWindowMs || 24 * 60 * 60 * 1000,
      restoreRoleId: guildData(guildId).wallSystem.restoreRoleId || null,
      restoreRoleIds: guildData(guildId).wallSystem.restoreRoleIds || []
    };
  }
  // Patch missing fields onto existing wallSystem objects (migration safety)
  { const _ws = guildData(guildId).wallSystem;
    if (!Array.isArray(_ws.extraOwners)) _ws.extraOwners = [];
    _ws.extraOwners = uniqueIdList(_ws.extraOwners);
    if (_ws.jailerRoleId    === undefined) _ws.jailerRoleId    = null;
    if (_ws.whitelistRoleId === undefined) _ws.whitelistRoleId = null;
    if (!Array.isArray(_ws.whitelist))     _ws.whitelist       = [];
    if (_ws.jailChannelId === undefined) _ws.jailChannelId = null;
    if (_ws.roleId === undefined) _ws.roleId = _ws.quarantineRoleId || null;
    if (_ws.channelId === undefined) _ws.channelId = _ws.jailChannelId || null;
    if (_ws.createdRoleId === undefined) _ws.createdRoleId = null;
    if (_ws.createdChannelId === undefined) _ws.createdChannelId = null;
    if (_ws.createdWhitelistRoleId === undefined) _ws.createdWhitelistRoleId = null;
    if (!_ws.createdByBot || typeof _ws.createdByBot !== "object" || Array.isArray(_ws.createdByBot)) _ws.createdByBot = {};
    if (!_ws.strikes || typeof _ws.strikes !== "object" || Array.isArray(_ws.strikes)) _ws.strikes = {};
    if (!_ws.leaderboard || typeof _ws.leaderboard !== "object" || Array.isArray(_ws.leaderboard)) _ws.leaderboard = {};
    if (!_ws.stats || typeof _ws.stats !== "object" || Array.isArray(_ws.stats)) _ws.stats = {};
    if (!_ws.strikeLimit) _ws.strikeLimit = 3;
    if (!_ws.strikeWindowMs) _ws.strikeWindowMs = 24 * 60 * 60 * 1000;
    if (_ws.restoreRoleId === undefined) _ws.restoreRoleId = null;
    if (!Array.isArray(_ws.restoreRoleIds)) _ws.restoreRoleIds = _ws.restoreRoleId ? [_ws.restoreRoleId] : [];
    if (!guildData(guildId).wall || typeof guildData(guildId).wall !== "object" || Array.isArray(guildData(guildId).wall)) guildData(guildId).wall = {};
    guildData(guildId).wall.roleId = _ws.roleId || _ws.quarantineRoleId || null;
    guildData(guildId).wall.channelId = _ws.channelId || _ws.jailChannelId || null;
    guildData(guildId).wall.enabled = _ws.enabled === true;
  }
  if (!guildData(guildId).settings || typeof guildData(guildId).settings !== "object" || Array.isArray(guildData(guildId).settings)) guildData(guildId).settings = {};
  if (!guildData(guildId).settings.nightmode || typeof guildData(guildId).settings.nightmode !== "object" || Array.isArray(guildData(guildId).settings.nightmode)) {
    guildData(guildId).settings.nightmode = { enabled: true, startHour: 0, endHour: 6, forceActive: false, updatedAt: null, updatedBy: null };
  }
  if (!guildData(guildId).nightmode || typeof guildData(guildId).nightmode !== "object" || Array.isArray(guildData(guildId).nightmode)) {
    guildData(guildId).nightmode = guildData(guildId).settings.nightmode;
  }
  
  // NSFW Protection
  if (guildData(guildId).nsfwProtection === undefined) guildData(guildId).nsfwProtection = false;
  
  // Temp Voice
  if (!guildData(guildId).tempVoice) guildData(guildId).tempVoice = { 
    enabled: false, 
    createChannel: null,
    privateCreateChannel: null,
    category: null, 
    channels: {},
    defaultName: "{user}'s Channel",
    defaultLimit: 0
  };
  
  // Join DM
  if (!guildData(guildId).joinDm) guildData(guildId).joinDm = { 
    enabled: false, 
    message: "Welcome to {server}!" 
  };
  
  // Warnings
  if (!guildData(guildId).warnings) guildData(guildId).warnings = {};
  
  // User Info
  if (!guildData(guildId).userInfo) guildData(guildId).userInfo = {};
  
  // Server Stats
  if (!guildData(guildId).serverStats) guildData(guildId).serverStats = { enabled: false, channels: {} };
  
  // Reaction Roles
  if (!guildData(guildId).reactionRoles) guildData(guildId).reactionRoles = {};

  // Per-Guild Bot Identity (nickname, custom avatar/banner for embeds)
  if (!guildData(guildId).guildBotIdentity) guildData(guildId).guildBotIdentity = {};
  
  // Polls
  if (!guildData(guildId).polls) guildData(guildId).polls = {};
  
  // Music
  if (!guildData(guildId).music) guildData(guildId).music = { 
    enabled: true,
    queues: {}, 
    djRole: null,
    defaultVolume: 100,
    twentyFourSeven: false,
    autoLeaveTimeoutMs: 180000
  };
  if (guildData(guildId).music.twentyFourSeven === undefined) guildData(guildId).music.twentyFourSeven = false;
  if (!guildData(guildId).music.autoLeaveTimeoutMs) guildData(guildId).music.autoLeaveTimeoutMs = 180000;
  

  // Economy
  if (!guildData(guildId).economy) guildData(guildId).economy = { 
    enabled: true,
    users: {}, 
    daily: 1, 
    work: { min: 50, max: 200 }, 
    shopItems: {},
    currency: "💰"
  };
  
  // Counting
  if (!guildData(guildId).counting) guildData(guildId).counting = {};
  if (!guildData(guildId).countingSystem) guildData(guildId).countingSystem = { enabled: false };
  
  // Suggestions
  if (!guildData(guildId).suggestions) guildData(guildId).suggestions = { 
    enabled: false,
    channel: null, 
    count: 0 
  };
  
  
  // Voice Roles
  if (!guildData(guildId).voiceRoles) guildData(guildId).voiceRoles = {};
  
  // Fun System
  if (!guildData(guildId).fun) guildData(guildId).fun = { enabled: true };

  // Load auto delete
  autoDeleteTextOnly.clear();
  if (guildData(guildId).autoDeleteTextOnly && typeof guildData(guildId).autoDeleteTextOnly === "object") {
    for (const [channelId, duration] of Object.entries(guildData(guildId).autoDeleteTextOnly)) {
      if (typeof duration === "number" && duration > 0) {
        guildData(guildId).autoDeleteTextOnly[channelId] = duration;
      }
    }
  }

  // Load auto responders
  globalAutoResponders.clear();
  const responderSources = {
    ...(guildData(guildId).globalAutoResponders || {}),
    ...(guildData(guildId).autoresponder?.triggers || {}),
  };
  for (const [trigger, data] of Object.entries(responderSources)) {
    const key = trigger.toLowerCase().trim();
    guildData(guildId).globalAutoResponders[key] = data;
    if (!guildData(guildId).autoresponder.triggers) guildData(guildId).autoresponder.triggers = {};
    guildData(guildId).autoresponder.triggers[key] = data;
    globalAutoResponders.set(`${guildId}:${key}`, data);
  }

  // Load stolen stickers
  stolenStickers.clear();
  for (const [id, data] of Object.entries(guildData(guildId).stolenStickers)) {
    guildData(guildId).stolenStickers[id] = data;
  }

  // Load giveaways
  for (const [id, data] of Object.entries(guildData(guildId).giveaways)) {
    giveaways.set(id, data);
  }

  } // end if(false) — dead code guard
}

initDB();
