"use strict";

const { createHash } = require('node:crypto');
const fail = (message, status = 400) => Object.assign(new Error(message), { status, publicMessage: message });
const get = (object, path) => path.split('.').reduce((value, key) => value?.[key], object);
const set = (object, path, value) => {
  const parts = path.split('.');
  const key = parts.pop();
  for (const part of parts) object = object[part] ||= {};
  object[key] = value;
};
const field = (path, label, type = 'text', extra = {}) => ({ path, label, type, ...extra });
const enabled = field('enabled', 'Enabled', 'boolean');
const messageFields = [
  field('title', 'Title', 'text', { maxLength: 256 }), field('message', 'Message', 'textarea'),
  field('embedEnabled', 'Use embed', 'boolean', { default: true }), field('color', 'Embed color', 'color'),
  field('image', 'Image URL', 'url'), field('thumbnail', 'Thumbnail URL', 'url'),
  field('footer', 'Footer', 'text'), field('footerIcon', 'Footer icon URL', 'url'),
  field('authorText', 'Author', 'text', { maxLength: 256 }), field('authorIcon', 'Author icon URL', 'url')
];
const modules = {
  goodbye: { root: 'goodbye', fields: [enabled, field('channel', 'Channel', 'channel'), ...messageFields.map(f => f.path === 'color' ? { ...f, numeric: true } : f)] },
  joindm: { root: 'joinDm', fields: [enabled, ...messageFields.map(f => f.path === 'color' ? { ...f, numeric: true } : f)] },
  boost: { root: 'boost', fields: [enabled, field('channel', 'Channel', 'channel'), field('embedEnabled', 'Use embed', 'boolean', { default: true }),
    field('embed.title', 'Title', 'text', { maxLength: 256 }), field('embed.description', 'Message', 'textarea'),
    field('embed.color', 'Color', 'color'), field('embed.image', 'Image URL', 'url'), field('embed.footer', 'Footer'), field('embed.timestamp', 'Timestamp', 'boolean')] },
  birthday: { root: 'birthday', fields: [enabled, field('channel', 'Announcement channel', 'channel'), field('role', 'Birthday role', 'assignRole'), field('message', 'Message', 'textarea')] },
  confess: { root: 'confession', feature: 'confession', fields: [enabled, field('channel', 'Confession channel', 'channel'), field('logChannel', 'Log channel', 'channel'), field('bannedUsers', 'Blocked user IDs', 'users')] },
  media: { root: 'media', fields: [enabled, field('onlyChannels', 'Media-only channels', 'channels'), field('uploadLogsChannel', 'Upload logs', 'channel'), field('deleteLogsChannel', 'Delete logs', 'channel'), field('bypassUsers', 'Bypass user IDs', 'users'), field('bypassRoles', 'Bypass roles', 'roles')] },
  tempvoice: { root: 'tempVoice', fields: [enabled, field('createChannel', 'Join-to-create channel', 'voice'), field('privateCreateChannel', 'Private join-to-create channel', 'voice'), field('category', 'Category', 'category'), field('defaultName', 'Channel name', 'text', { maxLength: 100 }), field('defaultLimit', 'Member limit', 'number', { min: 0, max: 99 })] },
  giveaways: { root: 'giveawayConfig', supplemental: true, fields: [field('pingRole', 'Announcement role', 'role'), field('requireRole', 'Required entry role', 'role'), field('blacklistRole', 'Blocked entry role', 'role')] },
  economy: { root: 'economy', supplemental: true, fields: [field('currency', 'Currency symbol', 'text', { maxLength: 10, default: '💰' }), field('startBalance', 'Starting balance', 'number', { min: 0, max: 1000000, default: 100 }), field('work.min', 'Minimum work reward', 'number', { min: 0, max: 1000000, default: 50 }), field('work.max', 'Maximum work reward', 'number', { min: 0, max: 1000000, default: 200 }), field('daily', 'Daily reward', 'number', { min: 1, max: 1000000, default: 1 })] },
  autoresponder: { root: 'autoresponder', triggers: true, fields: [] },
  autoreact: { root: 'autoreact', triggers: true, fields: [] },
  rolebulk: { root: 'rolebulk', bulk: true, fields: [] }
};
const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
const safeTrigger = value => value && !['__proto__', 'constructor', 'prototype'].includes(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function visible(g, guildId, module) {
  const spec = modules[module];
  const values = Object.fromEntries(spec.fields.map(f => {
    let value = get(g[spec.root], f.path);
    if (module === 'goodbye' || module === 'joindm') {
      const root = g[spec.root] || {};
      if (f.path === 'image') value ??= root.dmImage;
      if (f.path === 'footer') value ??= root.dmFooter;
    }
    if (module === 'confess' && f.path === 'logChannel') value ??= g.confession?.logs ?? g.confessionLogs;
    if (f.type === 'color' && f.numeric && Number.isInteger(value)) value = `#${(value >>> 0).toString(16).padStart(6, '0')}`;
    const fallback = f.default ?? (f.type === 'boolean' ? false : ['users', 'roles', 'channels'].includes(f.type) ? [] : f.type === 'number' ? 0 : '');
    return [f.path, value ?? fallback];
  }));
  if (!spec.triggers) return { values };
  const legacy = module === 'autoresponder' ? g.globalAutoResponders : g.autoReact?.[guildId];
  const entries = Object.entries({ ...legacy, ...g[spec.root]?.triggers }).map(([key, value]) => ({
    key, trigger: value.trigger || key, response: value.response || '',
    emojis: value.emojis || [], reactions: value.reactions || [], enabled: value.enabled !== false
  }));
  return { values, entries };
}

async function validate(field, value, guild, member) {
  const type = field.type;
  if (type === 'boolean') { if (typeof value !== 'boolean') throw fail(`${field.label} must be on or off.`); return value; }
  if (type === 'number') { if (!Number.isInteger(value) || value < field.min || value > field.max) throw fail(`${field.label} must be ${field.min}-${field.max}.`); return value; }
  if (['users', 'roles', 'channels'].includes(type)) {
    if (!Array.isArray(value) || value.length > 100 || new Set(value).size !== value.length) throw fail(`${field.label}: select at most 100 distinct entries.`);
    for (const id of value) { if (!id) throw fail('Empty IDs are not allowed.'); await validate({ ...field, type: { users: 'user', roles: 'role', channels: 'channel' }[type] }, id, guild, member); }
    return [...value];
  }
  if (typeof value !== 'string' || value.length > (field.maxLength || 2000) || /\0/.test(value)) throw fail(`Invalid ${field.label}.`);
  value = value.trim();
  if (['channel', 'voice', 'category', 'role', 'assignRole', 'user'].includes(type)) {
    if (!value) return null;
    if (!/^\d{17,20}$/.test(value)) throw fail(`Invalid ${field.label} ID.`);
    const manager = type === 'user' ? guild.members : type.endsWith('Role') || type === 'role' ? guild.roles : guild.channels;
    const item = manager.cache.get(value) || await manager.fetch(value).catch(() => null);
    if (!item) throw fail(`${field.label} is not in this server.`);
    if (['channel', 'voice', 'category'].includes(type)) {
      if (type === 'channel' && (!item.isTextBased?.() || item.isThread?.()) || type === 'voice' && item.type !== 2 || type === 'category' && item.type !== 4) throw fail(`Invalid channel type for ${field.label}.`);
      if (!item.permissionsFor(member)?.has(1024n)) throw fail(`You cannot access ${field.label}.`, 403);
      const me = guild.members.me || await guild.members.fetchMe();
      const permissions = type === 'channel' ? [1024n, 2048n] : [1024n, 16n];
      if (!item.permissionsFor(me)?.has(permissions)) throw fail(`Bot permissions are missing for ${field.label}.`, 403);
    }
    if (type === 'assignRole') {
      const me = guild.members.me || await guild.members.fetchMe();
      if (guild.ownerId !== member.id && !member.permissions.has(268435456n)) throw fail('Manage Roles permission is required.', 403);
      if (!me.permissions.has(268435456n) || !item.editable || item.managed || item.id === guild.id || item.position >= me.roles.highest.position || (guild.ownerId !== member.id && item.position >= member.roles.highest.position)) throw fail('Birthday role is blocked by role hierarchy.', 403);
      if ([8n,32n,268435456n,16n,4n,2n].some(p => item.permissions.has(p))) throw fail('Privileged roles cannot be assigned as birthday roles.', 403);
    }
    return value;
  }
  if (type === 'color') {
    if (!/^#[\da-f]{6}$/i.test(value)) throw fail('Use a six-digit hex color.');
    if (field.numeric) return Number.parseInt(value.slice(1), 16);
  }
  if (type === 'url' && value) {
    if (!/^\{(?:user_avatar|server_avatar|server_icon|bot_avatar)\}$/.test(value)) {
      let url; try { url = new URL(value); } catch { throw fail('Invalid image URL.'); }
      if (url.protocol !== 'https:' || url.username || url.password) throw fail('Image URLs must use HTTPS.');
    }
  }
  if (/@(everyone|here)|<@&\d+>/.test(value)) throw fail('Mass mentions are not allowed in website messages.');
  return value;
}

async function communityAction({ db, g, guild, member, request, actorId, saveDatabase, onCommunityUpdated }) {
  const module = request.module;
  if (!Object.hasOwn(modules, module)) throw fail('Unknown module.');
  const spec = modules[module], guildId = guild.id;
  const snapshot = () => { const data = visible(g, guildId, module); return { ok: true, module, fields: spec.fields, supplemental: !!spec.supplemental, triggers: !!spec.triggers, bulk: !!spec.bulk, ...data, revision: hash(data) }; };
  if (request.action === 'community.get') {
    return { ...snapshot(), channels: [...guild.channels.cache.values()].filter(c => c.permissionsFor(member)?.has(1024n)).map(c => ({ id: c.id, name: c.name, type: c.type })), roles: [...guild.roles.cache.values()].filter(r => r.id !== guildId && !r.managed).map(r => ({ id: r.id, name: r.name })) };
  }
  const before = snapshot();
  if (spec.bulk) return bulkRoles({ guild, member, request, actorId });
  if (request.revision !== before.revision) throw fail('Settings changed. Refresh this module before saving again.', 409);
  const oldRoot = g[spec.root], next = structuredClone(oldRoot || {});
  if (module === 'economy') {
    next.currency ??= '💰';
    next.startBalance ??= 100;
    next.work = { min: 50, max: 200, ...(next.work || {}) };
    next.daily ??= 1;
  }
  let legacyKey, legacyNext;
  if (request.action === 'community.set') {
    if (spec.triggers || !request.values || typeof request.values !== 'object' || Array.isArray(request.values)) throw fail('Invalid settings patch.');
    for (const [key, value] of Object.entries(request.values)) {
      const f = spec.fields.find(item => item.path === key);
      if (!f) throw fail('Unknown setting.');
      set(next, key, await validate(f, value, guild, member));
    }
    if (next.enabled) {
      if (['goodbye','boost','birthday','confess'].includes(module) && !next.channel) throw fail('Choose a channel before enabling this module.');
      if (module === 'joindm' && !next.message) throw fail('Enter a message before enabling Join DMs.');
      if (module === 'media' && !next.onlyChannels?.length) throw fail('Choose at least one media channel.');
      if (module === 'tempvoice' && (!next.category || (!next.createChannel && !next.privateCreateChannel))) throw fail('Choose a category and join-to-create channel.');
    }
    if (module === 'economy' && next.work?.min > next.work?.max) throw fail('Minimum work reward cannot exceed the maximum.');
    if (module === 'joindm') {
      if (Object.hasOwn(request.values, 'image')) next.dmImage = next.image;
      if (Object.hasOwn(request.values, 'footer')) next.dmFooter = next.footer;
    }
    if (module === 'confess' && Object.hasOwn(request.values, 'logChannel')) next.logs = next.logChannel;
  } else if (spec.triggers && ['community.upsert','community.delete','community.clear'].includes(request.action)) {
    const entries = Object.fromEntries(before.entries.map(entry => [entry.key, entry]));
    next.triggers = { ...(module === 'autoresponder' ? g.globalAutoResponders : g.autoReact?.[guildId]), ...next.triggers };
    if (request.action === 'community.clear') {
      if (request.confirm !== true) throw fail('Confirm clearing all rules.');
      next.triggers = {};
    } else {
      const key = normalize(request.trigger), oldKey = request.originalKey;
      if (!safeTrigger(key) || key.length > 100) throw fail('Trigger must contain 1-100 characters.');
      if (request.action === 'community.delete') {
        if (request.confirm !== true || !Object.hasOwn(entries, key)) throw fail('Select and confirm an existing rule.');
        delete next.triggers[key];
      } else {
        if (oldKey !== undefined && !Object.hasOwn(entries, oldKey)) throw fail('Rule no longer exists. Refresh the module.', 409);
        if (key !== oldKey && Object.hasOwn(entries, key)) throw fail('That trigger already exists.', 409);
        if (!oldKey && Object.keys(entries).length >= 100) throw fail('Maximum 100 rules.');
        if (typeof request.enabled !== 'boolean') throw fail('Rule enabled state is required.');
        const emojiKey = module === 'autoreact' ? 'emojis' : 'reactions';
        const emojis = request[emojiKey];
        if (!Array.isArray(emojis) || emojis.length > 20 || (module === 'autoreact' && !emojis.length) || emojis.some(e => typeof e !== 'string' || !(/^(?:<a?:[A-Za-z0-9_]{2,32}:\d{17,20}>|\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)$/u.test(e)))) throw fail('Enter valid emoji, separated by spaces (maximum 20).');
        const item = { ...(oldKey ? next.triggers[oldKey] : {}), trigger: request.trigger.trim(), enabled: request.enabled, [emojiKey]: [...new Set(emojis)], updatedBy: actorId, updatedAt: Date.now(), guildId };
        if (module === 'autoresponder') {
          item.response = await validate(field('response','Response','textarea'), request.response, guild, member);
          if (!item.response) throw fail('A response is required.');
          if (before.entries.some(e => e.key !== oldKey && e.response.toLowerCase() === item.response.toLowerCase())) throw fail('That response already belongs to another rule.');
        }
        if (oldKey) delete next.triggers[oldKey];
        Object.defineProperty(next.triggers, key, { value: item, enumerable: true, configurable: true, writable: true });
      }
    }
    legacyKey = module === 'autoresponder' ? 'globalAutoResponders' : 'autoReact';
    legacyNext = module === 'autoresponder' ? { ...next.triggers } : { ...g.autoReact, [guildId]: { ...next.triggers } };
  } else throw fail('Unsupported module action.');
  // Validation may fetch Discord objects; recheck concurrent command edits before committing.
  if (snapshot().revision !== request.revision) throw fail('Settings changed during validation. Refresh this module.', 409);
  const previousLegacy = legacyKey && g[legacyKey];
  const previousConfessionLogs = g.confessionLogs;
  const previousFeatures = g.features, previousSystems = db.guildSystems?.[guildId];
  const feature = spec.feature || module;
  g[spec.root] = next;
  if (legacyKey) g[legacyKey] = legacyNext;
  if (module === 'confess' && Object.hasOwn(request.values || {}, 'logChannel')) g.confessionLogs = next.logChannel;
  if (Object.hasOwn(request.values || {}, 'enabled')) {
    g.features = { ...g.features, [feature]: next.enabled };
    db.guildSystems ||= {}; db.guildSystems[guildId] = { ...previousSystems, [feature]: next.enabled };
  }
  try { await saveDatabase(db, guildId); }
  catch (error) {
    if (g[spec.root] === next) { if (oldRoot === undefined) delete g[spec.root]; else g[spec.root] = oldRoot; }
    if (legacyKey && g[legacyKey] === legacyNext) { if (previousLegacy === undefined) delete g[legacyKey]; else g[legacyKey] = previousLegacy; }
    if (module === 'confess' && Object.hasOwn(request.values || {}, 'logChannel')) {
      if (previousConfessionLogs === undefined) delete g.confessionLogs; else g.confessionLogs = previousConfessionLogs;
    }
    g.features = previousFeatures;
    if (db.guildSystems) { if (previousSystems === undefined) delete db.guildSystems[guildId]; else db.guildSystems[guildId] = previousSystems; }
    throw fail('Storage did not confirm this save. Refresh before retrying.', 503);
  }
  let warning;
  if (spec.triggers && onCommunityUpdated) {
    try { await onCommunityUpdated(guildId, module); }
    catch { warning = 'Saved, but the bot could not refresh its in-memory trigger matcher.'; }
  }
  return { ...snapshot(), ...(warning ? { warning } : {}) };
}

async function bulkRoles({guild, member, request, actorId}) {
  if (!['community.rolePreview','community.roleApply'].includes(request.action)) throw fail('Unsupported bulk role action.');
  if (!['add','remove'].includes(request.operation)) throw fail('Choose add or remove.');
  if (typeof request.roleId !== 'string' || !/^\d{17,20}$/.test(request.roleId)) throw fail('Choose a valid role.');
  if (guild.ownerId !== actorId && !member.permissions.has(268435456n)) throw fail('Manage Roles permission is required.',403);
  const me = guild.members.me || await guild.members.fetchMe();
  const role = guild.roles.cache.get(request.roleId) || await guild.roles.fetch(request.roleId).catch(()=>null);
  if (!me.permissions.has(268435456n) || !role || role.managed || !role.editable || role.id === guild.id || role.position >= me.roles.highest.position || (guild.ownerId !== actorId && role.position >= member.roles.highest.position)) throw fail('Role is blocked by permissions or hierarchy.',403);
  if (request.operation === 'add' && [8n,32n,268435456n,16n,4n,2n].some(permission=>role.permissions.has(permission))) throw fail('Privileged roles cannot be bulk-assigned from the website.',403);
  const ids = request.memberIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 5 || new Set(ids).size !== ids.length || ids.some(id=>typeof id!=='string'||!/^\d{17,20}$/.test(id))) throw fail('Select 1-5 distinct member IDs per batch.');
  const members = [];
  for (const id of ids) {
    const target = await guild.members.fetch(id).catch(()=>null);
    if (!target || target.id === guild.ownerId || target.id === me.id || target.roles.highest.position >= me.roles.highest.position || (guild.ownerId !== actorId && target.roles.highest.position >= member.roles.highest.position)) throw fail('A selected member is unavailable or blocked by hierarchy.',403);
    members.push(target);
  }
  const plan = members.map(target=>({id:target.id,name:target.displayName||target.id,hasRole:target.roles.cache.has(role.id)}));
  const revision = hash({roleId:role.id,operation:request.operation,plan});
  if(request.action==='community.rolePreview')return {ok:true,plan,revision,roleName:role.name};
  if(request.confirm!==true || request.revision!==revision)throw fail('Preview and confirm the current member list before applying.',409);
  const outcomes=[];
  for(const target of members){
    const exists=target.roles.cache.has(role.id);
    if(exists === (request.operation==='add')){outcomes.push({id:target.id,state:'unchanged'});continue;}
    try {
      await target.roles[request.operation](role.id,`Dashboard bulk role ${request.operation} by ${actorId}`);
      outcomes.push({id:target.id,state:'applied'});
    } catch { outcomes.push({id:target.id,state:'failed'}); }
  }
  return {ok:true,outcomes};
}

module.exports = { communityAction, modules, visible, validate };
