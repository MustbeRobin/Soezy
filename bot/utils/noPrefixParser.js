/* ================= NO-PREFIX PARSER HELPERS ================= */
(() => {
const MUSIC_ALIASES = new Map([
  ["play", "play"], ["p", "play"],
  ["skip", "skip"], ["s", "skip"], ["next", "skip"],
  ["stop", "stop"],
  ["pause", "pause"],
  ["resume", "resume"], ["unpause", "resume"],
  ["queue", "queue"], ["q", "queue"],
  ["np", "np"], ["nowplaying", "np"],
  ["leave", "leave"], ["disconnect", "leave"], ["dc", "leave"],
]);

// These are deliberately small, exact phrases. They are the only natural
// language forms accepted without a prefix, which keeps ordinary conversation
// from accidentally becoming a command. Add future phrases here rather than
// scattering startsWith checks through the message event.
const NO_PREFIX_PHRASES = new Map([
  ["bot invite", { command: "invite", args: [] }],
  ["bot invite kar", { command: "invite", args: [] }],
  ["nbot vc join kar", { command: "join", args: [] }],
]);
let noPrefixParserState = null;

function getNoPrefixState() {
  if (noPrefixParserState) return noPrefixParserState;
  const fullCommands = new Set(getNoPrefixFullCommands());
  if (typeof CMD_HELP_MAP !== "undefined") {
    for (const key of Object.keys(CMD_HELP_MAP || {})) {
      const normalizedKey = String(key || "").trim();
      if (/\s/.test(normalizedKey)) continue;
      const first = normalizeNoPrefixToken(normalizedKey);
      if (first.length > 2 || soezyOwnerManager?.ownerOnlyCommandNames?.().has(first)) fullCommands.add(first);
    }
  }
  if (typeof ALL_COMMANDS !== "undefined") {
    for (const cat of Object.values(ALL_COMMANDS || {})) {
      for (const command of cat.commands || []) {
        const first = normalizeNoPrefixToken(String(command.name || "").split(/\s+/)[0]);
        if (first.length > 2 || cat.name === "Owner") fullCommands.add(first);
        for (const alias of command.aliases || []) {
          const normalizedAlias = String(alias || "").trim();
          if (/\s/.test(normalizedAlias)) continue;
          const aliasFirst = normalizeNoPrefixToken(normalizedAlias);
          if (aliasFirst.length > 2 || cat.name === "Owner") fullCommands.add(aliasFirst);
        }
      }
    }
  }
  const exactCommands = new Map();
  const funCommands = new Set();
  const addExactCommand = (phrase, command, argsPrefix = []) => {
    const normalizedPhrase = normalizeCommandPhraseForNoPrefix(phrase);
    if (!normalizedPhrase || exactCommands.has(normalizedPhrase)) return;
    exactCommands.set(normalizedPhrase, {
      command: normalizeNoPrefixToken(command),
      args: [...argsPrefix],
    });
  };

  for (const command of fullCommands) addExactCommand(command, command);
  if (typeof CMD_HELP_MAP !== "undefined") {
    for (const key of Object.keys(CMD_HELP_MAP || {})) {
      const parts = normalizeCommandPhraseForNoPrefix(key).split(" ");
      const base = parts.shift();
      if (base && fullCommands.has(base)) addExactCommand(key, base, parts);
    }
  }
  if (typeof ALL_COMMANDS !== "undefined") {
    for (const cat of Object.values(ALL_COMMANDS || {})) {
      if (String(cat.name || "").toLowerCase() === "fun") {
        for (const command of cat.commands || []) {
          funCommands.add(normalizeNoPrefixToken(command.name));
          for (const alias of command.aliases || []) funCommands.add(normalizeNoPrefixToken(alias));
        }
      }
      for (const command of cat.commands || []) {
        const commandName = normalizeCommandPhraseForNoPrefix(command.name);
        const commandParts = commandName.split(" ");
        const base = commandParts.shift();
        if (!base || !fullCommands.has(base)) continue;
        addExactCommand(commandName, base, commandParts);
        for (const alias of command.aliases || []) {
          const aliasParts = normalizeCommandPhraseForNoPrefix(alias).split(" ");
          const aliasBase = aliasParts.shift();
          if (aliasBase && fullCommands.has(aliasBase)) addExactCommand(alias, base, commandParts);
        }
      }
    }
  }
  for (const [phrase, match] of NO_PREFIX_PHRASES) {
    addExactCommand(phrase, match.command, match.args);
  }
  for (const [alias, command] of MUSIC_ALIASES) {
    addExactCommand(alias, command);
  }

  noPrefixParserState = {
    fullCommands,
    mentionRequired: getMentionRequiredCommands(),
    numberRequired: getNumberRequiredCommands(),
    subcommandRequired: getSubcommandRequiredCommands(),
    sentenceWords: getSentenceIndicatorWords(),
    noArgCommands: getNoArgsCommands(),
    noArgFiller: getNoArgFillerWords(),
    musicAliases: MUSIC_ALIASES,
    phrases: NO_PREFIX_PHRASES,
    exactCommands,
    funCommands,
  };
  return noPrefixParserState;
}

function normalizeCommandPhraseForNoPrefix(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveExactNoPrefixCommand(content) {
  const phrase = normalizeCommandPhraseForNoPrefix(content);
  if (!phrase) return null;
  const match = getNoPrefixState().exactCommands.get(phrase);
  return match ? { command: match.command, args: [...match.args] } : null;
}

function normalizeNoPrefixToken(value) {
  return String(value || "").trim().toLowerCase();
}

function parseNoPrefixMusic(parts, sameVoice) {
  const raw = normalizeNoPrefixToken(parts[0]);
  const aliases = getNoPrefixState().musicAliases;
  if (!aliases.has(raw)) return null;
  const command = aliases.get(raw);
  const rest = parts.slice(1);
  if (["skip", "stop", "pause", "resume", "queue", "np", "leave"].includes(command) && rest.length > 0) return null;
  if (command === "play") {
    if (rest.length === 0) return null;
    const sentenceWords = getNoPrefixState().sentenceWords;
    if (rest.some(word => sentenceWords.has(String(word).toLowerCase()))) return null;
  }
  if (!sameVoice) return { blocked: true };
  return { command, args: rest };
}

function parseExactNoPrefixPhrase(parts) {
  const phrase = (parts || []).map(normalizeNoPrefixToken).filter(Boolean).join(" ");
  const match = getNoPrefixState().phrases.get(phrase);
  return match ? { command: match.command, args: [...match.args] } : null;
}

function splitNoPrefixParts(content) {
  return String(content || "").trim().split(/\s+/).filter(Boolean);
}

Object.assign(globalThis, {
  getNoPrefixState,
  normalizeNoPrefixToken,
  parseNoPrefixMusic,
  parseExactNoPrefixPhrase,
  splitNoPrefixParts,
  resolveExactNoPrefixCommand,
});

module.exports = { getNoPrefixState, normalizeNoPrefixToken, parseNoPrefixMusic, parseExactNoPrefixPhrase, splitNoPrefixParts, resolveExactNoPrefixCommand };
})();
