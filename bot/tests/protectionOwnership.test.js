const test = require("node:test");
const assert = require("node:assert/strict");
const { automodOwnsMessageFilters } = require("../utils/protectionOwnership");

test("AutoMod remains the owner when an individual filter is disabled", () => {
  assert.equal(automodOwnsMessageFilters({ automod: { enabled: true, antiCaps: { enabled: false } } }), true);
});

test("legacy Security protection remains available without AutoMod", () => {
  for (const data of [undefined, {}, { automod: {} }, { automod: { enabled: false } }]) {
    assert.equal(automodOwnsMessageFilters(data), false);
  }
});
