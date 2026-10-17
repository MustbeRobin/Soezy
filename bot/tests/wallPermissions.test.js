"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");

const source = fs.readFileSync(path.join(__dirname, "../utils/wallManager.js"), "utf8");
const guildId = "111111111111111111";
const roleId = "222222222222222222";
const botId = "333333333333333333";
const memberId = "444444444444444444";

function declaration(name) {
  const start = source.indexOf(`async function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}
function syncDeclaration(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n}", start) + 2);
}

function harness() {
  const state = { enabled: true, quarantineRoleId: roleId, quarantined: { [guildId]: {} } };
  const edits = [];
  const role = { id: roleId };
  const guild = {
    id: guildId,
    ownerId: "555555555555555555",
    client: { user: { id: botId } },
    fetchAuditLogs: async () => ({ entries: { find: predicate => [{
      target: { id: roleId }, changes: [{ key: "permissions" }],
      createdTimestamp: Date.now(), executor: { id: "666666666666666666" },
    }].find(predicate) } }),
    members: { fetch: async () => ({ id: "666666666666666666" }) },
    roles: { cache: new Map([[roleId, role]]) },
  };
  const context = vm.createContext({
    ...discord,
    AuditLogEvent: discord.AuditLogEvent,
    ensureWallState: () => state,
    isWallWhitelisted: () => false,
    console: { warn() {} },
  });
  vm.runInContext(`const WALL_DANGEROUS_PERMISSION_BITS = ${source.match(/const WALL_DANGEROUS_PERMISSION_BITS =[\s\S]*?;\n/)[0].split("=").slice(1).join("=").trim().slice(0, -1)};
    const wallChannelEnforcementLocks = new Set();
    ${syncDeclaration("normalizeWallId")}
    ${declaration("wallGuardRolePermissions")}
    ${declaration("wallEnforceQuarantineChannelAccess")}`, context);
  vm.runInContext(declaration("wallRestoreMemberChannelAccess"), context);
  return { context, state, guild, edits };
}

function makeRole(guild, bits, editable = true, managed = false) {
  const edits = [];
  const role = {
    id: roleId,
    guild,
    editable,
    managed,
    permissions: { bitfield: BigInt(bits) },
    edit: async update => { edits.push(update); },
  };
  return { role, edits };
}

test("Wall removes every configured dangerous role permission while preserving harmless bits", async () => {
  const h = harness();
  const flags = discord.PermissionsBitField.Flags;
  const dangerous = [
    flags.Administrator, flags.BanMembers, flags.KickMembers, flags.ManageGuild,
    flags.ManageRoles, flags.ManageChannels, flags.ManageWebhooks, flags.MentionEveryone,
    flags.ManageNicknames, flags.ModerateMembers,
  ].reduce((bits, flag) => bits | BigInt(flag), 0n);
  const harmless = BigInt(flags.ViewChannel | flags.SendMessages);
  const { role, edits } = makeRole(h.guild, dangerous | harmless);
  assert.equal(await h.context.wallGuardRolePermissions({ permissions: { bitfield: 0n } }, role), true);
  assert.equal(edits.length, 1);
  assert.equal(BigInt(edits[0].permissions), harmless);
});

test("Wall exempts owner and whitelisted permission editors", async () => {
  const h = harness();
  const { role, edits } = makeRole(h.guild, BigInt(discord.PermissionsBitField.Flags.ManageRoles));
  h.guild.fetchAuditLogs = async () => ({ entries: { find: predicate => [{
    target: { id: roleId }, changes: [{ key: "permissions" }],
    createdTimestamp: Date.now(), executor: { id: h.guild.ownerId },
  }].find(predicate) } });
  assert.equal(await h.context.wallGuardRolePermissions({ permissions: { bitfield: 0n } }, role), false);
  assert.equal(edits.length, 0);

  h.guild.fetchAuditLogs = async () => ({ entries: { find: predicate => [{
    target: { id: roleId }, changes: [{ key: "permissions" }],
    createdTimestamp: Date.now(), executor: { id: "777777777777777777" },
  }].find(predicate) } });
  h.context.isWallWhitelisted = () => true;
  assert.equal(await h.context.wallGuardRolePermissions({ permissions: { bitfield: 0n } }, role), false);
  assert.equal(edits.length, 0);
});

test("Wall guards dangerous permissions on role creation and reports roles it cannot edit", async () => {
  const h = harness();
  const { role, edits } = makeRole(h.guild, BigInt(discord.PermissionsBitField.Flags.ManageNicknames));
  h.guild.fetchAuditLogs = async ({ type }) => {
    assert.equal(type, discord.AuditLogEvent.RoleCreate);
    return { entries: { find: predicate => [{
      target: { id: roleId }, createdTimestamp: Date.now(), executor: { id: "666666666666666666" },
    }].find(predicate) } };
  };
  assert.equal(await h.context.wallGuardRolePermissions(null, role, { auditType: discord.AuditLogEvent.RoleCreate }), true);
  assert.equal(BigInt(edits[0].permissions), 0n);

  const { role: highRole } = makeRole(h.guild, BigInt(discord.PermissionsBitField.Flags.ManageRoles), false);
  await assert.rejects(
    h.context.wallGuardRolePermissions({ permissions: { bitfield: 0n } }, highRole),
    /managed or above the bot/
  );
});

test("Wall applies quarantine-role channel denies once and leaves exempt channels untouched", async () => {
  const h = harness();
  const deny = new discord.PermissionsBitField();
  const cache = new discord.Collection();
  const channel = {
    id: "888888888888888888",
    guild: h.guild,
    permissionOverwrites: {
      cache,
      edit: async (target, permissions) => {
        h.edits.push({ target, permissions });
        cache.set(roleId, { deny: new discord.PermissionsBitField(discord.PermissionsBitField.Flags.ViewChannel) });
      },
    },
  };
  assert.equal(await h.context.wallEnforceQuarantineChannelAccess(channel), true);
  assert.equal(await h.context.wallEnforceQuarantineChannelAccess(channel), false);
  assert.equal(h.edits.length, 1);
  assert.equal(h.edits[0].permissions.ViewChannel, false);
  h.state.jailChannelId = channel.id;
  assert.equal(await h.context.wallEnforceQuarantineChannelAccess(channel), false);
  assert.equal(deny.has(discord.PermissionsBitField.Flags.ViewChannel), false);
});

test("Wall denies explicit member channel allows while quarantined and restores them on release", async () => {
  const h = harness();
  const memberRecord = {};
  h.state.quarantined[guildId][memberId] = memberRecord;
  const cache = new discord.Collection();
  cache.set(memberId, {
    allow: new discord.PermissionsBitField(discord.PermissionsBitField.Flags.ViewChannel),
    deny: new discord.PermissionsBitField(),
  });
  const channel = {
    id: "999999999999999999",
    guild: h.guild,
    permissionOverwrites: {
      cache,
      edit: async (target, permissions) => {
        h.edits.push({ target: typeof target === "string" ? target : target.id, permissions });
        cache.set(typeof target === "string" ? target : target.id, {
          allow: new discord.PermissionsBitField(permissions.ViewChannel === true ? discord.PermissionsBitField.Flags.ViewChannel : 0n),
          deny: new discord.PermissionsBitField(permissions.ViewChannel === false ? discord.PermissionsBitField.Flags.ViewChannel : 0n),
        });
      },
    },
  };
  h.guild.channels = { cache: new Map([[channel.id, channel]]) };
  assert.equal(await h.context.wallEnforceQuarantineChannelAccess(channel), true);
  assert.equal(memberRecord.wallViewChannelAccessRestores[channel.id], "allow");
  assert.equal(cache.get(memberId).deny.has(discord.PermissionsBitField.Flags.ViewChannel), true);

  await h.context.wallRestoreMemberChannelAccess(h.guild, memberId, memberRecord);
  assert.equal(cache.get(memberId).allow.has(discord.PermissionsBitField.Flags.ViewChannel), true);
  assert.equal(Object.keys(memberRecord.wallViewChannelAccessRestores).length, 0);
});

test("Wall denies role-derived channel visibility for quarantined members and clears it on release", async () => {
  const h = harness();
  const memberRecord = {};
  h.state.quarantined[guildId][memberId] = memberRecord;
  const cache = new discord.Collection();
  const channel = {
    id: "999999999999999998",
    guild: h.guild,
    permissionOverwrites: {
      cache,
      edit: async (target, permissions) => {
        h.edits.push({ target: typeof target === "string" ? target : target.id, permissions });
        cache.set(typeof target === "string" ? target : target.id, {
          allow: new discord.PermissionsBitField(permissions.ViewChannel === true ? discord.PermissionsBitField.Flags.ViewChannel : 0n),
          deny: new discord.PermissionsBitField(permissions.ViewChannel === false ? discord.PermissionsBitField.Flags.ViewChannel : 0n),
        });
      },
    },
  };
  const member = { id: memberId, permissionsIn: () => new discord.PermissionsBitField(discord.PermissionsBitField.Flags.ViewChannel) };
  h.guild.members.cache = new Map([[memberId, member]]);
  h.guild.channels = { cache: new Map([[channel.id, channel]]) };

  assert.equal(await h.context.wallEnforceQuarantineChannelAccess(channel), true);
  assert.equal(memberRecord.wallViewChannelAccessRestores[channel.id], "inherit");
  assert.equal(cache.get(memberId).deny.has(discord.PermissionsBitField.Flags.ViewChannel), true);
  await h.context.wallRestoreMemberChannelAccess(h.guild, memberId, memberRecord);
  assert.equal(cache.get(memberId).deny.has(discord.PermissionsBitField.Flags.ViewChannel), false);
  assert.equal(cache.get(memberId).allow.has(discord.PermissionsBitField.Flags.ViewChannel), false);
});
