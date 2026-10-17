"use strict";

// Retire public command entry points without disabling automatic recovery services.
const retiredCommands = new Set([
  "memory", "runtime", "diagnostics", "debug", "nodeinfo", "queues",
  "collectors", "cache", "ratelimits", "refreshconfig", "syncguild",
  "refreshcache", "clearcache", "clearcollectors", "panelrefresh", "clearqueues",
  "reconnectnode", "reconnectallnodes", "reconnectnodeall", "forcereconnect",
  "switchnode", "fixplayers", "recovermusic", "recoverqueue", "clearghostplayers",
  "nodecleanup", "playerdebug", "nodestatus", "musicdiagnostics", "rejoinvc",
  "forcedbsave", "eval", "ev", "exec",
  "voteskip", "skipratio", "restrict", "lockchannel",
  "gbot name", "gbot status",
  "muteevasion", "antievasion",
  "antiraid", "raidmode", "security", "securityhelp",
  "security setcaps", "security setmaxlen", "security setaccountage",
  "security setlogs",
]);

function isRetiredCommand(command, args = []) {
  const parts = String(command || "").toLowerCase().trim().split(/\s+/);
  const name = parts[0];
  const subcommand = parts[1] || String(args[0] || "").toLowerCase();
  return retiredCommands.has(name) || retiredCommands.has(`${name} ${subcommand}`);
}

module.exports = { retiredCommands, isRetiredCommand };
