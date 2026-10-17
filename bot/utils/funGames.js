const fastTypeGames = globalThis.fastTypeGames || (globalThis.fastTypeGames = new ManagedMap("fastTypeGames", {
  ttl: 60 * 1000, max: 1000, onEvict: game => game?.collector?.stop?.("expired"),
}));
const numberGuessGames = globalThis.numberGuessGames || (globalThis.numberGuessGames = new ManagedMap("numberGuessGames", {
  ttl: 10 * 60 * 1000, max: 1000, onEvict: game => game?.collector?.stop?.("expired"),
}));
const FAST_TYPE_WORDS = ["phantom", "crystal", "sunrise", "velocity", "lantern", "starlight", "keyboard", "moonlight"];

function buildNumberGuessPanel(game, state = "ready") {
  const text = state === "ready"
    ? `## Number Guess\nGame ready.\n\nClick **Start Game** to begin. Guess a number from **1 to 100**. Type \`stop\` anytime to end the game.`
    : state === "playing"
      ? `## Number Guess\nGame started.\n\nSend a number from **1 to 100** in this channel. Type \`stop\` anytime to end the game.\n\nAttempts: **${game.attempts}**`
      : state === "won"
        ? `## Number Guess\n<:tick:1559236522711187577> <@${game.winnerId}> got it right! The number was **${game.number}** in **${game.attempts}** attempts.`
        : `## Number Guess\n${state === "stopped" ? "Game stopped." : "Time's up!"} The number was **${game.number}**. Attempts: **${game.attempts}**`;
  const container = new ContainerBuilder().addTextDisplayComponents(t => t.setContent(text));
  if (state === "ready" || state === "playing") {
    container.addSeparatorComponents(s => s.setSpacing(SeparatorSpacingSize.Small));
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ng:start:${game.id}`).setLabel(state === "ready" ? "Start Game" : "Game Started").setStyle(ButtonStyle.Success).setDisabled(state === "playing"),
      new ButtonBuilder().setCustomId(`ng:stop:${game.id}`).setLabel("Stop Game").setStyle(ButtonStyle.Danger)
    ));
  }
  return container;
}

async function startFastType({ guildId, channel, user, sendPrompt }) {
  if (!guildData(guildId).fun?.enabled) throw new Error("Fun commands are disabled in this server.");
  if (fastTypeGames.has(channel.id)) throw new Error("A Fast Type game is already running in this channel.");
  const word = FAST_TYPE_WORDS[Math.floor(Math.random() * FAST_TYPE_WORDS.length)];
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Fast Type")
    .setDescription(`Type this word in the chat exactly:\n\n**${word}**\n\nYou have **15 seconds**.`);
  const prompt = await sendPrompt({ embeds: [embed], allowedMentions: { parse: [] } });
  const collector = channel.createMessageCollector({
    filter: message => !message.author.bot && message.content.trim() === word,
    max: 1,
    time: 15000,
  });
  const game = { word, hostId: user.id, promptId: prompt?.id, collector };
  fastTypeGames.set(channel.id, game);
  collector.on("collect", winner => {
    fastTypeGames.delete(channel.id);
    channel.send({
      components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`## <:tick:1559236522711187577> Fast Type\n<@${winner.author.id}> typed **${word}** first!`))],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { users: [winner.author.id] },
    }).catch(() => {});
  });
  collector.on("end", collected => {
    fastTypeGames.delete(channel.id);
    if (collected.size) return;
    channel.send({
      components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`## Fast Type\nTime's up! The word was **${word}**.`))],
      flags: MessageFlags.IsComponentsV2,
    }).catch(() => {});
  });
  return prompt;
}

