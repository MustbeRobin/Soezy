"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");
const source = fs.readFileSync(path.join(__dirname, "../utils/embedBuilders/helpEmbeds.js"), "utf8");
const start = source.indexOf("function buildAutomodConfigContainer(");
const end = source.indexOf("\n}\n", start) < 0 ? source.indexOf("\r\n}\r\n", start) : source.indexOf("\n}\n", start);
const builder = source.slice(start, end + 3);

test("AutoMod menu only exposes state-aware toggles and dashboard configuration", () => {
  for (const enabled of [false, true]) {
    const keys = ["antiSpam", "antiMassMention", "antiCaps", "antiInvite", "antiLink", "antiBot", "badWords", "nsfw", "duplicate", "scams", "imageScam", "accountAge"];
    const data = { automod: { enabled: true, features: Object.fromEntries(keys.map(key => [key, { enabled }])) } };
    const ctx = vm.createContext({ ...discord,
      require: require("node:module").createRequire(path.join(__dirname, "../index.js")),
      guildData: () => data, saveDB() {}, getSecurityConfigState: () => ({}),
      securityConfigFeatureList: () => [], getAutomodBulkState: () => ({ allEnabled: true, allDisabled: false }),
      EMOJIS: { thinking: "" }
    });
    vm.runInContext(builder, ctx);
    const panel = ctx.buildAutomodConfigContainer("123", "456_789", {}).toJSON();
    const controls = panel.components.flatMap(component => component.components || []);
    const menus = controls.filter(component => component.type === 3);
    assert.equal(menus.length, 1);
    assert.equal(menus[0].options.length, 11);
    for (const option of menus[0].options) {
      assert.ok(option.label.startsWith(enabled ? "Disable " : "Enable "));
      assert.match(option.description, enabled ? /Currently ON/ : /Currently OFF/);
      assert.doesNotMatch(option.value, /wl|logs|messageguards|manage/);
    }
    const dashboard = controls.find(component => component.label === "Dashboard");
    assert.equal(dashboard.style, discord.ButtonStyle.Link);
    assert.ok(dashboard.url.endsWith("/dashboard/guild/123/automod"));
  }
});

test("help website and default dashboard links point to Vercel", () => {
  assert.ok(source.includes("[Website](https://soezy-dashboard.vercel.app)"));
  const settings = require("../utils/securityDashboardSettings");
  const saved = [process.env.SOEZY_DASHBOARD_URL, process.env.WEB_PUBLIC_URL];
  try {
    delete process.env.SOEZY_DASHBOARD_URL;
    delete process.env.WEB_PUBLIC_URL;
    assert.equal(settings.dashboardUrl("123", "automod"), "https://soezy-dashboard.vercel.app/dashboard/guild/123/automod");
  } finally {
    ["SOEZY_DASHBOARD_URL", "WEB_PUBLIC_URL"].forEach((key, i) => {
      if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i];
    });
  }
});
