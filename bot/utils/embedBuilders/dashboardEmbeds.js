/* ================= DASHBOARD, TICKET, GIVEAWAY, AND SCHEDULE EMBEDS ================= */

/* ================= TICKET SYSTEM ================= */

async function generateTicketTranscript(channel, ticket, closedBy = null) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sortedMessages = [...messages.values()]
      .filter(m => !m.author.bot)
      .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    // Resolve creator username
    let creatorName = ticket.userId || "Unknown";
    try {
      const creatorUser = await client.users.fetch(ticket.userId).catch(() => null);
      if (creatorUser) creatorName = creatorUser.username;
    } catch { }

    // Resolve closer username
    let closerName = "Unknown";
    const closerIdRaw = closedBy || ticket.closedBy;
    if (closerIdRaw) {
      try {
        const closerUser = await client.users.fetch(closerIdRaw).catch(() => null);
        closerName = closerUser ? closerUser.username : closerIdRaw;
      } catch { closerName = closerIdRaw; }
    }

    let transcript = `\u2554${"\u2550".repeat(42)}\u2557\n`;
    transcript += `\u2551            TICKET TRANSCRIPT             \u2551\n`;
    transcript += `\u255a${"\u2550".repeat(42)}\u255d\n\n`;
    transcript += `Ticket ID: #${ticket.number}\n`;
    transcript += `Created by: ${creatorName}\n`;
    transcript += `Created at: ${new Date(ticket.createdAt).toLocaleString()}\n`;
    transcript += `Closed at:  ${new Date().toLocaleString()}\n`;
    transcript += `Closed by:  ${closerName}\n`;
    transcript += `Messages:   ${sortedMessages.length}\n`;
    transcript += `\n${"\u2500".repeat(42)}\n\n`;

    for (const msg of sortedMessages) {
      const time = new Date(msg.createdTimestamp).toLocaleString();
      const author = msg.author.username;
      const content = msg.content || '[No text content]';

      transcript += `[${time}] ${author}\n`;
      transcript += `${content.split('\n').join('\n  ')}\n`;

      if (msg.attachments.size > 0) {
        transcript += `  Attachments:\n`;
        msg.attachments.forEach(att => {
          transcript += `    - ${att.name}: ${att.url}\n`;
        });
      }

      if (msg.embeds.length > 0) {
        transcript += `  Embeds: ${msg.embeds.length} embed(s)\n`;
      }

      transcript += `\n`;
    }

    transcript += `${"\u2500".repeat(42)}\n`;
    transcript += `             END OF TRANSCRIPT\n`;
    transcript += `${"\u2500".repeat(42)}\n`;

    return transcript;
  } catch (error) {
    console.error("Error generating transcript:", error);
    return null;
  }
}
async function saveTicketTranscript(guild, channel, ticket, closedBy) {
  const guildId = guild.id;
  const transcript = await generateTicketTranscript(channel, ticket, closedBy);
  if (!transcript) return null;

  const fileName = `ticket-${ticket.number}-transcript.txt`;
  const transcriptBuffer = Buffer.from(transcript, "utf8");
  const nowTs = Math.floor(Date.now() / 1000);

  const transcriptConfig = guildData(guildId).ticket || {};
  const transcriptChannel = transcriptConfig.transcriptChannel
    ? (guild.channels.cache.get(transcriptConfig.transcriptChannel) ||
      await guild.channels.fetch(transcriptConfig.transcriptChannel).catch(() => null))
    : null;
  if (transcriptChannel?.isTextBased?.()) {
    await transcriptChannel.send({
      files: [new AttachmentBuilder(transcriptBuffer, { name: fileName })],
    }).catch(() => {});
  }

  // Safely resolve user & closer – guard against undefined IDs
  let ticketUser = null;
  if (ticket.userId) {
    try { ticketUser = await client.users.fetch(ticket.userId).catch(() => null); } catch { }
  }
  let closerUser = null;
  if (closedBy) {
    try { closerUser = await client.users.fetch(closedBy).catch(() => null); } catch { }
  }
  const userMention = ticket.userId ? `<@${ticket.userId}>` : '`Unknown`';
  const closerMention = closedBy ? `<@${closedBy}>` : '`Unknown`';
  const msgCount = ticket.messages?.length || 0;
  const duration = formatDuration(Date.now() - (ticket.createdAt || Date.now()));

  //  DM the ticket creator (only if we could resolve the user) 
  if (ticketUser) {
    try {
      const dmContainer = new ContainerBuilder()
        .addTextDisplayComponents(t => t.setContent(`${EMOJIS.hmm} **Your Ticket Has Been Closed**`))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(t => t.setContent(
          `${getEmoji("arrow")} **Ticket:** #${ticket.number}\n` +
          `${getEmoji("arrow")} **Server:** ${guild.name}\n` +
          `${getEmoji("arrow")} A transcript of your conversation is attached below.`
        ))
        .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(t => t.setContent(`-# Closed by ${closerMention} • <t:${nowTs}:F>`));
      await ticketUser.send({
        components: [dmContainer],
        files: [new AttachmentBuilder(transcriptBuffer, { name: fileName })],
        flags: MessageFlags.IsComponentsV2,
      }).catch(() => { });
    } catch { }
  }

  return transcript;
}

/* ================= GIVEAWAY FUNCTIONS ================= */

/** Find a giveaway by its Discord message ID (for reply-based commands) */
function findGiveawayByMessageId(messageId, guildId) {
  for (const [id, data] of giveaways.entries()) {
    if (data.messageId === messageId && (!guildId || data.guildId === guildId)) return data;
  }
  // Fallback: search persisted guild data
  const gd = guildId ? guildData(guildId).giveaways : {};
  for (const data of Object.values(gd || {})) {
    if (data.messageId === messageId) return data;
  }
  return null;
}

