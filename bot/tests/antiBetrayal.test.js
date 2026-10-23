const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createAntiBetrayal, EVENTS } = require('../utils/antiBetrayal');
const { antiBetrayalCommand } = require('../utils/antiBetrayalCommand');

const G = '100000000000000001';
const U = '100000000000000002';
const BOT_OWNER = '100000000000000003';
const EXTRA_OWNER = '100000000000000004';
const ROLE = '100000000000000005';
const SERVER_OWNER = '100000000000000009';

function setup() {
  let clock = 1_000_000;
  let failSave = false;
  let missing = false;
  let failAction = false;
  let permission = true;
  let calls = 0;
  let warnings = 0;
  let persisted;
  const roles = new Map();
  const legacyScope = { users: [U], roles: [ROLE] };
  const db = {
    guilds: {
      [G]: {
        extraOwners: [EXTRA_OWNER],
        wallSystem: { enabled: true, whitelistUsers: [U], whitelistRoles: [ROLE] },
        security: {
          whitelistUsers: [U],
          whitelistRoles: [ROLE],
          whitelistScopes: { antiBetrayal: structuredClone(legacyScope) }
        }
      }
    }
  };
  const member = {
    id: U,
    roles: {
      cache: roles,
      remove: async () => { calls++; }
    },
    get moderatable() { return permission; },
    get kickable() { return permission; },
    get bannable() { return permission; },
    manageable: true,
    send: async payload => { warnings++; return payload; },
    timeout: async () => { calls++; if (failAction) throw Error('Discord'); },
    kick: async () => { calls++; },
    ban: async () => { calls++; }
  };
  const guild = {
    id: G,
    ownerId: SERVER_OWNER,
    members: {
      fetch: async query => {
        if (missing) return null;
        const id = typeof query === 'string' ? query : query?.user;
        return { ...member, id: id || U };
      }
    },
    roles: {
      cache: new Map([[ROLE, { id: ROLE, editable: true, permissions: { any: () => true } }]]),
      fetch: async id => id === ROLE ? { id } : null
    },
    channels: { fetch: async () => null },
    fetchOwner: async () => ({ send: async () => {} })
  };
  const client = {
    user: { id: '100000000000000008' },
    guilds: { cache: new Map([[G, guild]]) }
  };
  const options = {
    getClient: () => client,
    getDatabase: () => db,
    save: async () => {
      if (failSave) throw Error('Redis unavailable');
      persisted = structuredClone(db);
      return true;
    },
    authorize: async (guildId, id) => guildId === G && (id === BOT_OWNER || db.guilds[G].extraOwners.includes(id)),
    now: () => clock
  };
  let service = createAntiBetrayal(options);
  let sequence = 0;
  const event = (kind = 'bans', target, changes, executorId = U) => ({
    id: String(100000000000000100n + BigInt(++sequence)),
    action: EVENTS[kind],
    createdTimestamp: clock,
    executorId,
    targetId: target || String(100000000000000500n + BigInt(sequence)),
    changes: changes || []
  });
  return {
    db, guild, member, roles, event,
    get service() { return service; },
    get calls() { return calls; },
    get warnings() { return warnings; },
    set missing(value) { missing = value; },
    set failSave(value) { failSave = value; },
    set failAction(value) { failAction = value; },
    set permission(value) { permission = value; },
    advance(ms) { clock += ms; },
    restart() { service = createAntiBetrayal(options); },
    persisted: () => persisted,
    async set(edit, actor = BOT_OWNER) {
      const current = service.view(G);
      edit(current);
      return service.action(G, {
        action: 'antiBetrayal.set',
        revision: current.revision,
        config: current.config
      }, actor);
    }
  };
}

test('disabled defaults, ignored legacy whitelist data, persistence, stale revision and denied configuration', async () => {
  const state = setup();
  const before = state.service.view(G);
  assert.equal(before.config.enabled, false);
  assert.deepEqual(before.protection, { serverOwnerImmune: true, extraOwnersImmune: false });
  assert.equal(Object.hasOwn(before, 'exemptions'), false);
  assert.deepEqual(state.db.guilds[G].security.whitelistScopes.antiBetrayal, { users: [U], roles: [ROLE] });
  await state.service.consume(state.event(), state.guild);
  assert.equal(state.calls, 0);
  await assert.rejects(state.service.action(G, { action: 'antiBetrayal.get' }, U), /Only/);

  const withExemptions = state.service.view(G);
  await assert.rejects(state.service.action(G, {
    action: 'antiBetrayal.set', revision: withExemptions.revision,
    config: withExemptions.config, exemptions: { users: [U], roles: [] }
  }, BOT_OWNER), /no user or role whitelist/i);
  await state.set(value => { value.config.enabled = true; });
  assert.deepEqual(state.db.guilds[G].security.whitelistScopes.antiBetrayal, { users: [U], roles: [ROLE] });
  await assert.rejects(state.service.action(G, { action: 'antiBetrayal.set', revision: 0 }, BOT_OWNER), /changed/);
  state.restart();
  assert.equal(state.service.view(G).config.enabled, true);
  assert.equal(state.service.view(G).incidents.some(item => Object.hasOwn(item, 'exemptions')), false);
});

