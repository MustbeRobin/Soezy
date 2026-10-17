"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

test("moderation builders load with the root-relative runtime require", () => {
  const root = path.resolve(__dirname, "..");
  const source = fs.readFileSync(path.join(root, "utils/embedBuilders/moderationEmbeds.js"), "utf8");
  const context = vm.createContext({ require: createRequire(path.join(root, "index.js")) });
  vm.runInContext(source.slice(0, source.indexOf("\n")), context);
  assert.equal(vm.runInContext("typeof gatherFeatureRoleIds", context), "function");
});