function buildActiveGiveawayContainer(giveawayData) {
  const { id: giveawayId, prize, winners: winnerCount, endTime } = giveawayData;
  const ARROW = getEmoji("arrow");
  let bodyText =
    `${ARROW} ${bold("Prize:")} ${prize}\n` +
    `${ARROW} ${bold("Winners:")} ${winnerCount}\n` +
    `${ARROW} ${bold("Ends:")} <t:${Math.floor(endTime / 1000)}:R>\n` +
    `${ARROW} ${bold("Hosted by:")} <@${giveawayData.hostId}>\n`;

  if (giveawayData.donorId) {
    bodyText += `${ARROW} ${bold("Donated by:")} <@${giveawayData.donorId}>\n`;
  }
  if (giveawayData.requireRole) bodyText += `📜 ${bold("Role Requirements:")} <@&${giveawayData.requireRole}>\n`;
  if (giveawayData.blacklistRole) bodyText += `🚫 ${bold("Blacklisted Roles:")} <@&${giveawayData.blacklistRole}>\n`;

  bodyText += `${ARROW} ${bold("Entries:")} ${giveawayData.participants.length}\n`;
  bodyText += `${bold(`Click the ${EMOJIS.pty} below to enter!`)}`;

  const enterButton = new ButtonBuilder()
    .setCustomId(`giveaway_enter_${giveawayId}`)
    .setEmoji(EMOJIS.pty)
    .setLabel("Enter Giveaway")
    .setStyle(ButtonStyle.Success);

  const participantsButton = new ButtonBuilder()
    .setCustomId(`giveaway_participants_${giveawayId}`)
    .setEmoji(getStatusEmojiObject("Action", "enabled"))
    .setLabel(String(giveawayData.participants.length))
    .setStyle(ButtonStyle.Secondary);

  const endButton = new ButtonBuilder()
    .setCustomId(`giveaway_end_${giveawayId}`)
    .setEmoji(getStatusEmojiObject("Action", "delete"))
    .setStyle(ButtonStyle.Danger);

  const activeRow = new ActionRowBuilder().addComponents(enterButton, participantsButton, endButton);

  const activeContainer = new ContainerBuilder()
    .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.gwys} GIVEAWAY ${EMOJIS.gwys}`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyText))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(activeRow)
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `-# Ends <t:${Math.floor(endTime / 1000)}:F> • Hosted by ${giveawayData.hostUsername || `<@${giveawayData.hostId}>`}`
    ));
  return activeContainer;
}


async function createGiveaway(msg, duration, prize, winnerCount = 1, donor = null) {
  const guildId = msg.guildId ?? msg.guild?.id;
  if (!guildData(guildId).giveawaySystem?.enabled) return null;
  const giveawayConfig = guildData(guildId).giveawayConfig || {};

  const durationMs = parseDuration(duration);
  if (!durationMs) return null;

  const giveawayId = `gw_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const endTime = Date.now() + durationMs;

  const giveawayData = {
    id: giveawayId,
    guildId: msg.guild.id,
    channelId: msg.channel.id,
    messageId: null,
    hostId: msg.author.id,
    hostUsername: msg.author.username ?? msg.author.tag,
    donorId: donor?.id || null,
    donorTag: donor?.tag || null,
    prize: prize,
    winners: parseInt(winnerCount),
    endTime: endTime,
    participants: [],
    ended: false,
    cancelled: false,
    createdAt: Date.now(),
    winnerIds: [],
    requireRole: giveawayConfig.requireRole || null,
    blacklistRole: giveawayConfig.blacklistRole || null
  };

  const activeContainer = buildActiveGiveawayContainer(giveawayData);

  const giveawayMsg = await msg.channel.send({ components: [activeContainer], flags: MessageFlags.IsComponentsV2 });

  giveawayData.messageId = giveawayMsg.id;
  giveaways.set(giveawayId, giveawayData);
  guildData(guildId).giveaways[giveawayId] = giveawayData;
  saveDB();

  const timeout = setTimeout(async () => {
    await endGiveaway(giveawayId);
  }, durationMs);

  giveawayTimeouts.set(giveawayId, timeout);

  return giveawayId;
}

function selectWinners(participants, count) {
  const winners = [];
  const participantsCopy = [...participants];
  const winnerCount = Math.min(count, participantsCopy.length);

  for (let i = 0; i < winnerCount; i++) {
    const randomIndex = Math.floor(Math.random() * participantsCopy.length);
    const winnerId = participantsCopy.splice(randomIndex, 1)[0];
    winners.push(winnerId);
  }

  return winners;
}

async function dmWinners(winnerIds, giveawayData, guild) {
  const jumpUrl = `https://discord.com/channels/${giveawayData.guildId}/${giveawayData.channelId}/${giveawayData.messageId}`;
  const dmDonorLine = giveawayData.donorId
    ? `${getEmoji("arrow")} **Donated by:** <@${giveawayData.donorId}>\n`
    : "";

  for (const winnerId of winnerIds) {
    try {
      const winner = await client.users.fetch(winnerId);

      const dmContainer = new ContainerBuilder()
        .addTextDisplayComponents(text =>
          text.setContent(`${EMOJIS.gwys} **You Won a Giveaway!** ${EMOJIS.gwys}`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `${EMOJIS.pty} **Congratulations!** You won a giveaway in **${guild.name}**!\n\n` +
          `${getEmoji("arrow")} **Prize:** ${giveawayData.prize}\n` +
          `${getEmoji("arrow")} **Hosted by:** <@${giveawayData.hostId}>\n` +
          dmDonorLine +
          `${getEmoji("arrow")} **Server:** ${guild.name}\n\n` +
          `Please contact the giveaway host or a staff member to claim your prize!`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setLabel("Jump to Giveaway")
              .setStyle(ButtonStyle.Link)
              .setURL(jumpUrl)
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `-# ${guild.name} • Prize: ${giveawayData.prize}`
        ));

      await winner.send({ components: [dmContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
    } catch (err) {
      // Can't DM user
    }
  }
}

async function updateGiveawayEmbed(message, giveawayData) {
  try {
    const guild = message.guild;
    const entriesCount = giveawayData.participants?.length || 0;
    const ARROW = getEmoji("arrow");

    let bodyText =
      `${ARROW} ${bold("Prize:")} ${giveawayData.prize}\n` +
      `${ARROW} ${bold("Winners:")} ${giveawayData.winners}\n` +
      `${ARROW} ${bold("Ends:")} <t:${Math.floor(giveawayData.endTime / 1000)}:R>\n` +
      `${ARROW} ${bold("Hosted by:")} <@${giveawayData.hostId}>\n`;

    if (giveawayData.donorId) {
      bodyText += `${ARROW} ${bold("Donated by:")} <@${giveawayData.donorId}>\n`;
    }

    bodyText += `${ARROW} ${bold("Entries:")} ${entriesCount}\n`;
    bodyText += `${bold(`Click the ${EMOJIS.pty} below to enter!`)}`;

    const enterButton = new ButtonBuilder()
      .setCustomId(`giveaway_enter_${giveawayData.id}`)
      .setEmoji(EMOJIS.pty)
      .setLabel("Enter Giveaway")
      .setStyle(ButtonStyle.Success);

    const participantsButton = new ButtonBuilder()
      .setCustomId(`giveaway_participants_${giveawayData.id}`)
      .setEmoji(getStatusEmojiObject("Action", "enabled"))
      .setLabel(`${entriesCount}`)
      .setStyle(ButtonStyle.Secondary);

    const endButton = new ButtonBuilder()
      .setCustomId(`giveaway_end_${giveawayData.id}`)
      .setEmoji(getStatusEmojiObject("Action", "delete"))
      .setStyle(ButtonStyle.Danger);

    const updatedRow = new ActionRowBuilder().addComponents(enterButton, participantsButton, endButton);

    const hostUsername = guild?.members.cache.get(giveawayData.hostId)?.user.username ?? "Unknown";
    const updatedContainer = new ContainerBuilder()
      .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.gwys} GIVEAWAY ${EMOJIS.gwys}`))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyText))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(updatedRow)
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# Ends <t:${Math.floor(giveawayData.endTime / 1000)}:F> • Hosted by ${hostUsername}`
      ));

    await message.edit({ components: [updatedContainer], flags: MessageFlags.IsComponentsV2 });
  } catch (err) {
    console.error("Failed to update giveaway embed:", err.message);
  }
}