test('server owner is immune but bot extra owners can configure and are still evaluated', async () => {
  const state = setup();
  await state.set(value => {
    value.config.enabled = true;
    value.config.mode = 'strict';
    value.config.events.bans.response = 'timeout';
    value.config.events.bans.minTargets = 1;
  }, EXTRA_OWNER);
  await state.service.consume(state.event('bans', null, null, SERVER_OWNER), state.guild);
  await state.service.consume(state.event('bans', null, null, SERVER_OWNER), state.guild);
  assert.equal(state.calls, 0);
  assert(state.service.view(G).incidents.some(item => item.result === 'server-owner immunity'));

  await state.service.consume(state.event('bans', null, null, EXTRA_OWNER), state.guild);
  await state.service.consume(state.event('bans', null, null, EXTRA_OWNER), state.guild);
  assert.equal(state.calls, 1);
  assert(state.service.view(G).incidents.some(item => item.actorId === EXTRA_OWNER && item.result === 'timeout applied'));
});

test('global and Wall whitelist entries do not exempt Anti-Betrayal actors', async () => {
  const state = setup();
  await state.set(value => {
    value.config.enabled = true;
    value.config.mode = 'strict';
    value.config.events.bans.response = 'timeout';
    value.config.events.bans.minTargets = 1;
  });
  await state.service.consume(state.event(), state.guild);
  await state.service.consume(state.event(), state.guild);
  assert.equal(state.calls, 1);
  assert.deepEqual(state.db.guilds[G].security.whitelistUsers, [U]);
  assert.deepEqual(state.db.guilds[G].wallSystem.whitelistUsers, [U]);
});

test('monitor never punishes; balanced and strict thresholds differ explicitly', async () => {
  for (const mode of ['monitor', 'balanced', 'strict']) {
    const state = setup();
    await state.set(value => {
      value.config.enabled = true;
      value.config.mode = mode;
      value.config.events.bans.response = 'timeout';
    });
    await state.service.consume(state.event(), state.guild);
    await state.service.consume(state.event(), state.guild);
    assert.equal(state.calls, mode === 'strict' ? 1 : 0);
    await state.service.consume(state.event(), state.guild);
    assert.equal(state.calls, mode === 'monitor' ? 0 : 1);
  }
});

test('the configured warning response sends a direct warning to the actor', async () => {
  const state = setup();
  await state.set(value => {
    value.config.enabled = true;
    value.config.mode = 'strict';
    value.config.events.bans.response = 'warn';
    value.config.events.bans.minTargets = 1;
  });
  await state.service.consume(state.event(), state.guild);
  await state.service.consume(state.event(), state.guild);
  assert.equal(state.calls, 0);
  assert.equal(state.warnings, 1);
  assert(state.service.view(G).incidents.some(item => item.result === 'warning delivered'));
});

test('each supported event uses its configured thresholds and qualifying changes', async () => {
  for (const kind of Object.keys(EVENTS)) {
    const state = setup();
    await state.set(value => {
      value.config.enabled = true;
      value.config.mode = 'strict';
      value.config.criticalRoles = [ROLE];
      value.config.events[kind].response = 'timeout';
      value.config.events[kind].minTargets = 1;
      for (const eventKind of Object.keys(EVENTS)) value.config.events[eventKind].enabled = eventKind === kind;
    });
    const changes = kind === 'timeouts' ? [{ key: 'communication_disabled_until', new: new Date(2_000_000).toISOString() }]
      : kind === 'roleRemoval' ? [{ key: '$remove', new: [{ id: ROLE }] }]
        : kind === 'dangerousRoles' ? [{ key: '$add', new: [{ id: ROLE }] }]
          : kind === 'rolePermissions' ? [{ key: 'permissions', old: '0', new: '8' }]
            : kind === 'serverSecurity' ? [{ key: 'verification_level', old: 3, new: 0 }]
              : [];
    await state.service.consume(state.event(kind, null, changes), state.guild);
    assert.equal(state.calls, 0, kind);
    await state.service.consume(state.event(kind, null, changes), state.guild);
    assert.equal(state.calls, 1, kind);
  }
});

