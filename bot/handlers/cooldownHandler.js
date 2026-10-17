function checkUnifiedCooldown({ userId, commandName, guildId, member }) {
  if (typeof checkCommandGate !== "function") return 0;
  return checkCommandGate(userId, commandName, guildId, null, { member });
}

module.exports = { checkUnifiedCooldown };