async function endGiveaway(giveawayId) {
  const giveawayData = giveaways.get(giveawayId) || (() => {
    for (const [gId, gd] of Object.entries(db.guilds || {})) { const g = gd?.giveaways?.[giveawayId]; if (g) return g; }
    return null;
  })();
  const guildId = giveawayData?.guildId;
  if (!giveawayData || giveawayData.ended) return { success: false, error: "Already ended" };

  const timeout = giveawayTimeouts.get(giveawayId);
  if (timeout) {
    clearTimeout(timeout);
    giveawayTimeouts.delete(giveawayId);
  }

  giveawayData.ended = true;
  giveawayData.endedAt = Date.now();

  const guild = client.guilds.cache.get(giveawayData.guildId);
  if (!guild) {
    if (!db.giveaways) db.giveaways = {}; if (!guildData(guildId).giveaways) guildData(guildId).giveaways = {}; guildData(guildId).giveaways[giveawayId] = giveawayData; db.giveaways[giveawayId] = giveawayData;
    saveDB();
    return { success: false, error: "Guild not found" };
  }

  const channel = guild.channels.cache.get(giveawayData.channelId);
  if (!channel) {
    if (!db.giveaways) db.giveaways = {}; if (!guildData(guildId).giveaways) guildData(guildId).giveaways = {}; guildData(guildId).giveaways[giveawayId] = giveawayData; db.giveaways[giveawayId] = giveawayData;
    saveDB();
    return { success: false, error: "Channel not found" };
  }

  const message = await channel.messages.fetch(giveawayData.messageId).catch(() => null);
  const eligibleParticipants = [];
  for (const participantId of giveawayData.participants) {
    const member = guild.members.cache.get(participantId) || await guild.members.fetch(participantId).catch(() => null);
    if (!member) continue;
    if (giveawayData.blacklistRole && member.roles.cache.has(giveawayData.blacklistRole)) continue;
    if (giveawayData.requireRole && !member.roles.cache.has(giveawayData.requireRole)) continue;
    eligibleParticipants.push(participantId);
  }
  const entriesCount = eligibleParticipants.length;

  if (entriesCount === 0) {
    giveawayData.winnerIds = [];
    if (!db.giveaways) db.giveaways = {}; if (!guildData(guildId).giveaways) guildData(guildId).giveaways = {}; guildData(guildId).giveaways[giveawayId] = giveawayData; db.giveaways[giveawayId] = giveawayData;
    giveaways.set(giveawayId, giveawayData);
    saveDB();

    if (message) {
      const donorLine = giveawayData.donorId
        ? `${getEmoji("arrow")} **Donated by:** <@${giveawayData.donorId}>\n`
        : "";
      const endedContainerNoWin = new ContainerBuilder()
        .addSectionComponents(section =>
          section
            .addTextDisplayComponents(text =>
              text.setContent(`## ${EMOJIS.gwys} GIVEAWAY ENDED ${EMOJIS.gwys}`)
            )
            .setThumbnailAccessory(thumb =>
              thumb.setURL(message.guild?.iconURL({ dynamic: true }) || "https://cdn.discordapp.com/embed/avatars/0.png"))
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `${getEmoji("arrow")} **Prize:** ${giveawayData.prize}\n` +
          `${getEmoji("arrow")} **Winners:** No valid entries!\n` +
          `${getEmoji("arrow")} **Hosted by:** <@${giveawayData.hostId}>\n` +
          donorLine +
          `${getEmoji("arrow")} **Total Entries:** 0`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`giveaway_ended_${giveawayId}`)
              .setLabel(" Giveaway Ended")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true)
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `-# Giveaway ID: ${giveawayId} | Ended`
        ));
      await message.edit({ content: null, embeds: [], components: [endedContainerNoWin], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
    }

    const noEntriesContainer = new ContainerBuilder()
      .addTextDisplayComponents(text => text.setContent("### Giveaway Ended"))
      .addSeparatorComponents(separator => separator.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(text => text.setContent(`No one participated in the giveaway for **${giveawayData.prize}**!`));
    await channel.send({ components: [noEntriesContainer], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } }).catch(() => { });

    return { success: true, winners: [] };
  }

  const winners = selectWinners(eligibleParticipants, giveawayData.winners);
  giveawayData.winnerIds = winners;
  if (!db.giveaways) db.giveaways = {}; if (!guildData(guildId).giveaways) guildData(guildId).giveaways = {}; guildData(guildId).giveaways[giveawayId] = giveawayData; db.giveaways[giveawayId] = giveawayData;
  giveaways.set(giveawayId, giveawayData);
  saveDB();

  const winnerMentions = winners.map(id => `<@${id}>`).join(", ");

  if (message) {
    const donorLine2 = giveawayData.donorId
      ? `${getEmoji("arrow")} **Donated by:** <@${giveawayData.donorId}>\n`
      : "";
    const endedContainer = new ContainerBuilder()
      .addSectionComponents(section =>
        section
          .addTextDisplayComponents(text =>
            text.setContent(`## ${EMOJIS.gwys} GIVEAWAY ENDED ${EMOJIS.gwys}`)
          )
          .setThumbnailAccessory(thumb =>
            thumb.setURL(message.guild?.iconURL({ dynamic: true }) || "https://cdn.discordapp.com/embed/avatars/0.png"))
      )
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `${getEmoji("arrow")} **Prize:** ${giveawayData.prize}\n` +
        `${getEmoji("arrow")} **Winner(s):** ${winnerMentions}\n` +
        `${getEmoji("arrow")} **Hosted by:** <@${giveawayData.hostId}>\n` +
        donorLine2 +
        `${getEmoji("arrow")} **Total Entries:** ${entriesCount}`
      ))
      .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`giveaway_ended_${giveawayId}`)
            .setLabel(" Giveaway Ended")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId(`giveaway_reroll_${giveawayId}`)
            .setLabel(" Reroll")
            .setStyle(ButtonStyle.Primary)
        )
      )

      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# Giveaway ID: ${giveawayId} | Ended`
      ));
    await message.edit({ content: null, embeds: [], components: [endedContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
  }

  const congrats = winners.length === 1
    ? `${EMOJIS.gwys} Congratulations ${winnerMentions}! You won **${giveawayData.prize}**!`
    : `${EMOJIS.pty} Congratulations to our winners: ${winnerMentions}!\nYou all won **${giveawayData.prize}**!`;

  const announceDonorLine = giveawayData.donorId
    ? `\n${getEmoji("arrow")} **Thank you to** <@${giveawayData.donorId}> **for donating this prize!**`
    : "";

  const jumpUrl = `https://discord.com/channels/${giveawayData.guildId}/${giveawayData.channelId}/${giveawayData.messageId}`;

  const announcementContainer = new ContainerBuilder()
    .addTextDisplayComponents(text =>
      text.setContent(`${EMOJIS.gwys} **GIVEAWAY ENDED** ${EMOJIS.gwys}`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `${congrats}${announceDonorLine}`
    ))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Jump to Giveaway")
          .setStyle(ButtonStyle.Link)
          .setURL(jumpUrl)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `-# Prize: ${giveawayData.prize} • Hosted by ${client.users.cache.get(giveawayData.hostId)?.username ?? "Unknown"}`
    ));

  await channel.send({ components: [announcementContainer], flags: MessageFlags.IsComponentsV2 }).catch(() => { });
  await dmWinners(winners, giveawayData, guild);

  return { success: true, winners };
}

