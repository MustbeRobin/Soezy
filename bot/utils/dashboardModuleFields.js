"use strict";
// Additive website-field validation. Does not deploy panels or execute bot commands.
const definitions = require('./dashboardModuleFields.json');
const fields = new Map(definitions.map(field => [field.path, field]));
function validate(path, value) {
  const field = fields.get(path);
  if (!field) return;
  let valid = false;
  if (field.type === 'boolean') valid = typeof value === 'boolean';
  else if (field.type === 'number') valid = Number.isInteger(value) && value >= field.min && value <= field.max;
  else if (typeof value === 'string' && value.length <= (field.maxLength || 2000) && !value.includes('\0')) {
    valid = true;
    if (field.type === 'id') valid = !value || /^\d{15,25}$/.test(value);
    if (field.type === 'color') valid = !value || /^#?[\da-f]{6}$/i.test(value);
    if (field.type === 'url' && value) {
      if (/^\{(?:user_avatar|server_icon|server_avatar|bot_avatar|user\.avatar|user\.banner)\}$/.test(value)) valid = true;
      else { try { const u = new URL(value.replace(/\{[\w.]+\}/g,'preview')); valid = ['https:','http:'].includes(u.protocol) && !u.username && !u.password; } catch { valid = false; } }
    }
  }
  if (!valid) throw Object.assign(new Error(`Invalid value for ${path}.`), {status:400});
}
function clean(path,value) {
  validate(path,value);
  return typeof value === 'string' ? value.trim() : value;
}
module.exports = {fields, validate, clean};
