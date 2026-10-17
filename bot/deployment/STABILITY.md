# Soezy stability changes and production verification

**Update 2026-09-29:** At the user's request, the web and Lavalink server files
were moved to `C:\bot web`. Bot startup and PM2 now run the bot only. The embedded
dashboard topology described below is historical; do not use those web deployment
instructions for this separated layout. See `C:\bot web\README.md`.

Changes were made to the Windows copy at `C:\Soezy`. The Ubuntu host at
`/home/ubuntu/Soezy` was not connected, so production disk usage, PM2 state,
kernel OOM history, live Discord actions, and long-running memory behavior
remain unverified. No production logs or data were deleted.

## Root causes confirmed in source

- The client listener guard replaced callbacks without retaining their original
  identity. Discord.js member fetches remove `raw` and `guildMembersChunk`
  callbacks by the original function and reduce their listener allowance. The
  removals therefore failed, leaving closures and member collections reachable.
  The guard now preserves removal identity and correct `once` behavior.
- `saveDB()` rebuilt every guild's security/config/blacklist caches on every
  update, and the old flush path repeated that work. Saves now synchronize only
  touched guild feature stores. Explicit per-guild refresh and full reload still
  work. A duplicate feature refresh was removed. Blacklist checks observe legacy
  direct mutations without rebuilding other guilds.
- Spam and anti-nuke trackers generate hyphen-separated keys. Their cleanup
  timers split only on colons and passed the whole compound key to `guildData`.
  Cleanup now recognizes both separators.
- Prefix/slash moderation collectors and the global interaction router both
  received the same clicks; the router reached its unhandled fallback while a
  collector tried to acknowledge. Both command paths now use one bounded
  confirmation registry and an early router handler, with no per-panel collector.
- Database persistence had independent direct-write paths in trial cleanup,
  fallback saves, shutdown, and the dashboard. Direct writes could truncate the
  file during ENOSPC and race atomic replacement. Bot saves, shutdown and the
  embedded dashboard now use the same serialized pipeline.
- The PM2 config ran the web dashboard separately while both processes wrote
  the database. The revised definition runs one Soezy process using the existing
  embedded dashboard mode. The old separate process must be removed on deploy.
- API requests and spoiler attachment storage were unbounded; spoiler expiry
  happened only when someone clicked an expired panel. Requests now have a
  1,000-job admission limit. Spoilers expire during periodic cleanup, have a
  32 MB memory budget and 1,000-entry limit, and allow at most four concurrent
  attachment downloads of up to 5 MB with a 15-second timeout.
- Security window maps, recent bans, config panel metadata, idle API route
  metadata and rejected promises had incomplete retention controls. Cleanup now
  expires these records; rejected promises are weakly referenced. Existing
  ManagedMap/TTL caches and collector cleanup were retained. Guild departure
  clears transient security/config/blacklist/confirmation state.

The listener leak is a demonstrated memory retention bug, but its exact share
of the reported 932 MB heap cannot be quantified without a production heap
profile. PM2 pidusage errors may follow a process disappearing; no production
evidence was available to attribute individual SIGKILL/SIGABRT/SIGHUP events.

## Database protection and schema

Backup: `logs/db-backups/database-pre-stability-20260928-002024.json`.
The original database and this backup have identical SHA-256 hashes after the
changes. All 102 local guild keys are valid snowflake strings. No user records
were migrated or deleted. The old startup pruning code now preserves unknown
legacy buckets and excludes them from guild enumeration for later inspection.

The writer retains one pending latest-state supplier, serializes writes,
fsyncs a temporary file before atomic rename, cleans failed temporary writes,
and backs off from 10 seconds to at most five minutes. Incoming saves cannot
restart the backoff or postpone a scheduled write indefinitely. Identical errors
are rate-limited. Sparse recovery probes resume persistence after storage frees.
Backups are bounded to five automatically named snapshots; manual/pre-migration
backups are excluded from rotation. Backup failure cannot block a successful
primary database save. Startup refuses to overwrite an unreadable/invalid
database when no valid backup exists. Shutdown waits for the current writer,
attempts the latest snapshot, and reports failure honestly.

No program can persist memory-only changes to a full filesystem. If the process
is killed before space is recovered, those pending changes can be lost; the last
complete on-disk database remains intact. SIGKILL cannot run shutdown handlers.

## Moderation confirmation behavior

Confirm/cancel IDs use a dynamic nonce. The handler checks the initiating user,
guild and original message, claims each action once, acknowledges the click,
fetches current membership/permissions and rechecks relevant target hierarchy.
Permission loss, acknowledgement failure, cancellation, timeout, server removal,
replayed clicks and pre-restart IDs resolve without executing the action.
Panels expire after five minutes; at most 200 confirmations are retained.

## Logging and operational deployment