async function rerollGiveaway(giveawayId, count = 1) {
  const giveawayData = giveaways.get(giveawayId) || (() => {
    for (const [gId, gd] of Object.entries(db.guilds || {})) { const g = gd?.giveaways?.[giveawayId]; if (g) return g; }
    return null;
  })();
  const guildId = giveawayData?.guildId;
  if (!giveawayData) return { success: false, error: "That giveaway doesn't exist. Were you dreaming?" };
  if (!giveawayData.ended) return { success: false, error: "Giveaway hasn't ended yet!" };
  if (giveawayData.cancelled) return { success: false, error: "Giveaway was cancelled!" };
  if (giveawayData.participants.length === 0) return { success: false, error: "No participants to reroll!" };

  const guild = client.guilds.cache.get(giveawayData.guildId);
  if (!guild) return { success: false, error: "Guild not found!" };

  const channel = guild.channels.cache.get(giveawayData.channelId);
  if (!channel) return { success: false, error: "That channel went missing. Did it ever exist?" };

  const previousWinners = giveawayData.winnerIds || [];
  let eligibleParticipants = giveawayData.participants.filter(id => !previousWinners.includes(id));

  if (eligibleParticipants.length < count) {
    eligibleParticipants = [...giveawayData.participants];
  }

  const winners = selectWinners(eligibleParticipants, count);

  if (winners.length === 0) {
    return { success: false, error: "No eligible participants for reroll!" };
  }

  giveawayData.winnerIds = winners;
  giveawayData.rerolledAt = Date.now();
  if (!db.giveaways) db.giveaways = {}; if (!guildData(guildId).giveaways) guildData(guildId).giveaways = {}; guildData(guildId).giveaways[giveawayId] = giveawayData; db.giveaways[giveawayId] = giveawayData;
  giveaways.set(giveawayId, giveawayData);
  saveDB();

  try {
    const message = await channel.messages.fetch(giveawayData.messageId).catch(() => null);
    if (message) {
      const winnerMentions = winners.map(id => `<@${id}>`).join(", ");
      const donorLine3 = giveawayData.donorId
        ? `${getEmoji("arrow")} **Donated by:** <@${giveawayData.donorId}>\n`
        : "";
      const rerolledContainer = new ContainerBuilder()
        .addSectionComponents(section =>
          section
            .addTextDisplayComponents(text =>
              text.setContent(`## ${EMOJIS.gwys} GIVEAWAY ENDED ${EMOJIS.gwys}`)
            )
            .setThumbnailAccessory(thumb =>
              thumb.setURL(message.guild?.iconURL({ dynamic: true }) || "https://cdn.discordapp.com/embed/avatars/0.png"))
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `${getEmoji("arrow")} **Prize:** ${giveawayData.prize}\n` +
          `${getEmoji("arrow")} **Winner(s):** ${winnerMentions} *(Rerolled)*\n` +
          `${getEmoji("arrow")} **Hosted by:** <@${giveawayData.hostId}>\n` +
          donorLine3 +
          `${getEmoji("arrow")} **Total Entries:** ${giveawayData.participants.length}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addActionRowComponents(
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`giveaway_ended_${giveawayId}`)
              .setLabel("ðŸŽ‰ Giveaway Ended")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(true),
            new ButtonBuilder()
              .setCustomId(`giveaway_reroll_${giveawayId}`)
              .setLabel("ðŸ”„ Reroll")
              .setStyle(ButtonStyle.Primary)
          )
        )
        .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `-# Giveaway ID: ${giveawayId} | Rerolled`
        ));
      await message.edit({ components: [rerolledContainer], flags: MessageFlags.IsComponentsV2 });
    }
  } catch (err) {
    console.error("Failed to update rerolled giveaway:", err.message);
  }

  await dmWinners(winners, giveawayData, guild);

  return { success: true, winners };
}

