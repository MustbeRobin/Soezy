"use strict";
const { REST, Routes, PermissionsBitField } = require("discord.js");
(async () => {
  const rest = new REST({ version: "10" }).setToken(require("../config.json").token);
  const app = await rest.get(Routes.oauth2CurrentApplication());
  if (app.id !== "1456175060128632996") throw new Error("Wrong application");
  const id = process.argv[2] || "1364922776007479306";
  const member = await rest.get(Routes.guildMember(id, app.id));
  const roles = await rest.get(Routes.guildRoles(id));
  const bits = roles.filter(r => r.id === id || member.roles.includes(r.id)).reduce((n, r) => n | BigInt(r.permissions), 0n);
  const perms = new PermissionsBitField(bits);
  console.log(JSON.stringify({ guild: id, administrator: perms.has("Administrator"), manageGuild: perms.has("ManageGuild") }));
  const rules = await rest.get(Routes.guildAutoModerationRules(id));
  console.log(JSON.stringify(rules.map(r => ({ id: r.id, name: r.name, creator: r.creator_id, trigger: r.trigger_type, enabled: r.enabled, actions: r.actions }))));
  if (process.argv.includes("--probe")) {
    for (const [type, metadata] of [[1, { keyword_filter: ["soezy_diagnostic_never_match_928374"] }], [3, {}], [4, { presets: [1] }], [5, { mention_total_limit: 5 }], [6, { keyword_filter: ["soezy_diagnostic_never_match_928374"] }]]) {
      if (type !== 1 && rules.some(r => r.trigger_type === type)) continue;
      let rule;
      try {
        rule = await rest.post(Routes.guildAutoModerationRules(id), { body: {
          name: "Soezy temporary disabled diagnostic", event_type: type === 6 ? 2 : 1,
          trigger_type: type, trigger_metadata: metadata, enabled: false,
          actions: [{ type: type === 6 ? 4 : 1 }],
        } });
        console.log(JSON.stringify({ trigger: type, createDisabled: "ok" }));
      } catch (error) { console.log(JSON.stringify({ trigger: type, code: error.code, message: error.message })); }
      finally { if (rule) await rest.delete(Routes.guildAutoModerationRule(id, rule.id)); }
    }
  }
})().catch(e => { console.error(JSON.stringify({ code: e.code, message: e.message, method: e.method, url: e.url })); process.exitCode = 1; });
