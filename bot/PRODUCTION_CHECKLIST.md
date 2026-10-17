# Soezy Production Publish Checklist

## Discord Verification Readiness
- Keep slash commands limited to AFK, moderation, config, and utility.
- Keep `SOEZY_PROFESSIONAL_UI` enabled for professional public-bot replies.
- Verify cooldowns, guild rate limits, duplicate interaction suppression, and collector expiry.
- Publish and link a privacy policy, terms page, and support server invite.
- Confirm bot permissions are requested only for features that need them.

## Pre-Publish Tests
- `npm run check`
- `npm run validate` after installing dependencies.
- `node --test tests/webBridge.test.js tests/stability.test.js` for the unified bot/web bridge.
- Restart recovery with active giveaways, panels, cooldowns, and database writes.
- Shard reconnect and Discord REST rate-limit behavior.
- Database corruption recovery from `logs/db-backups`.
- Memory growth over a long idle period and a busy interaction period.

## Unified Bot and Website
- Keep the website under `web/` in the same release as the bot.
- PM2 starts one `Soezy` process; `SOEZY_START_WEB=true` starts `web/server.js` inside the bot process so dashboard reads/writes use the live Discord client and Redis-backed database.
- Set `WEB_PORT` (default `4754`), `PUBLIC_URL`, and `DISCORD_REDIRECT_URI` for the deployed host. Point the reverse proxy at `127.0.0.1:4754`; the supplied Nginx example is `web/deployment/nginx/soezy-unified.conf`.
- Verify `/api/health`, Discord OAuth callback, and dashboard config writes after deployment. A successful local check does not confirm public DNS, firewall, TLS, or Discord Developer Portal settings.

## Cleanup Before Release
- Remove temporary debug logs.
- Confirm duplicate listener guards report zero unexpected skips.
- Confirm stale slash commands were deleted once, then hash sync skips later restarts.
- Confirm owner debug commands are not registered unless owner slash publishing is enabled.
