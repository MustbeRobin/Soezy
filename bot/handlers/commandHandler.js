const { loadCommandCollection } = require("../commands/registry");

function loadCommands() {
  return loadCommandCollection();
}

function findCommand(commands, name) {
  if (!commands || !name) return null;
  return commands.get(name) || [...commands.values()].find(cmd => cmd.aliases?.includes?.(name)) || null;
}

async function executeCommand(command, context) {
  if (!command) return false;
  const runner = command.execute || command.run;
  if (typeof runner !== "function") return false;
  await runner(context);
  return true;
}

module.exports = { loadCommands, findCommand, executeCommand };
