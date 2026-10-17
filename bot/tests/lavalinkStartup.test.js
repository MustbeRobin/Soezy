"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { EventEmitter } = require("node:events");

test("Shoukaku initialization uses canonical credentials and remains a single shared manager", () => {
  const source = fs.readFileSync(path.join(__dirname, "../commands/music/music.js"), "utf8");
  const init = source.slice(source.indexOf("function initShoukaku(client)"), source.indexOf("function getShoukaku()"));
  let instances = 0;
  const nodes = [{ name: "Wispbyte", url: "78.154.103.22:12174", auth: "current-fixture", secure: false }];
  const sandbox = {
    shoukaku: null,
    Shoukaku: class extends EventEmitter {
      constructor(connector, suppliedNodes, options) {
        super(); instances++; assert.equal(suppliedNodes, nodes);
        assert.equal(options.resume, true);
        assert.equal(options.resumeByLibrary, true);
        assert.equal(options.resumeTimeout, 120);
        assert.equal(options.restTimeout, 10);
        assert.equal("resumable" in options, false);
      }
    },
    ShoukakuConnectors: { DiscordJS: class {} },
    getLavalinkConfiguration: () => ({ nodes, error: null }),
    getMusicRecovery: () => ({ installAutomaticRecovery() {} }),
    console: { log() {}, warn() {}, error() {} },
    module: { exports: {} },
    redactLavalinkError: () => "[REDACTED]",
  };
  vm.runInNewContext(init + "\nmodule.exports = initShoukaku;", sandbox);
  const firstClient = { _config: { lavalinkNodes: [{ auth: "stale-fixture" }] } };
  const first = sandbox.module.exports(firstClient);
  const secondClient = {};
  assert.equal(sandbox.module.exports(firstClient), first);
  assert.equal(sandbox.module.exports(secondClient), first);
  assert.equal(instances, 1);
  assert.equal(firstClient._config.lavalinkNodes, nodes);
  assert.equal(secondClient._shoukaku, first);
  assert.equal(first.listenerCount("error"), 1);
  assert.equal(first.listenerCount("ready"), 1);
});

test("startup loads project Lavalink environment before database/client initialization", () => {
  const source = fs.readFileSync(path.join(__dirname, "../handlers/index.js"), "utf8");
  assert.ok(source.indexOf("logLavalinkEnvironment(loadLavalinkEnvironment())") < source.indexOf("async function start()"));
  const ecosystem = require("../ecosystem.config");
  const app = ecosystem.apps.find(item => item.name === "Soezy");
  assert.equal(app.instances, 1);
  assert.equal(Object.keys(app.env).some(key => key.startsWith("LAVALINK_")), false);
});
