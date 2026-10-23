"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = file => fs.readFileSync(path.join(__dirname, "../events", file), "utf8");

test("AutoMod toggle replies match AntiNuke and wait for configuration", async () => {
  const source = read("messageCreate.js");
  const start = source.indexOf('        if (subCmd === "enable" || subCmd === "disable")', source.indexOf('if (cmd === "automod" ||'));
  const block = source.slice(start, source.indexOf('        return msg.reply({ components: [createInfoContainer("Use AutoMod Config"', start));
  for (const subCmd of ["enable", "disable"]) {
    for (const fail of [false, true]) {
      const calls = [];
      const result = await vm.runInNewContext(`(async () => { ${block} })()`, {
        subCmd, msg: { guild: {}, reply: async payload => { calls.push("reply"); return payload; } },
        configureAutomodSystem: async (_guild, enabled) => { calls.push(enabled); if (fail) throw new Error("Setup failed"); },
        createSuccessContainer: (title, description) => ({ title, description, type: "success" }),
        createErrorContainer: (title, description) => ({ title, description, type: "error" }),
        MessageFlags: { IsComponentsV2: 32768 }
      });
      assert.deepEqual(calls, [subCmd === "enable", "reply"]);
      assert.equal(result.components[0].type, fail ? "error" : "success");
      assert.equal(result.flags, 32768);
      if (!fail) assert.equal(result.components[0].title, `AutoMod ${subCmd === "enable" ? "Enabled" : "Disabled"}`);
    }
  }
});

for (const file of ["messageCreate.js", "interactionCreate.js"]) {
  for (const feature of ["antinuke", "automod"]) {
    test(`${file}: disabled ${feature} config returns an error without opening a panel`, async () => {
      const source = read(file);
      const pattern = new RegExp(`const config = guildData\\((?:guildId|gId)\\)\\.${feature} \\|\\| \\{\\};[\\s\\S]*?\\n\\s*\\}`);
      const block = source.match(pattern)?.[0];
      assert.ok(block);
      for (const config of [{}, { enabled: false }, { enabled: true, systemEnabled: false }, { enabled: true }, { systemEnabled: true, enabled: false }]) {
        let reply;
        const respond = async payload => { reply = payload; };
        await vm.runInNewContext(`(async () => { ${block} })()`, {
          guildId: "guild", gId: "guild", PREFIX: ",",
          guildData: () => ({ [feature]: config, prefix: "!" }),
          msg: { reply: respond }, interaction: { reply: respond },
          MessageFlags: { IsComponentsV2: 32768 },
          createErrorContainer: (title, description) => ({ title, description })
        });
        const disabled = (config.systemEnabled ?? config.enabled) !== true;
        assert.equal(Boolean(reply), disabled);
        if (disabled) {
          assert.match(reply.components[0].description, /Please enable this feature first/);
          assert.match(reply.components[0].description, new RegExp(`${feature} enable`));
        }
      }
    });
  }
}

for (const file of ["messageCreate.js", "interactionCreate.js"]) {
  test(`${file}: disabled Wall config asks to enable Wall before opening the panel`, () => {
    const source = read(file);
    const handlerStart = source.indexOf(file === "messageCreate.js" ? 'if (cmd === "wall")' : 'if (commandName === "wall")');
    assert.notEqual(handlerStart, -1);
    const panelCall = source.indexOf("buildWallConfigContainer", handlerStart);
    const guard = source.indexOf('createErrorContainer("Wall Disabled"', handlerStart);
    assert.notEqual(panelCall, -1);
    assert.notEqual(guard, -1);
    assert.ok(guard < panelCall, "the disabled guard must run before the config panel is built");
    const wallConfig = source.slice(handlerStart, panelCall);
    assert.match(wallConfig, /wallConfig\.systemEnabled\s*\?\?\s*wallConfig\.enabled/);
    assert.match(wallConfig, /wall enable/);
  });
}