async function startNumberGuess({ guildId, channel, user, sendPrompt }) {
  if (!guildData(guildId).fun?.enabled) throw new Error("Fun commands are disabled in this server.");
  if ([...numberGuessGames.values()].some(game => game.channelId === channel.id)) {
    throw new Error("A Number Guess game is already running in this channel.");
  }
  const id = require("crypto").randomUUID();
  const game = { id, guildId, channelId: channel.id, hostId: user.id, number: Math.floor(Math.random() * 100) + 1, attempts: 0, status: "ready", prompt: null, collector: null };
  numberGuessGames.set(id, game);
  try {
    game.prompt = await sendPrompt({ components: [buildNumberGuessPanel(game)], flags: MessageFlags.IsComponentsV2 });
    return game.prompt;
  } catch (error) {
    numberGuessGames.delete(id);
    throw error;
  }
}

async function finishNumberGuess(game, state, winnerId = null) {
  game.status = state;
  game.winnerId = winnerId;
  game.collector?.stop(state);
  numberGuessGames.delete(game.id);
  await game.prompt?.edit({ components: [buildNumberGuessPanel(game, state)], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
}

async function handleNumberGuessButton(interaction) {
  const match = interaction.customId.match(/^ng:(start|stop):(.+)$/);
  if (!match) return false;
  const [, action, id] = match;
  const game = numberGuessGames.get(id);
  if (!game || game.channelId !== interaction.channelId) {
    await interaction.reply({ components: [createErrorContainer("Game Ended", "This Number Guess game is no longer active.")], flags: MessageFlags.IsComponentsV2 | 64 });
    return true;
  }
  const canManage = interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageMessages);
  if (interaction.user.id !== game.hostId && !canManage) {
    await interaction.reply({ components: [createErrorContainer("Not Your Game", "Only the person who started this game or a moderator can control it.")], flags: MessageFlags.IsComponentsV2 | 64 });
    return true;
  }
  if (action === "stop") {
    await interaction.deferUpdate();
    await finishNumberGuess(game, "stopped");
    return true;
  }
  if (game.status !== "ready") {
    await interaction.reply({ components: [createErrorContainer("Already Started", "This game has already started.")], flags: MessageFlags.IsComponentsV2 | 64 });
    return true;
  }
  game.status = "playing";
  game.collector = interaction.channel.createMessageCollector({
    filter: message => !message.author.bot && (/^\d+$/.test(message.content.trim()) || message.content.trim().toLowerCase() === "stop"),
    time: 120000,
  });
  game.collector.on("collect", async message => {
    if (message.content.trim().toLowerCase() === "stop") {
      const canStop = message.author.id === game.hostId || message.member?.permissions?.has(PermissionsBitField.Flags.ManageMessages);
      if (!canStop) return;
      await finishNumberGuess(game, "stopped");
      return message.reply({ components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent("Game stopped."))], flags: MessageFlags.IsComponentsV2 });
    }
    const guess = Number(message.content.trim());
    if (guess < 1 || guess > 100) return;
    game.attempts++;
    if (guess === game.number) {
      await finishNumberGuess(game, "won", message.author.id);
      return message.reply({
        components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(` <a:thinking:1559656266261995620> You got it right! The number was **${game.number}** and you finished in **${game.attempts}** attempt${game.attempts === 1 ? "" : "s"}.`))],
        flags: MessageFlags.IsComponentsV2,
        allowedMentions: { parse: [] },
      });
    }
    const hint = guess < game.number ? "Too low. Try a bigger number." : "Too high. Try a smaller number.";
    await message.reply({
      components: [new ContainerBuilder().addTextDisplayComponents(t => t.setContent(`${hint}\nAttempts: **${game.attempts}**`))],
      flags: MessageFlags.IsComponentsV2,
    });
    await game.prompt?.edit({ components: [buildNumberGuessPanel(game, "playing")], flags: MessageFlags.IsComponentsV2 }).catch(() => {});
  });
  game.collector.on("end", async (_collected, reason) => {
    if (game.status !== "playing") return;
    if (reason === "time") await finishNumberGuess(game, "timeout");
  });
  await interaction.update({ components: [buildNumberGuessPanel(game, "playing")], flags: MessageFlags.IsComponentsV2 });
  return true;
}

globalThis.soezyFunGames = { startFastType, startNumberGuess, handleNumberGuessButton };
