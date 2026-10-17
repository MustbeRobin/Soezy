"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const help = read("utils/embedBuilders/helpEmbeds.js");
const owner = vm.runInNewContext(`(${help.slice(help.indexOf("  owner_only: {") + 14, help.indexOf("\n};", help.indexOf("  owner_only: {")))} )`, { featureEmoji: () => "" });

test("owner menu routes aliases and preserves node subcommands and arguments", () => {
  const ctx = { module: { exports: {} }, ALL_COMMANDS: { owner_only: owner }, console, setTimeout, clearTimeout,
    soezyOwnerManager: {}, setInterval: () => ({ unref() {} }) };
  vm.createContext(ctx);
  vm.runInContext(read("utils/commandManager.js"), ctx);
  const resolve = ctx.module.exports.resolveCommandInvocation;
  assert.equal(resolve("owner", []).commandName, "ownerhelp");
  for (const args of [["reconnect", "all"], ["switch", "Wispbyte"], ["restart"], ["players"]]) {
    assert.equal(JSON.stringify(resolve("node", args)), JSON.stringify({ commandName: "node", args }));
  }
});

test("missing diagnostic prefix handlers respond and reject non-owners", async () => {
  const source = read("events/messageCreate.js");
  const block = source.slice(source.indexOf("    /* ================= OWNER OPERATIONS"), source.indexOf("    /* ================= BLACKLIST (OWNER ONLY)"));
  for (const cmd of ["collectors", "cache", "ratelimits"]) {
    assert.ok(owner.commands.some(command => command.name === cmd));
    for (const allowed of [true, false]) {
      let reply;
      const ctx = { cmd, console: { log() {} }, isNoPrefixCommand: false,
        msg: { author: { id: "owner" }, reply: payload => { reply = payload; } },
        soezyOwnerManager: { isBotOwner: () => allowed }, soezyMusicRecovery: {},
        soezyCollectorRegistry: { sessions: new Map([["one", {}]]) },
        getSoezyMetricsSnapshot: () => ({ caches: { guilds: 2 }, rateLimits: { blocked: 3 } }),
        createSuccessContainer: (title, text) => ({ title, text }), createErrorContainer: title => ({ title }),
        MessageFlags: { IsComponentsV2: 32768 } };
      await vm.runInNewContext(`(async () => { ${block} })()`, ctx);
      assert.ok(reply);
      if (!allowed) assert.equal(reply.components[0].title, "Nope, Not You");
      else assert.match(reply.components[0].text, /tracked|guilds|blocked/);
    }
  }
});

test("bot team list commands are owner-only and persist all three Team stats lists", async () => {
  const source = read("events/messageCreate.js");
  const start = source.indexOf("    /* ================= BOT TEAM LISTS (OWNER ONLY) ================= */");
  const end = source.indexOf("    /* ================= SAVEDB COMMAND ================= */", start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);

  const cases = [
    ["dev", "devUsers", "Developer"],
    ["botadmin", "adminUsers", "Bot Admin"],
    ["botpartner", "partnerUsers", "Bot Partner"],
  ];
  for (const [cmd, key, label] of cases) {
    const id = "12345678901234567";
    const db = { [key]: [] };
    let saves = 0;
    let reply;
    const ctx = {
      cmd, args: ["add", `<@${id}>`], db, PREFIX: "!", MessageFlags: { IsComponentsV2: 32768 },
      msg: { author: { id: "99887766554433221" }, reply: payload => { reply = payload; } },
      soezyOwnerManager: { isBotOwner: () => true },
      resolveUser: async () => ({ id, username: "Member", bot: false }),
      client: { users: { fetch: async () => null } }, saveDB: () => saves++,
      createSuccessContainer: (title, text) => ({ title, text }),
      createErrorContainer: (title, text) => ({ title, text }),
    };
    await vm.runInNewContext(`(async () => { ${block} })()`, ctx);
    assert.deepEqual(Array.from(db[key]), [id], `${cmd} should update ${key}`);
    assert.equal(saves, 1, `${cmd} should persist its list`);
    assert.match(reply.components[0].title, new RegExp(label));

    ctx.args = ["list"];
    reply = null;
    await vm.runInNewContext(`(async () => { ${block} })()`, ctx);
    assert.match(reply.components[0].text, new RegExp(id));

    ctx.soezyOwnerManager.isBotOwner = () => false;
    reply = null;
    await vm.runInNewContext(`(async () => { ${block} })()`, ctx);
    assert.equal(reply.components[0].title, "Nope, Not You");
  }
});
