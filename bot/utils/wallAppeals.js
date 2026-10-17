/* Persistent wall appeal panels and private chats; no per-panel collectors. */
(() => {
const locks = new Set();
const setupJobs = new Map();
const F = PermissionsBitField.Flags;
const channel = (guild, id) => id ? guild.channels.fetch(id).catch(error => {
  if (error.code === 10003) return null;
  throw error;
}) : Promise.resolve(null);

function wallAppealAllowsMessage(ws, userId, channelId) {
  return ws.appeals?.[userId]?.channelId === channelId || ws.appealVoiceChannelId === channelId;
}

function staffOverwrites(guild, ws) {
  const ids = new Set([guild.client.user.id, appealStaffRole(guild.id, ws) || guild.ownerId]);
  return [...ids].map(id => ({ id, allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory, F.Connect, F.Speak] }));
}

function appealStaffRole(guildId, ws) {
  return guildData(guildId).autoJail?.adminRoleId || ws.appealAdminRoleId || ws.jailerRoleId;
}

async function wallEnsureAppealPanel(guild, lobby, role) {
  const ws = ensureWallState(guild.id);
  await lobby.permissionOverwrites.edit(role, {
    ViewChannel: true, ReadMessageHistory: true, SendMessages: false,
    SendMessagesInThreads: false, CreatePublicThreads: false, CreatePrivateThreads: false, AddReactions: false,
  });
  ws.appealChannelId = lobby.id;
  const previous = ws.appealPanelMessageId ? await lobby.messages.fetch(ws.appealPanelMessageId).catch(error => {
    if (error.code === 10008) return null;
    throw error;
  }) : null;
  if (previous) await previous.delete();
  ws.appealPanelMessageId = null;
  let voice = await channel(guild, ws.appealVoiceChannelId);
  if (!voice) {
    voice = await guild.channels.create({ name: "wall-appeal-voice", type: ChannelType.GuildVoice,
      ...(ws.categoryId ? { parent: ws.categoryId } : {}),
      permissionOverwrites: [{ id: guild.id, deny: [F.ViewChannel] },
        { id: role.id, allow: [F.ViewChannel, F.Connect, F.Speak], deny: [F.SendMessages] }, ...staffOverwrites(guild, ws)],
      reason: "Shared wall appeal voice channel" });
    ws.appealVoiceChannelId = voice.id;
    ws.createdAppealVoiceChannelId = voice.id;
  }
  if (voice.type !== ChannelType.GuildVoice) throw new Error("The appeal voice channel must be a voice channel.");
  if (ws.categoryId && voice.parentId !== ws.categoryId) await voice.setParent(ws.categoryId, { lockPermissions: false, reason: "Wall category setup" });
  await voice.permissionOverwrites.edit(role, { ViewChannel: true, Connect: true, Speak: true, SendMessages: false });
  wallSaveAndSync(guild.id, "wall_appeal_setup");
}

async function wallNotifyAutoJailAppeal(member) {
  const guild = member.guild;
  const ws = ensureWallState(guild.id);
  if (!ws?.enabled || !ws.quarantined?.[guild.id]?.[member.id]) return false;
  const lobby = await channel(guild, ws.jailChannelId || ws.channelId);
  if (!lobby?.isTextBased?.()) throw new Error("Wall jail channel is unavailable.");
  if (ws.appealChannelId !== lobby.id) {
    let job = setupJobs.get(guild.id);
    if (!job) {
      job = (async () => {
        const role = await guild.roles.fetch(ws.quarantineRoleId || ws.roleId);
        if (!role) throw new Error("Wall quarantine role is unavailable.");
        await wallEnsureAppealPanel(guild, lobby, role);
      })();
      setupJobs.set(guild.id, job);
    }
    try { await job; }
    finally { if (setupJobs.get(guild.id) === job) setupJobs.delete(guild.id); }
  }
  const container = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent("### Jailed User"))
    .addSeparatorComponents(s => s.setDivider(true))
    .addTextDisplayComponents(t => t.setContent(`<@${member.id}>\nYou have been jailed. Submit an appeal for staff to review your case.`))
    .addSeparatorComponents(s => s.setDivider(true))
    .addActionRowComponents(row => row.addComponents(new ButtonBuilder()
      .setCustomId(`wallappeal_open_${member.id}`).setLabel("Appeal").setStyle(ButtonStyle.Primary)));
  await lobby.send({ components: [container], flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], users: [member.id], roles: [] } });
  return true;
}

