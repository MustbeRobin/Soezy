const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { buildRoleList, handleRoleListButton } = require('../utils/roleList');
const source = fs.readFileSync(require.resolve('../config/settings.js'), 'utf8');
const emojis = vm.runInNewContext(source.slice(source.indexOf('const EMOJIS ='), source.indexOf('function getEmoji(')) + '\nEMOJIS;');
const user = { id: '123456789012345678', username: 'requester' };
const guild = { roles: { cache: new Map(Array.from({ length: 31 }, (_, i) => [String(i), {
  id: String(i), name: i === 30 ? '@everyone `<@&123456789012345678>`' : `Role ${i}`,
  position: i, comparePositionTo(other) { return this.position - other.position; }
}])) } };

test('role pages show total, plain names, unique buttons, and footer after controls', () => {
  const payload = buildRoleList(guild, user, 1, Date.now() + 10000, emojis);
  const c = payload.components[0].toJSON().components;
  assert.deepEqual(c.map(x => x.type), [10, 14, 10, 14, 1, 14, 10]);
  assert.match(c[0].content, /`31`/);
  assert.equal(c[2].content.split('\n').length, 15);
  assert.doesNotMatch(c[2].content, /<@&\d+>|@everyone/);
  assert.equal(new Set(c[4].components.map(b => b.custom_id)).size, 5);
  assert.equal(c[4].components[0].disabled, true);
  assert.equal(c[4].components[3].disabled, false);
  assert.match(c[6].content, /Requested by `requester` \| Page 1\/3/);
  assert.deepEqual(payload.allowedMentions, { parse: [], repliedUser: false });
  const last = buildRoleList(guild, user, 999, Date.now() + 10000, emojis).components[0].toJSON().components;
  assert.match(last[2].content, /Role 0/);
  assert.equal(last[4].components[4].disabled, true);
});

test('outsiders and expired panels cannot fetch roles or edit a list', async () => {
  for (const outsider of [true, false]) {
    let replies = 0;
    await handleRoleListButton({ guild,
      customId: `rolelist_${user.id}_${Date.now() + (outsider ? 10000 : -1000)}_2_next`,
      user: outsider ? { id: '222222222222222222' } : user,
      reply: async () => { replies++; },
      deferUpdate: async () => assert.fail('Must not edit')
    }, emojis);
    assert.equal(replies, 1);
  }
});

test('page navigation acknowledges before fetch and close deletes only the panel', async () => {
  const calls = [];
  const interaction = { guild: { roles: { ...guild.roles, fetch: async () => calls.push('fetch') } }, user,
    customId: `rolelist_${user.id}_${Date.now() + 10000}_2_next`,
    deferUpdate: async () => calls.push('ack'),
    editReply: async payload => { calls.push('edit'); assert.match(payload.components[0].toJSON().components[6].content, /Page 2\/3/); },
    deleteReply: async () => calls.push('delete')
  };
  await handleRoleListButton(interaction, emojis);
  assert.deepEqual(calls, ['ack', 'fetch', 'edit']);
  calls.length = 0;
  interaction.customId = `rolelist_${user.id}_${Date.now() + 10000}_close_close`;
  await handleRoleListButton(interaction, emojis);
  assert.deepEqual(calls, ['ack', 'delete']);
});
