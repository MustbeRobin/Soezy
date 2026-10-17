"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../events/messageCreate.js"), "utf8");
const commands = source.slice(source.indexOf("/* ================= ANTINUKE COMMANDS"));
const start = commands.indexOf('if (subCmd === "enable" || subCmd === "disable")');
const end = commands.indexOf('if (subCmd === "whitelist"', start);
const handler = commands.slice(start, end);

function harness(fail = false) {
  const calls = [];
  const context = vm.createContext({
    msg: { guild: { id: "guild" }, reply: async payload => { calls.push("reply"); return payload; } },
    client: {},
    MessageFlags: { IsComponentsV2: 32768 },
    soezyAntiNukePanel: {
      configure: async (_guild, enabled) => {
        calls.push(enabled);
        if (fail) throw new Error("Missing permissions");
      },
      build: () => { throw new Error("Toggle commands must not open config"); },
    },
    createSuccessContainer: (title, description) => ({ type: "success", title, description }),
    createErrorContainer: (title, description) => ({ type: "error", title, description }),
  });
  return { calls, run: subCmd => {
    context.subCmd = subCmd;
    return vm.runInContext(`(async () => { ${handler} })()`, context);
  } };
}

test("AntiNuke disable then enable replies with status containers after configuration", async () => {
  const { run, calls } = harness();
  for (const action of ["disable", "enable", "disable"]) {
    const payload = await run(action);
    assert.equal(payload.components[0].type, "success");
    assert.equal(payload.components[0].title, `Anti-Nuke ${action === "enable" ? "Enabled" : "Disabled"}`);
    assert.match(payload.components[0].description, new RegExp(`\\*\\*${action}d\\*\\*`));
    assert.equal(payload.flags, 32768);
  }
  assert.deepEqual(calls, [false, "reply", true, "reply", false, "reply"]);
});

test("AntiNuke configuration failure never reports a successful toggle", async () => {
  for (const action of ["enable", "disable"]) {
    const payload = await harness(true).run(action);
    assert.equal(payload.components[0].type, "error");
    assert.equal(payload.components[0].description, "Missing permissions");
  }
});
