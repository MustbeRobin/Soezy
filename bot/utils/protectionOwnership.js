"use strict";

// An enabled AutoMod owns overlapping message rules, including disabled filters
// and bypasses. Security must not re-enforce a rule AutoMod chose to skip.
function automodOwnsMessageFilters(guildData) {
  return guildData?.automod?.enabled === true;
}

module.exports = { automodOwnsMessageFilters };