async function cancelGiveaway(giveawayId) {
  const giveawayData = giveaways.get(giveawayId) || (() => {
    for (const [gId, gd] of Object.entries(db.guilds || {})) { const g = gd?.giveaways?.[giveawayId]; if (g) return g; }
    return null;
  })();
  const guildId = giveawayData?.guildId;
  if (!giveawayData) return { success: false, error: "That giveaway doesn't exist. Were you dreaming?" };
  if (giveawayData.ended) return { success: false, error: "Giveaway already ended!" };

  const timeout = giveawayTimeouts.get(giveawayId);
  if (timeout) {
    clearTimeout(timeout);
    giveawayTimeouts.delete(giveawayId);
  }

  const guild = client.guilds.cache.get(giveawayData.guildId);
  const channel = guild?.channels.cache.get(giveawayData.channelId);

  giveawayData.ended = true;
  giveawayData.cancelled = true;
  giveawayData.cancelledAt = Date.now();
  if (!db.giveaways) db.giveaways = {}; if (!guildData(guildId).giveaways) guildData(guildId).giveaways = {}; guildData(guildId).giveaways[giveawayId] = giveawayData; db.giveaways[giveawayId] = giveawayData;
  giveaways.set(giveawayId, giveawayData);
  saveDB();

  if (channel) {
    try {
      const message = await channel.messages.fetch(giveawayData.messageId).catch(() => null);
      if (message) {
        const ARROW = getEmoji("arrow");
        const cancelledContainer = new ContainerBuilder()
          .addSectionComponents(s => s
            .addTextDisplayComponents(t => t.setContent(`## ${EMOJIS.gwys} GIVEAWAY CANCELLED ${EMOJIS.gwys}`))
            .setThumbnailAccessory(th => th.setURL(message.guild?.iconURL({ dynamic: true }) || "https://cdn.discordapp.com/embed/avatars/0.png"))
          )
          .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `${ARROW} **Prize:** ${giveawayData.prize}\n` +
            `${ARROW} **Status:** CANCELLED\n` +
            `${ARROW} **Hosted by:** <@${giveawayData.hostId}>\n` +
            (giveawayData.donorId ? `${ARROW} **Donated by:** <@${giveawayData.donorId}>\n` : "") +
            `\n**This giveaway has been cancelled.**`
          ))
          .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
          .addActionRowComponents(
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`giveaway_cancelled_${giveawayId}`)
                .setLabel("Cancelled").setEmoji("<:scross:1559257945030525110>")
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
            )
          )
          .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small))
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Giveaway ID: ${giveawayId} | Cancelled`));

        await message.edit({ components: [cancelledContainer], flags: MessageFlags.IsComponentsV2 });
      }
    } catch (err) {
      console.error("Failed to update cancelled giveaway:", err.message);
    }
  }

  return { success: true };
}

function getGiveawayStats(guildId) {
  const guildGiveaways = Object.values(guildData(guildId).giveaways).filter(g => g.guildId === guildId);

  return {
    total: guildGiveaways.length,
    active: guildGiveaways.filter(g => !g.ended && !g.cancelled).length,
    ended: guildGiveaways.filter(g => g.ended && !g.cancelled).length,
    cancelled: guildGiveaways.filter(g => g.cancelled).length,
    totalParticipants: guildGiveaways.reduce((acc, g) => acc + (g.participants?.length || 0), 0)
  };
}

/* ================= STICKY MESSAGE FUNCTIONS ================= */
const stickyUpdateLocks = globalThis.__soezyStickyUpdateLocks || (globalThis.__soezyStickyUpdateLocks = new Map());

function getStickyDisplayMode(entry = {}) {
  const mode = String(entry.mode || "").trim().toLowerCase();
  if (mode === "single" || mode === "replace") return "container";
  if (mode === "repeat") return "plain";
  if (mode === "embed" || mode === "container" || mode === "plain") return mode;
  return entry.useContainer === false ? "plain" : "container";
}

async function updateStickyMessage(channel) {
  const guildId = channel.guildId;
  if (!guildData(guildId).stickySystem?.enabled) return;

  const stickyRecords = Object.entries(guildData(guildId).stickyMessages || {})
    .filter(([key, entry]) => (entry?.channelId || String(key).split(":")[0] || key) === channel.id && entry?.enabled !== false);
  if (!stickyRecords.length) return;

  const lockKey = `${guildId}:${channel.id}`;
  const previous = stickyUpdateLocks.get(lockKey) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const liveRecords = Object.entries(guildData(guildId).stickyMessages || {})
      .filter(([key, entry]) => (entry?.channelId || String(key).split(":")[0] || key) === channel.id && entry?.enabled !== false)
      .filter(([, entry]) => String(entry?.content || entry?.message || "").trim());
    if (!liveRecords.length) return;

    const botId = channel.client?.user?.id;
    const recent = botId ? await channel.messages.fetch({ limit: 40 }).catch(() => null) : null;
    const expectedIds = new Set(liveRecords.map(([, entry]) => entry?.messageId).filter(Boolean));

    for (const [, stickyData] of liveRecords) {
      const text = String(stickyData.content || stickyData.message || "").trim();
      if (!text) continue;

      if (stickyData.messageId) {
        try {
          const oldMsg = await channel.messages.fetch(stickyData.messageId);
          await oldMsg.delete();
        } catch {
          stickyData.messageId = null;
        }
      }

      if (recent && botId) {
        const mode = getStickyDisplayMode(stickyData);
        const duplicates = recent.filter(m => {
          if (m.author?.id !== botId || expectedIds.has(m.id)) return false;
          if (mode === "plain") return m.content?.trim() === text;
          if (mode === "embed") return m.embeds?.some(e => (e.description || "").includes(text.slice(0, 80)));
          return m.components?.length && JSON.stringify(m.components).includes(text.slice(0, 80));
        });
        for (const dup of duplicates.values()) await dup.delete().catch(() => {});
      }

      let newMsg;
      const mode = getStickyDisplayMode(stickyData);
      if (mode === "plain") {
        newMsg = await channel.send({ content: ` ${text}` });
      } else if (mode === "embed") {
        newMsg = await channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(getThemeColor(guildId))
              .setDescription(` ${text}`)
          ],
        });
      } else {
        newMsg = await channel.send({
          components: [
            new ContainerBuilder()
              .addTextDisplayComponents(t => t.setContent(` ${text}`))
          ],
          flags: MessageFlags.IsComponentsV2
        });
      }
      if (newMsg?.id) stickyData.messageId = newMsg.id;
    }
    saveDB();
  }).finally(() => {
    if (stickyUpdateLocks.get(lockKey) === next) stickyUpdateLocks.delete(lockKey);
  });

  stickyUpdateLocks.set(lockKey, next);
  return next;
}

/* ================= ECONOMY FUNCTIONS ================= */

function getBalance(guildId, userId) {
  if (!guildData(guildId).economy.users[guildId]) guildData(guildId).economy.users[guildId] = {};
  if (!guildData(guildId).economy.users[guildId][userId]) {
    guildData(guildId).economy.users[guildId][userId] = {
      balance: 0,
      bank: 0,
      lastDaily: 0,
      lastWork: 0,
      dailyStreak: 0,
      lastRob: 0,
      totalEarned: 0
    };
  }
  return guildData(guildId).economy.users[guildId][userId];
}

function addMoney(guildId, userId, amount) {
  const user = getBalance(guildId, userId);
  user.balance += amount;
  user.totalEarned = (user.totalEarned || 0) + amount;
  saveDB();
  return user;
}

function removeMoney(guildId, userId, amount) {
  const user = getBalance(guildId, userId);
  if (user.balance < amount) return null;
  user.balance -= amount;
  saveDB();
  return user;
}

function transferMoney(guildId, fromUserId, toUserId, amount) {
  const from = getBalance(guildId, fromUserId);
  if (from.balance < amount) return null;

  from.balance -= amount;
  const to = getBalance(guildId, toUserId);
  to.balance += amount;
  saveDB();
  return { from, to };
}

function getEconomyLeaderboard(guildId, limit = 10) {
  if (!guildData(guildId).economy.users[guildId]) return [];

  return Object.entries(guildData(guildId).economy.users[guildId])
    .map(([userId, data]) => ({ userId, total: data.balance + data.bank, ...data }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/* ================= INVITE TRACKING ================= */

function getInviter(guildId, userId) {
  return guildData(guildId).invites[guildId]?.inviter?.[userId] || null;
}

function getInviteCount(guildId, userId) {
  return guildData(guildId).invites[guildId]?.counts?.[userId] || { regular: 0, left: 0, fake: 0 };
}

function getInviteLeaderboard(guildId, limit = 10) {
  if (!guildData(guildId).invites[guildId]?.counts) return [];

  return Object.entries(guildData(guildId).invites[guildId].counts)
    .map(([userId, counts]) => ({
      oderId,
      ...counts,
      total: counts.regular - counts.left - counts.fake
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function resetInvites(guildId, userId = null) {
  if (userId) {
    if (guildData(guildId).invites[guildId]?.counts?.[userId]) {
      guildData(guildId).invites[guildId].counts[userId] = { regular: 0, left: 0, fake: 0 };
    }
  } else {
    if (guildData(guildId).invites[guildId]) {
      guildData(guildId).invites[guildId].counts = {};
    }
  }
  saveDB();
}

/* ================= CUSTOM ROLES ================= */

async function createCustomRole(guild, oderId, name, color) {
  const guildId = guild.id;
  if (!guildData(guildId).customRoles.enabled) return null;

  const userRoles = guildData(guildId).customRoles.users[userId] || [];
  if (userRoles.length >= guildData(guildId).customRoles.maxRoles) return null;

  try {
    const role = await guild.roles.create({
      name: name,
      color: color,
      reason: `Custom role created by ${userId}`
    });

    const member = await guild.members.fetch(userId);
    await member.roles.add(role);

    if (!guildData(guildId).customRoles.users[userId]) guildData(guildId).customRoles.users[userId] = [];
    guildData(guildId).customRoles.users[userId].push(role.id);
    saveDB();

    return role;
  } catch (err) {
    console.error("Custom role creation failed:", err);
    return null;
  }
}

async function deleteCustomRole(guild, userId) {
  const guildId = guild.id;
  const userRoles = guildData(guildId).customRoles.users[userId] || [];
  if (userRoles.length === 0) return false;

  for (const roleId of userRoles) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      await role.delete().catch(() => { });
    }
  }

  guildData(guildId).customRoles.users[userId] = [];
  saveDB();
  return true;
}

/* ================= RESTORE GIVEAWAYS ON STARTUP ================= */

async function restoreGiveaways() {
  console.log("[GIVEAWAY] Restoring active giveaways...");

  let restored = 0;
  let ended = 0;

  for (const guildId of getKnownGuildIds()) {
    for (const [giveawayId, giveawayData] of Object.entries(guildData(guildId).giveaways || {})) {
      if (giveawayData.ended || giveawayData.cancelled) continue;

      giveaways.set(giveawayId, giveawayData);

      const timeLeft = giveawayData.endTime - Date.now();

      if (timeLeft <= 0) {
        console.log(`[GIVEAWAY] Ending overdue giveaway: ${giveawayId}`);
        await endGiveaway(giveawayId);
        ended++;
      } else {
        const timeout = setTimeout(async () => {
          await endGiveaway(giveawayId);
        }, timeLeft);

        giveawayTimeouts.set(giveawayId, timeout);
        restored++;
        console.log(`[GIVEAWAY] Restored ${giveawayId} – ends in ${formatDuration(timeLeft)}`);
      }
    }
  }

  console.log(`[GIVEAWAY] Restoration complete: ${restored} active, ${ended} ended`);
}

/* ================= FUN COMMANDS HELPERS ================= */

function get8BallResponse() {
  const responses = [
    "It is certain.", "It is decidedly so.", "Without a doubt.",
    "Yes - definitely.", "You may rely on it.", "As I see it, yes.",
    "Most likely.", "Outlook good.", "Yes.", "Signs point to yes.",
    "Reply hazy, try again.", "Ask again later.", "Better not tell you now.",
    "Cannot predict now.", "Concentrate and ask again.",
    "Don't count on it.", "My reply is no.", "My sources say no.",
    "Outlook not so good.", "Very doubtful."
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

function flipCoin() {
  return Math.random() < 0.5 ? "Heads" : "Tails";
}

function rollDice(sides = 6) {
  return Math.floor(Math.random() * sides) + 1;
}

function getRandomChoice(choices) {
  return choices[Math.floor(Math.random() * choices.length)];
}

/* ================= TIMERS ================= */

// AFK Expiry Timer
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const guildId of getKnownGuildIds()) {
    const afkUsers = guildData(guildId).afk?.users;
    if (!afkUsers) continue;
    for (const [userId, afkData] of Object.entries(afkUsers)) {
      if (afkData.expiresAt && now >= afkData.expiresAt) {
        delete guildData(guildId).afk.users[userId];
        changed = true;
      }
    }
  }
  if (changed) saveDB();
}, 60000);

// Birthday Check Timer
async function checkBirthdays() {
  //  Per-guild timezone: each guild fires at 12 AM in its own configured TZ 
  // This function runs every hour; for each guild we check if it is currently
  // the midnight hour (hour 0) in that guild's timezone.
  for (const guildId of client.guilds.cache.keys()) {
    const gData = guildData(guildId);
    if (!gData.birthday?.enabled) continue;
    if (!gData.birthday?.channel) continue;

    // Check if it's 12 AM in this guild's configured timezone
    if (getCurrentHourInGuildTZ(guildId) !== 0) continue;

    // Build today's date string in the guild's timezone
    const todayTZ = getTodayInGuildTZ(guildId);
    const nowInTZ = new Date(Date.now() + getGuildTZOffsetMs(guildId));
    const todayMonth = String(nowInTZ.getUTCMonth() + 1).padStart(2, "0");
    const todayDay = String(nowInTZ.getUTCDate()).padStart(2, "0");
    const thisYear = nowInTZ.getUTCFullYear();

    const birthdayUsers = gData.birthday?.users || {};
    for (const [userId, birthday] of Object.entries(birthdayUsers)) {
      // Skip if we already wished this user today (keyed by timezone date string)
      if (gData.birthdayChecked?.[userId] === todayTZ) continue;

      try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;
        const channel = guild.channels.cache.get(gData.birthday.channel);
        if (!channel) continue;

        let sentWishes = false;
        const [year, month, day] = birthday.split("-");

        if (month === todayMonth && day === todayDay) {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            const age = thisYear - parseInt(year);
            const customMessage = gData.birthday.message ||
              `${EMOJIS.yippie} Happy {age}{suffix} Birthday {mention}!\n\nWishing you an amazing day filled with joy and happiness! 🎈`;
            const message = customMessage
              .replace(/{mention}/g, `${member}`)
              .replace(/{user}/g, member.user.username)
              .replace(/{age}/g, age.toString())
              .replace(/{suffix}/g, getOrdinalSuffix(age));

            //  Birthday wish as ContainerBuilder 
            const wishContainer = new ContainerBuilder()
              .addSectionComponents(s => s
                .addTextDisplayComponents(t => t.setContent(
                  `## ${EMOJIS.yippie} Happy Birthday, ${member}!`
                ))
                .setThumbnailAccessory(th => th.setURL(member.user.displayAvatarURL({ dynamic: true })))
              )
              .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
              .addTextDisplayComponents(t => t.setContent(message))
              .addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small).setDivider(true))
              .addTextDisplayComponents(t => t.setContent(
                `-# ðŸŽ‚ Turning ${age} today · <t:${Math.floor(Date.now() / 1000)}:D>`
              ));

            await channel.send({ components: [wishContainer], flags: MessageFlags.IsComponentsV2 });
            sentWishes = true;

            //  Birthday role: assign now, remove after exactly 24 hours 
            if (gData.birthday.role) {
              const role = guild.roles.cache.get(gData.birthday.role);
              if (role && !member.roles.cache.has(role.id)) {
                await member.roles.add(role).catch(err =>
                  console.error("Failed to add birthday role:", err)
                );
                setTimeout(async () => {
                  try {
                    const freshMember = await guild.members.fetch(userId).catch(() => null);
                    if (freshMember?.roles.cache.has(role.id)) {
                      await freshMember.roles.remove(role);
                    }
                  } catch (err) {
                    console.error("Failed to remove birthday role:", err);
                  }
                }, 24 * 60 * 60 * 1000); // 24 hours exactly
              }
            }
          }
        }

        if (sentWishes) {
          if (!gData.birthdayChecked) gData.birthdayChecked = {};
          gData.birthdayChecked[userId] = todayTZ; // keyed to guild timezone date
          saveDB();
        }
      } catch (err) {
        console.error("Birthday check error:", err);
      }
    }
  }
}

