"use strict";

function isNativeFilterInstalled(guildData, key) {
  const ruleIds = guildData?.nativeAutomod?.ruleIds || {};
  return String(key || "").split("+").some(name => Boolean(
    ruleIds[`filter_${name}`] || (name === "mentions" && ruleIds.filter_filtermentions)
  ));
}

module.exports = { isNativeFilterInstalled };
