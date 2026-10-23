"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../events/messageCreate.js"), "utf8");

for (const [name, marker, endMarker, setup] of [
  ["AutoMod", "/* ================= AUTOMOD COMMANDS", 'return msg.reply({ components: [createInfoContainer("Use AutoMod Config"', "configureAutomodSystem"],
  ["Wall", "/* ================= WALL SYSTEM COMMANDS", "// ── !wall quarantine", "configureWallSystem"],
]) {
  const section = source.slice(source.indexOf(marker));
  const start = section.indexOf('if (subCmd === "enable" || subCmd === "disable")');
  const end = section.indexOf(endMarker, start);
  const handler = section.slice(start, end);
  test(`${name} commands return confirmations and report setup failures`, async () => {
    const calls = [];
    const context = vm.createContext({
      msg: { guild: {}, author: {}, reply: async payload => payload },
      MessageFlags: { IsComponentsV2: 32768 },
      [setup]: async (_guild, enabled) => { calls.push(enabled); if (context.fail) throw new Error("setup failed"); },
      createSuccessContainer: (title, description) => ({ type: "success", title, description }),
      createErrorContainer: (title, description) => ({ type: "error", title, description }),
    });
    for (const action of ["disable", "enable"]) {
      context.subCmd = action;
      const payload = await vm.runInContext(`(async () => { ${handler} })()`, context);
      assert.equal(payload.components[0].type, "success");
      assert.equal(payload.components[0].title, `${name} ${action === "enable" ? "Enabled" : "Disabled"}`);
      assert.equal(payload.flags, 32768);
    }
    context.fail = true;
    const payload = await vm.runInContext(`(async () => { ${handler} })()`, context);
    assert.equal(payload.components[0].type, "error");
    assert.deepEqual(calls, [false, true, true]);
  });
}