//  Scheduler: run every hour – each guild fires at its own configured 12 AM 
// checkBirthdays() already gates on getCurrentHourInGuildTZ() === 0 per guild,
// so running every hour is the right approach for multi-timezone support.
setInterval(checkBirthdays, 60 * 60 * 1000);
// Also run once shortly after startup to catch any missed midnight windows
setTimeout(checkBirthdays, 5000);

// Reminder Timer
setInterval(async () => {
  const now = Date.now();
  let changed = false;

  for (const guildId of getKnownGuildIds()) {
    const gData = guildData(guildId);
    if (!Array.isArray(gData.reminders) || gData.reminders.length === 0) continue;

    for (const reminder of gData.reminders) {
      if (now >= reminder.nextTime) {
        try {
          const guild = client.guilds.cache.get(reminder.guildId);
          if (!guild) continue;
          const channel = guild.channels.cache.get(reminder.channelId);
          if (!channel) continue;

          const embed = createEmbed({
            title: `${EMOJIS.thinking} ${bold("Reminder")}`,
            description: reminder.message,
            fields: [{ name: `${EMOJIS.smile} ${bold("Created By")}`, value: `<@${reminder.userId || reminder.oderId}>` }]
          });

          const reminderUserId = reminder.userId || reminder.oderId;
          await channel.send({ components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`<@${reminderUserId}>`)), wrapEmbedAsContainer(embed)], flags: MessageFlags.IsComponentsV2 });

          if (reminder.loop) {
            reminder.nextTime = now + reminder.interval;
          } else {
            reminder.done = true;
          }
          changed = true;
        } catch (err) {
          console.error(`Reminder error:`, err);
        }
      }
    }

    if (changed) {
      gData.reminders = gData.reminders.filter(r => !r.done);
    }
  }

  if (changed) saveDB();
}, 5000);