test('missing attribution, missing membership, duplicate records, windows, permissions and save failures are safe', async () => {
  const state = setup();
  await state.set(value => {
    value.config.enabled = true;
    value.config.mode = 'strict';
    value.config.events.bans.response = 'timeout';
    value.config.events.bans.minTargets = 1;
  });
  const entry = state.event();
  await state.service.consume({ ...entry, executorId: null }, state.guild);
  state.missing = true;
  await state.service.consume(entry, state.guild);
  assert.equal(state.calls, 0);
  state.missing = false;
  await Promise.all([state.service.consume(entry, state.guild), state.service.consume(entry, state.guild)]);
  assert.equal(state.calls, 0);
  state.advance(61_000);
  await state.service.consume(state.event(), state.guild);
  assert.equal(state.calls, 0);
  state.permission = false;
  await state.service.consume(state.event(), state.guild);
  assert.equal(state.calls, 0);
  state.advance(301_000);
  state.permission = true;
  state.failSave = true;
  await assert.rejects(state.service.consume(state.event(), state.guild), /Redis/);
  assert.equal(state.calls, 0);
  const before = state.service.view(G);
  await assert.rejects(state.set(value => { value.config.timeoutSeconds = 601; }), /Redis/);
  assert.deepEqual(state.service.view(G).config, before.config);
});

test('concurrent records reserve a single response; failed actions do not retry after restart', async () => {
  const state = setup();
  await state.set(value => {
    value.config.enabled = true;
    value.config.mode = 'strict';
    value.config.events.bans.response = 'timeout';
  });
  state.failAction = true;
  await Promise.all(Array.from({ length: 5 }, () => state.service.consume(state.event(), state.guild)));
  assert.equal(state.calls, 1);
  state.restart();
  await state.service.consume(state.event(), state.guild);
  await state.service.consume(state.event(), state.guild);
  assert.equal(state.calls, 1);
});

test('commands expose config and incidents without whitelist management', async () => {
  const state = setup();
  let reply;
  const message = { guildId: G, author: { id: BOT_OWNER }, reply: async value => { reply = value; } };
  await antiBetrayalCommand(state.service, message, ['status']);
  assert.match(reply.content, /serverOwnerImmune/);
  assert.doesNotMatch(reply.content, /exemptions/);
  await assert.rejects(antiBetrayalCommand(state.service, message, ['exempt', 'user', 'add', U]), /no user or role whitelist/i);
  await assert.rejects(antiBetrayalCommand(state.service, { ...message, author: { id: U } }, ['enable']), /Only/);
});

test('validation rejects invalid IDs, invalid event settings, unknown responses, and other guilds', async () => {
  const state = setup();
  await assert.rejects(state.set(value => { value.config.responseRoles = ['invalid']; }), /Invalid responseRoles/);
  await assert.rejects(state.set(value => { value.config.responseRoles = ['100000000000000099']; }), /Selected role/);
  await assert.rejects(state.set(value => { value.config.events.bans.threshold = 1; }), /counts/);
  await assert.rejects(state.set(value => { value.config.events.bans.response = 'nuke'; }), /event settings/);
  await assert.rejects(state.service.action('100000000000000099', { action: 'antiBetrayal.get' }, BOT_OWNER), /Only/);
});

test('per-event response settings apply while prior general whitelists remain untouched', async () => {
  const state = setup();
  await state.set(value => {
    value.config.enabled = true;
    value.config.mode = 'strict';
    value.config.events.bans.response = 'timeout';
    value.config.events.bans.minTargets = 1;
  });
  await state.service.consume(state.event(), state.guild);
  await state.service.consume(state.event(), state.guild);
  assert.equal(state.calls, 1);
  assert.deepEqual(state.db.guilds[G].security.whitelistUsers, [U]);
  assert.deepEqual(state.db.guilds[G].security.whitelistRoles, [ROLE]);
  assert.deepEqual(state.db.guilds[G].wallSystem.whitelistUsers, [U]);
  assert.deepEqual(state.db.guilds[G].wallSystem.whitelistRoles, [ROLE]);
});

test('deleted alert channel is recorded, and repeated events on one target respect minimum distinct targets', async () => {
  const state = setup();
  await state.set(value => { value.config.enabled = true; value.config.mode = 'strict'; });
  state.db.guilds[G].wallSystem.antiBetrayal.alertChannel = '100000000000000077';
  await state.service.consume(state.event('bans', ROLE), state.guild);
  await state.service.consume(state.event('bans', ROLE), state.guild);
  assert.equal(state.service.view(G).incidents.filter(item => item.kind === 'bans').length, 0);
  await state.service.consume(state.event(), state.guild);
  assert(state.service.view(G).incidents.some(item => item.result === 'alert-channel-unavailable'));
  assert.equal(state.calls, 0);
});
