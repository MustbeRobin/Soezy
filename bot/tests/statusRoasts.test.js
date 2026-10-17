"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const discord = require("discord.js");
const { roastStatusMessage, formatStatusReply } = require("../utils/statusRoasts");

test("status roasts vary without losing original details", () => {
  for (const [type, title] of [["error", "Missing Permission"], ["success", "Saved"], ["success", "Enabled"], ["success", "Disabled"]]) {
    const detail = "Need Manage Messages. Use `,config`.\nChannel: <#123>";
    const first = roastStatusMessage(type, title, detail);
    const second = roastStatusMessage(type, title, detail);
    assert.notEqual(first, second);
    assert.ok(first.endsWith(detail));
    assert.ok(second.endsWith(detail));
  }
  assert.equal(roastStatusMessage("info", "Help", "Details"), "Details");
  assert.equal(roastStatusMessage("error", "Error", "x".repeat(3500)), "x".repeat(3500));
});

test("compact status containers preserve actionable details beside a quoted roast", () => {
  const source = fs.readFileSync(path.join(__dirname, "../utils/embedBuilders/errorEmbeds.js"), "utf8");
  const block = source.slice(source.indexOf("function buildReplyContainer("), source.indexOf("function createSuccessContainer("));
  const ctx = { ...discord, require: () => ({ roastStatusMessage, formatStatusReply }) };
  vm.createContext(ctx); vm.runInContext(block, ctx);
  for (const type of ["error", "success"]) {
    const result = ctx.buildReplyContainer(type, "Original Title", "Original message", [{ name: "Channel", value: "123" }], "https://example.com/image.png").toJSON();
    assert.equal(result.components.length, 1);
    assert.equal(result.components[0].type, discord.ComponentType.TextDisplay);
    assert.match(result.components[0].content, /^> <:(scross|tick):\d+> \*\*`[^`]+` Original message\*\*$/);
  }
  const disabled = ctx.buildReplyContainer("success", "Boost Disabled", "Now Boost messages are disabled.").toJSON();
  const enabled = ctx.buildReplyContainer("success", "Boost Enabled", "Now Boost messages are enabled.").toJSON();
  assert.match(disabled.components[0].content, /^> <:scross:1559257945030525110> /);
  assert.match(enabled.components[0].content, /^> <:tick:1559236522711187577> /);
});

test("enable and disable replies keep the state assurance in bold inline code", () => {
  const enabled = formatStatusReply("success", "Already Enabled", "Now Welcome setup is active.", "<:tick:1559236522711187577>");
  const disabled = formatStatusReply("success", "Already Disabled", "Now Welcome setup is inactive.", "<:scross:1559257945030525110>");
  assert.match(enabled, /^> <:tick:1559236522711187577> \*\*`[^`]+ It Will Stay On\. You're Welcome\.` Now Welcome setup is active\.\*\*$/);
  assert.match(disabled, /^> <:scross:1559257945030525110> \*\*`[^`]+ It Will Stay Off\. You're Welcome\.` Now Welcome setup is inactive\.\*\*$/);
});

test("hierarchy and permission roasts keep the precise error and command formatting", () => {
  const hierarchy = roastStatusMessage("error", "Hierarchy Blocked", "I cannot ban this user because their role is higher than mine.");
  assert.match(hierarchy, /role (ladder|hierarchy)/i);
  assert.ok(hierarchy.endsWith("I cannot ban this user because their role is higher than mine."));
  const detail = "You need **Manage Roles**.\nUse `,role list` to check roles.";
  const result = formatStatusReply("error", "Missing Permission", detail, "<:scross:1559257945030525110>");
  assert.match(result, /permission/i);
  assert.ok(result.includes("You need **Manage Roles**."));
  assert.ok(result.includes("Use `,role list` to check roles."));
  assert.ok(result.split("\n").every(line => line.includes("**")));
  assert.ok(result.split("\n").every(line => line.startsWith("> ")));
});
