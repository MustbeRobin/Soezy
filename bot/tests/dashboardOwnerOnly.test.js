const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
test('server-owned dashboard modules stay separate from bot ExtraOwner permissions', () => {
  const source = fs.readFileSync(path.join(__dirname, '../utils/dashboardRuntime.js'), 'utf8');
  const start = source.indexOf('  function canManageSecurity(');
  const end = source.indexOf('  async function validateSecurityList', start);
  const ctx = vm.createContext({ isSnowflake: () => true, config: { ownerIds: [] }, botConfig: { ownerIds: [] },
    loadDatabase: () => ({ guilds: { guild: { extraOwners: ['extra-owner'] } } }),
    soezyOwnerManager: { isBotOwner: id => id === 'bot-owner' }, isConfiguredBotOwner: () => false });
  vm.runInContext(source.slice(start, end), ctx);
  assert.equal(ctx.canManageSecurity('guild', 'guild-owner'), false);
  assert.equal(ctx.canManageSecurity('guild', 'extra-owner'), true);
  assert.equal(ctx.canManageSecurity('guild', 'bot-owner'), true);
  assert.equal(ctx.canManageSecurity('guild', null), false);
});
