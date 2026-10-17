const fs = require("fs");
const path = require("path");
const { Collection } = require("discord.js");
const { isRetiredCommand } = require("../utils/retiredCommands");

// Keep every command category with a slash/prefix definition in the registry.
const COMMAND_CATEGORIES = ["moderation", "fun", "utility", "config", "economy", "owner", "music"];
const REMOVED_COMMAND_FILES = new Set([
  "config/suggestions.js",
  "fun/chess.js",
  "fun/battleship.js",
  "fun/wordle.js",
  "fun/trivia.js",
  "fun/rps.js",
  "fun/hangman.js",
  "fun/dice.js",
  "fun/coinflip.js",
  "economy/blackjack.js",
  "economy/slots.js",
]);

function loadCommandCollection() {
  const commands = new Collection();
  const diagnostics = {
    loaded: [],
    failedImports: [],
    missingExports: [],
    duplicateNames: [],
  };

  for (const category of COMMAND_CATEGORIES) {
    const categoryDir = path.join(__dirname, category);
    if (!fs.existsSync(categoryDir)) continue;

    for (const file of fs.readdirSync(categoryDir).filter(name => name.endsWith(".js"))) {
      if (REMOVED_COMMAND_FILES.has(`${category}/${file}`)) continue;
      let exported;
      try {
        exported = require(path.join(categoryDir, file));
      } catch (err) {
        console.error(`[Registry] Failed to load ${category}/${file}:`, err.message);
        diagnostics.failedImports.push({ file: `${category}/${file}`, error: err.message });
        continue;
      }

      // FIX 2: handle files that export an array of commands (e.g. music.js)
      const entries = Array.isArray(exported) ? exported : [exported];

      for (const [index, command] of entries.entries()) {
        const label = `${category}/${file}${entries.length > 1 ? `#${index}` : ""}`;
        if (!command?.data?.name && command?.MUSIC_SLASH_COMMANDS) {
          diagnostics.loaded.push({ name: "music-runtime", file: label });
          continue;
        }
        if (!command?.data?.name) {
          diagnostics.missingExports.push(label);
          continue;
        }
        if (isRetiredCommand(command.data.name)) continue;
        if (commands.has(command.data.name)) {
          diagnostics.duplicateNames.push({ name: command.data.name, file: label });
          continue;
        }
        commands.set(command.data.name, command);
        diagnostics.loaded.push({ name: command.data.name, file: label });
      }
    }
  }

  commands.diagnostics = diagnostics;
  if (diagnostics.failedImports.length) console.warn(`[Registry] ${diagnostics.failedImports.length} command import(s) failed.`);
  if (diagnostics.missingExports.length) console.warn(`[Registry] ${diagnostics.missingExports.length} command file(s) missing data.name.`);
  if (diagnostics.duplicateNames.length) console.warn(`[Registry] ${diagnostics.duplicateNames.length} duplicate command name(s) skipped.`);
  return commands;
}

module.exports = { loadCommandCollection };