Unbounded PM2 stdout/stderr and repeated cache/error logs are confirmed disk
growth risks. They do not prove which files filled the Ubuntu filesystem.
Locally there was about 11.2 GB free before dependency installation; local logs
were modest. The production space consumer must be measured first:

```bash
cd /home/ubuntu/Soezy
bash deployment/inspect-resources.sh
```

The script is read-only and checks disk bytes/inodes, directory sizes, large
logs/temp/core/Lavalink files, PM2 status/logs, and available kernel OOM messages.
Review its output before deciding which old files can be archived or removed.
Do not delete `database.json` or the pre-stability backup.

Audit logs rotate automatically at 5 MB with three retained generations, a
bounded append backlog and storage-error backoff. PM2 owns stdout/stderr files,
so install the supplied OS rotation policy on Ubuntu:

```bash
sudo install -m 0644 deployment/soezy.logrotate /etc/logrotate-soezy.conf
sudo install -m 0644 deployment/soezy-logrotate.service /etc/systemd/system/soezy-logrotate.service
sudo install -m 0644 deployment/soezy-logrotate.timer /etc/systemd/system/soezy-logrotate.timer
sudo logrotate --debug /etc/logrotate-soezy.conf
sudo systemctl daemon-reload
sudo systemctl enable --now soezy-logrotate.timer
```

Policy: check every five minutes, rotate at 10 MB or daily, retain five
generations, compress older generations. Size may exceed 10 MB between checks;
copytruncate has a small copy/truncate race. Do not run another rotation policy
against the same files. Existing oversized logs need sufficient free space for
rotation, so first inspect and deliberately archive approved old files.

After copying reviewed source changes and freeing sufficient disk space:

```bash
cd /home/ubuntu/Soezy
npm ci
node --test tests/stability.test.js
npm run check
npm run validate
pm2 list
# Only if the legacy Soezy-Web application is listed:
pm2 delete Soezy-Web
pm2 startOrRestart ecosystem.config.js --only Soezy --update-env
pm2 list
pm2 logs Soezy --lines 200 --nostream
```

Do not start `web/server.js` as another process against this same database.
The embedded dashboard shares the active client and database writer. The
700 MB PM2 restart guard is retained; heap limits/listener limits were not raised.
PM2 now allows 15 seconds for shutdown and backs off repeated failed starts.
Only persist the new PM2 process list after verifying the running configuration.

Check login/reconnect, actual confirm/cancel/expired panels, dashboard changes,
blacklist enforcement, database validity and one running Soezy instance. Watch
metrics through typical traffic and reconnects: RSS, heap used/total, external
memory, buffers, guilds, cache sizes, pending confirmations, DB retry state and
raw/chunk listener counts. Listener counts can rise during active member fetches
but should return to baseline when requests finish. A long-running soak and real
disk-pressure recovery check are still required on the production host.

## Verification performed locally

- Regression suite covers actual Discord.js member-fetch cleanup, 10,000
  listener add/remove cycles, once/idempotent registration, 10,000 coalesced saves
  during injected ENOSPC, newest-state recovery, serialization/shutdown,
  atomic rename failure, real filesystem writes, protected backup rotation,
  real audit rotation, confirmation authorization/duplicates/cancel/timeout/
  permission loss/acknowledgement failure, legacy tracker keys, incremental
  guild saves, direct blacklist updates, API bounds, spoiler bounds, and PM2 topology.
- `npm run check` and syntax checks of all 61 VM runtime files pass.
- `npm run validate`: 198 registry commands, zero failed imports, zero missing
  exports, zero duplicate names. This is not a live test of all prefix aliases.
- Local `pm2 list` is empty. No bot login or live moderation action was performed.
- Dependencies were installed with `npm ci --ignore-scripts`; npm warned that
  passport-discord is deprecated. Upgrading authentication is separate work.

## Files changed

Persistence: `utils/dbWriteQueue.js`, `utils/database.js`,
`handlers/saveHandler.js`, `handlers/index.js`, `web/dashboard.js`.

Lifecycle/caches: `utils/runtimeManager.js`, `utils/configManager.js`,
`utils/blacklistManager.js`, `utils/featureStateManager.js`, `utils/cacheManager.js`,
`utils/apiQueue.js`, `utils/crashRecovery.js`, `utils/spoilerSessions.js`,
`handlers/security.js`, `handlers/feature-events.js`.

Interactions/runtime keys: `events/messageCreate.js`, `events/interactionCreate.js`,
`utils/embedBuilders/dashboardEmbeds.js`.

Diagnostics/logging: `utils/metrics.js`, `utils/boundedLog.js`,
`utils/securityPolicy.js`, `ecosystem.config.js`, and the new files in `deployment/`.

Regression coverage: `tests/stability.test.js`.