// Giveaway Check Timer
setInterval(async () => {
  const now = Date.now();
  for (const guildId of getKnownGuildIds()) {
    const giveaways = guildData(guildId).giveaways || {};
    for (const [id, giveaway] of Object.entries(giveaways)) {
      if (!giveaway.ended && giveaway.endTime <= now) {
        await endGiveaway(id);
      }
    }
  }
}, 30000);

// Snipe cleanup timer (24 hours)
setInterval(() => {
  const now = Date.now();
  const expiry = 24 * 60 * 60 * 1000;

  for (const [channelId, data] of snipedMessages.entries()) {
    if (now - data.timestamp > expiry) {
      snipedMessages.delete(channelId);
    }
  }

  for (const [channelId, data] of editSnipedMessages.entries()) {
    if (now - data.timestamp > expiry) {
      editSnipedMessages.delete(channelId);
    }
  }

  for (const [channelId, history] of channelSnipeHistory.entries()) {
    const recent = history.filter(item => now - item.timestamp <= expiry).slice(0, 10);
    if (recent.length === 0) channelSnipeHistory.delete(channelId);
    else channelSnipeHistory.set(channelId, recent);
  }

  for (const [channelId, history] of channelEditHistory.entries()) {
    const recent = history.filter(item => now - item.timestamp <= expiry).slice(0, 10);
    if (recent.length === 0) channelEditHistory.delete(channelId);
    else channelEditHistory.set(channelId, recent);
  }
}, 60000);

// Anti-Nuke Action Cleanup Timer
setInterval(() => {
  const now = Date.now();

  for (const [key, actions] of antiNukeActions.entries()) {
    const [guildId] = key.split(/[:-]/);
    const timeWindow = guildData(guildId)?.antinuke?.timeWindow || 10000;
    const recentActions = actions.filter(time => now - time < timeWindow);
    if (recentActions.length === 0) {
      antiNukeActions.delete(key);
    } else {
      antiNukeActions.set(key, recentActions);
    }
  }
}, 30000);

client._dashboardRefreshSticky = updateStickyMessage;
client._dashboardHasPremium = (userId, guildId) => hasAnyPremium(userId, guildId);

// Spam Tracker Cleanup Timer
setInterval(() => {
  const now = Date.now();

  for (const [key, messages] of spamTracker.entries()) {
    const [guildId] = key.split(/[:-]/);
    const interval = guildData(guildId)?.automod?.antiSpam?.interval || 5000;
    const recentMessages = messages.filter(time => now - time < interval);
    if (recentMessages.length === 0) {
      spamTracker.delete(key);
    } else {
      spamTracker.set(key, recentMessages);
    }
  }
}, 10000);
