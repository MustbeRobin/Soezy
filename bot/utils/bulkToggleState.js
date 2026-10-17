/*
 * Shared Enable/Disable button state for master-switch panels (AntiNuke, AutoMod).
 *
 * `masterEnabled` is the saved master status. `featureStates` is one boolean per
 * feature the bulk buttons control. While the master switch is off every feature
 * counts as off, so a stale saved flag can never keep Disable clickable.
 *
 *   allEnabled  -> master on and every feature on  -> disable the Enable button
 *   allDisabled -> no feature effectively on       -> disable the Disable button
 *   otherwise   -> partial state                   -> both buttons stay active
 */
function getBulkToggleState(masterEnabled, featureStates) {
  const states = Array.from(featureStates || [], Boolean).map(value => Boolean(masterEnabled) && value);
  const enabledCount = states.filter(Boolean).length;
  return {
    total: states.length,
    enabledCount,
    allEnabled: states.length > 0 && enabledCount === states.length,
    allDisabled: enabledCount === 0,
  };
}
