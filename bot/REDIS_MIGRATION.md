# Soezy Redis Migration

## Status and safety

Prepared on 2026-10-01. The WispByte Redis server is currently stopped, so live authentication, persistence settings, restart and Discord-command verification are pending. Offline adapter tests use an injected Redis test double, not a production server.

The original `database.json` is not rewritten, removed or truncated. Baseline SHA-256:

`9df352721b0a07dced127d9e882e1fc110175d8a15a367659917e4b3490e7c44`

Baseline contains 26 root sections, 103 guild records, and 4 global user records. Guild-specific user/economy/XP data remains nested inside guild records. Every root section and unknown field is retained.

Manual verified backup: `logs/db-backups/database-pre-redis-20261001-210216.json`. First migration also creates a content-addressed, byte-verified `database-pre-redis-<sha256>.json` backup. Existing JSON recovery/write utilities remain in the repository, but normal startup selects Redis and never silently falls back to JSON writes.

## Deployment

1. Upload the changed files listed below, including `package.json` and `package-lock.json`. Retain the existing `database.json` on the destination.
2. Run `npm ci` on the host. The pinned dependency is `redis@5.12.1` (node-redis).
3. Configure `.env` using `.env.example`. Set the actual Redis password privately. The supplied password has not been authenticated because the server is offline.
4. Start Redis, then run `npm run redis:verify`.
5. Stop other Soezy instances and run `npm run redis:migrate`. This is optional: normal startup performs the same check and migration.
6. Run `npm start` or start the existing PM2 ecosystem. Only one database writer may run against a namespace.
7. Test prefix/slash commands and export a backup after verifying the migrated data.

The non-secret Redis endpoint, port, database, namespace and TLS flag are read from the `redis` object in `config.json`. Credentials come exclusively from environment variables (`REDIS_PASSWORD`; optional `REDIS_USERNAME`). The Redis TLS flag enables TLS only when the provider supports it; plain Redis does not encrypt network traffic. Enable Redis server persistence (AOF/RDB), durable storage, suitable authentication/firewall rules, and a non-evicting database policy. The bot does not change server configuration.

## Schema and compatibility

`soezy:db:v1:data` is a Redis hash. `@root` describes the original root sections. JSON-encoded path fields such as `["guilds","123..."]` and `["users","456..."]` contain individual JSON records. Scalar/array root sections use `["section"]`. `_schema`, `_migration`, `_revision`, and `_commit` hold migration/version metadata.

The migration builds a private staging hash, publishes it only after the import completes, and verifies a full structural round trip. A new namespace imports JSON once. Existing valid Redis data wins; incomplete or unsupported data causes startup to wait for operator correction, not overwrite it. Unrelated Redis keys are never flushed or cleared. A failed staged import expires after an hour unless failure occurred after its persistence step; any remaining staging key is not used as live data.

The existing `db`, `db.guilds`, `db.users`, `guildData()`, `saveDB()`, `_flushDB()` and `client._saveDatabase()` remain the compatibility API. Music saves and `savedb` use this shared persistence path. No command-by-command conversion to asynchronous Redis reads was made.

Changes are compared per record using hashes. Only changed records are written. An expiring writer lease prevents concurrent bot writers; revision checks prevent stale writes. Commit IDs safely retry a lost reply without replaying the same revision. Record updates and revision metadata are published together; removed records are then cleaned from the hash.

## Outages and backup

Startup waits for a verified Redis database before Discord login. Runtime disconnection does not terminate the bot: the existing write queue retains one pending latest-state request with bounded retries. Redis's own offline command queue is disabled. Reconnection wakes the shared writer.

On graceful shutdown when Redis cannot flush, the bot attempts a single `logs/db-backups/redis-pending.json` recovery snapshot. On restart it applies only if the Redis revision still matches, or matches the acknowledged commit ID; otherwise it refuses to overwrite newer data. Applied snapshots are retained as `.applied-*` files. Review/archive these occasional recovery snapshots manually. Disk-full errors or a forced process kill before a successful flush/checkpoint can still lose unpersisted changes.

Export without overwriting the original or an existing backup:

```powershell
npm run redis:export
npm run redis:export -- C:\Backups\database-backup.json
```

The default export is a timestamped JSON file under `logs/db-backups`. Export reads Redis directly and includes all sections. No `FLUSHDB`, `FLUSHALL`, or automatic overwrite of `database.json` is used.

## Memory, keys and listeners

- One shared in-memory database object is retained because existing synchronous commands require it. This is not a fully lazy Redis-backed object graph; memory still grows with actual stored data.
- No second full persistent Redis cache is introduced. Record digests, one in-flight batch and one pending save replace repeated full-file snapshots; unchanged saves send no data updates.
- Dirty-state metadata clears after a successful write. Redis command queues are bounded, and no routine JSON temp files are created in Redis mode.
- The reported `guild-user` keys belong to Anti-Nuke/spam runtime maps. Their cleanup already splits both `:` and `-` before calling `guildData()`. Current JSON has no invalid guild keys. Intentional composite keys are preserved verbatim, never split or deleted by migration.
- Existing listener-wrapper identity fixes allow Discord.js to remove temporary `raw`/`guildMembersChunk` listeners. A new bulk-member fetch scheduler coalesces identical full-guild requests, permits four concurrent bulk fetches, and bounds/ages queued requests. Single-user REST fetches are unchanged. No listener limit is increased.

## Changed files

Created:
- `utils/redis.js`
- `utils/redisDatabase.js`
- `utils/memberFetchScheduler.js`
- `deployment/redis-database.js`
- `tests/redisDatabase.test.js`
- `REDIS_MIGRATION.md`

Modified:
- `.env`, `.env.example`
- `package.json`, `package-lock.json`
- `handlers/index.js`, `handlers/saveHandler.js`
- `utils/database.js`, `utils/dbWriteQueue.js`, `utils/dbBatcher.js`
- `utils/scalableCache.js`, `utils/runtimeManager.js`
- `commands/music/music.js`, `events/messageCreate.js`, `events/ready.js`

## Verification scope

All 85 automated tests passed. Checks cover all-section migration, original-byte preservation, existing Redis data priority, revisions/writer locks, sparse writes/deletes, offline retries, lost replies, restart recovery, export protection, singleton client use, bounded save bursts and member-fetch concurrency. Existing tests cover Anti-Nuke/security, AutoMod, whitelist/immunity, prefixes, help, giveaways, logging, and listener cleanup. All 198 command modules validate and 68 runtime/adapter/script files pass syntax checks.

Live Redis authentication, Redis server durability settings, live prefix/slash/economy/XP/moderation commands and long-duration memory behavior must be checked after the server starts. An existing high-severity npm audit finding in `sharp` is unrelated to this migration and was not force-upgraded.