async function handleWallAppealInteraction(i) {
  const configSelection = i.isStringSelectMenu?.() && i.customId.startsWith("wscfg_select_") && i.values?.[0]?.startsWith("wscfg_appeals_");
  if (!configSelection && !i.customId?.startsWith("wallappeal_")) return false;
  const respond = text => i.replied || i.deferred ? i.editReply({ content: text }) : i.reply({ content: text, flags: 64 });
  if (!i.guild) { await respond("This is only available in a server."); return true; }
  const ws = ensureWallState(i.guildId);
  const decision = /^wallappeal_(approve|cancel|close)_(\d{17,20})$/.exec(i.customId || "");
  const key = `${i.guildId}:${decision?.[2] || i.user.id}`;
  let locked = false;
  try {
    if (configSelection || i.customId.startsWith("wallappeal_config_")) {
      if (!isAuthorizedInteraction(i)) { await respond("Administrators only."); return true; }
      if (configSelection) {
        const sessionId = i.customId.slice("wscfg_select_".length);
        if (!isSessionOwner(sessionId, i.user.id)) { await respond("This is not your configuration panel."); return true; }
        const modal = new ModalBuilder().setCustomId(`wallappeal_config_${i.user.id}`).setTitle("Wall Appeals");
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("admin").setLabel("Admin ping role ID (blank: server owner)").setStyle(TextInputStyle.Short).setRequired(false).setValue(ws.appealAdminRoleId || "")),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("voice").setLabel("Shared voice channel ID").setStyle(TextInputStyle.Short).setRequired(false).setValue(ws.appealVoiceChannelId || "")));
        await i.showModal(modal); return true;
      }
      if (!i.isModalSubmit() || i.customId !== `wallappeal_config_${i.user.id}`) { await respond("Invalid configuration session."); return true; }
      await i.deferReply({ flags: 64 });
      const roleId = i.fields.getTextInputValue("admin").trim();
      const voiceId = i.fields.getTextInputValue("voice").trim();
      const role = roleId ? await i.guild.roles.fetch(roleId) : null;
      const voice = await channel(i.guild, voiceId);
      if ((roleId && (!role || role.id === i.guildId || role.id === ws.quarantineRoleId || role.managed)) || (voiceId && voice?.type !== ChannelType.GuildVoice)) {
        await respond("Choose a valid staff role (not @everyone or a managed role) and a voice channel in this server."); return true;
      }
      if (voice && ws.quarantineRoleId) {
        await voice.permissionOverwrites.edit(ws.quarantineRoleId, { ViewChannel: true, Connect: true, Speak: true, SendMessages: false });
        await voice.permissionOverwrites.edit(role?.id || i.guild.ownerId, { ViewChannel: true, Connect: true, Speak: true });
      }
      if (ws.appealVoiceChannelId && ws.appealVoiceChannelId !== voice?.id && ws.quarantineRoleId) {
        const previousVoice = await channel(i.guild, ws.appealVoiceChannelId);
        if (previousVoice) await previousVoice.permissionOverwrites.edit(ws.quarantineRoleId, { ViewChannel: false, Connect: false });
      }
      ws.appealAdminRoleId = role?.id || null;
      ws.appealVoiceChannelId = voice?.id || null;
      wallSaveAndSync(i.guildId, "wall_appeal_config");
      await respond("Wall appeal settings saved. The admin ping role applies to new appeals."); return true;
    }
    await i.deferReply({ flags: 64 });
    if (locks.has(key)) { await respond("Your appeal is already being processed."); return true; }
    locks.add(key); locked = true;
    ws.appeals ||= {};
    if (i.customId === "wallappeal_open" || i.customId.startsWith("wallappeal_open_")) {
      if (i.customId !== "wallappeal_open" && i.customId !== `wallappeal_open_${i.user.id}`) {
        await respond("This appeal button belongs to another member."); return true;
      }
      if (!ws.enabled || i.channelId !== ws.appealChannelId || !ws.quarantined?.[i.guildId]?.[i.user.id]) {
        await respond("Only quarantined members can open an appeal from the wall panel."); return true;
      }
      const existing = await channel(i.guild, ws.appeals[i.user.id]?.channelId);
      if (existing) { await respond(`Your appeal is already open: <#${existing.id}>`); return true; }
      const text = await i.guild.channels.create({ name: `appeal-${i.user.id}`, type: ChannelType.GuildText,
        ...(ws.categoryId ? { parent: ws.categoryId } : {}),
        permissionOverwrites: [{ id: i.guildId, deny: [F.ViewChannel] },
          { id: ws.quarantineRoleId, deny: [F.ViewChannel] },
          { id: i.user.id, allow: [F.ViewChannel, F.SendMessages, F.ReadMessageHistory, F.AttachFiles],
            deny: [F.MentionEveryone, F.CreatePublicThreads, F.CreatePrivateThreads] }, ...staffOverwrites(i.guild, ws)],
        reason: "Wall appeal requested" });
      ws.appeals[i.user.id] = { channelId: text.id, openedAt: Date.now() };
      wallSaveAndSync(i.guildId, "wall_appeal_open");
      const roleId = appealStaffRole(i.guildId, ws);
      const panel = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent("### Appeal"))
        .addSeparatorComponents(s => s.setDivider(true))
        .addTextDisplayComponents(t => t.setContent(`${roleId ? `<@&${roleId}>` : `<@${i.guild.ownerId}>`}\n<@${i.user.id}> has requested a review of their jail. Approve to release them, or cancel to keep them jailed.`))
        .addSeparatorComponents(s => s.setDivider(true))
        .addActionRowComponents(row => row.addComponents(
          new ButtonBuilder().setCustomId(`wallappeal_approve_${i.user.id}`).setLabel("Approve").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`wallappeal_cancel_${i.user.id}`).setLabel("Cancel").setStyle(ButtonStyle.Danger)));
      try { await text.send({ flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [], roles: roleId ? [roleId] : [], users: roleId ? [] : [i.guild.ownerId] },
        components: [panel] });
      } catch (error) {
        await text.delete("Incomplete wall appeal setup").then(() => { delete ws.appeals[i.user.id]; wallSaveAndSync(i.guildId, "wall_appeal_rollback"); }).catch(() => {});
        throw error;
      }
      await respond(`Your appeal: <#${text.id}>${ws.appealVoiceChannelId ? `\nShared voice: <#${ws.appealVoiceChannelId}>` : ""}`);
      return true;
    }
    if (decision) {
      const [, action, userId] = decision;
      const roleId = appealStaffRole(i.guildId, ws);
      const staff = isAuthorizedInteraction(i) || (roleId && i.member?.roles?.cache?.has(roleId));
      const appeal = ws.appeals[userId];
      if (!staff || appeal?.channelId !== i.channelId) { await respond("Only appeal staff can decide this appeal."); return true; }
      if (action === "approve") {
        const logs = await channel(i.guild, ws.logChannel);
        if (!logs || logs.id === i.channelId || typeof logs.send !== "function") {
          await respond("Set a valid wall log channel before approving this appeal."); return true;
        }
        if (!appeal.approvedAt) {
          const member = await i.guild.members.fetch(userId);
          if (!ws.quarantined?.[i.guildId]?.[userId]) { await respond("This member is no longer jailed. Cancel to close the appeal."); return true; }
          await wallReleaseMember(member, { auditReason: `Wall appeal approved by ${i.user.id}` });
          const aj = guildData(i.guildId).autoJail;
          if (aj) {
            aj.jailedUsers = (aj.jailedUsers || []).filter(id => id !== userId);
            if (aj.violations?.[userId]) delete aj.violations[userId].releaseAt;
          }
          appeal.approvedAt = Date.now(); appeal.approvedBy = i.user.id;
          wallSaveAndSync(i.guildId, "wall_appeal_approved");
        }
        if (!appeal.approvalLogId) {
          const log = await logs.send({ flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] },
            components: [new ContainerBuilder()
              .addTextDisplayComponents(t => t.setContent("### Wall Appeal Approved"))
              .addSeparatorComponents(s => s.setDivider(true))
              .addTextDisplayComponents(t => t.setContent(`**User:** <@${userId}>\n**Approved by:** <@${appeal.approvedBy}>\nThe member was released from jail.\n**Appeal channel:** \`${i.channelId}\``))
              .addSeparatorComponents(s => s.setDivider(true))
              .addTextDisplayComponents(t => t.setContent(`-# ${i.guild.name} | <t:${Math.floor(appeal.approvedAt / 1000)}:f>`))] });
          appeal.approvalLogId = log.id;
          wallSaveAndSync(i.guildId, "wall_appeal_logged");
        }
      } else if (appeal.approvedAt) {
        await respond("This appeal was approved. Use Approve again to finish logging and closing it."); return true;
      }
      await respond(action === "approve" ? "Approved. The member is unjailed; closing the channel." : "Cancelled. The member stays jailed; closing the channel.");
      await i.channel.delete(`Wall appeal ${action === "approve" ? "approved" : "cancelled"} by ${i.user.id}`);
      delete ws.appeals[userId];
      wallSaveAndSync(i.guildId, "wall_appeal_close");
      return true;
    }
    await respond("Unknown appeal action.");
  } catch (error) {
    console.error("[WALL APPEAL]", error.message);
    await respond("The appeal action could not be completed. Check my channel permissions and try again.").catch(() => {});
  } finally { if (locked) locks.delete(key); }
  return true;
}
Object.assign(globalThis, { wallEnsureAppealPanel, wallNotifyAutoJailAppeal, handleWallAppealInteraction, wallAppealAllowsMessage });
})();
