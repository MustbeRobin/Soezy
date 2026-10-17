# Lavalink authentication update

## Findings

- The AWS 401 and the local verifier's 401/403 are denied HTTP requests, not proof
  that the music server is offline. A successful server startup does not verify
  the client's password. The effective server secret cannot be inspected remotely.
- Local .env contains a nonempty LAVALINK_PASSWORD, with no duplicate entry,
  surrounding whitespace, literal quotes, or newline. Initial local verification
  failed even without an inherited environment override.
- Startup already loaded dotenv before the music module. However, ordinary dotenv
  loading preserves existing process variables, so a stale PM2 password could
  override a corrected .env. This is a separate configuration risk, not a proven
  explanation for the AWS instance without inspecting that runtime.
- config.json already has the correct non-secret lavalink object. The PM2
  ecosystem config has no Lavalink secret override. There is one shared Shoukaku
  manager, not a second Lavalink implementation.

## Changes

The existing utils/lavalinkConfig.js now loads only LAVALINK_PASSWORD from the
project-root .env with explicit precedence over inherited values. Other secrets,
including Redis and Discord settings, are not overridden. If the file/key is
absent, an explicitly injected process environment password remains supported.
An explicitly empty .env password does not fall back to a stale inherited value.

Both startup and deployment/lavalink-check.js use this loader. The latter reports
only a loaded boolean, source, non-secret endpoint, and safe failure category.
Whitespace, accidental literal quotes, invalid ports and invalid secure values
are reported without displaying credentials. Existing reconnect behavior is
preserved; its error messages and node-health errors use credential redaction.

Non-secret configuration is read from config.json.lavalink before legacy
LAVALINK_HOST/PORT/NAME/SECURE environment fallbacks. No password is read from
config.json or LAVALINK_SERVER_PASSWORD on the bot. Initialization refreshes the
existing runtime node list from this same helper instead of using stale auth.

## Upload to AWS

Files changed for this authentication fix:

- utils/lavalinkConfig.js
- handlers/index.js
- config/bootstrap.js
- commands/music/music.js
- utils/musicManager.js
- utils/runtimeManager.js
- deployment/lavalink-check.js
- .env.example
- tests/lavalinkConfig.test.js
- tests/lavalinkCheck.test.js
- tests/musicRecovery.test.js
- tests/lavalinkStartup.test.js (new)
- deployment/LAVALINK_AUTH.md (new)

package.json is included so the existing lavalink:verify script is available;
its dependencies were not changed. config.json and ecosystem.config.js were
inspected and required no additional edit for this authentication fix.

Extract soezy-lavalink-auth-update.zip into /home/ubuntu/Soezy, preserving paths.
It includes only the updated code, tests, example env and this guide. It does not
include database.json, the live .env, config.json, Redis files, or Lavalink server
files. No dependency installation is required.

Keep every other existing config.json field. Ensure it contains this section:

```json
"lavalink": {
  "host": "78.154.103.22",
  "port": 12174,
  "name": "Wispbyte",
  "secure": false
}
```

Remove an obsolete top-level lavalinkNodes configuration if present; runtime
nodes are built centrally. Keep the password only as LAVALINK_PASSWORD in the
AWS project's .env. Do not replace your whole .env or reveal its contents.

## Verify and restart

Run this on AWS first:

```sh
cd /home/ubuntu/Soezy
npm run lavalink:verify
```

Only after it reports "Connected and authenticated", restart the single PM2 bot:

```sh
pm2 startOrRestart ecosystem.config.js --only Soezy --update-env
pm2 logs Soezy --lines 40 --nostream
```

Use --update-env so PM2 refreshes its environment. The project .env loader also
protects Lavalink authentication from a retained old password. Do not run npm
start alongside PM2, do not delete PM2 state, and do not rerun Redis migration.

## If 401/403 remains

Confirm privately which password the running WispByte process actually uses,
including any panel environment override or startup argument. The intended value
in an edited file may differ from the value loaded by the running process. Set
the bot's .env to that effective secret and rerun verification. No WispByte file,
IP, port, Java version, plugin, or Lavalink version was changed by this auth fix.
A 403 can also come from an access-control layer, so inspect the server console
or ask WispByte support if the effective secret is confirmed to match.

Do not paste secrets or unrestricted `pm2 env` output into chat. Because the old
secret was exposed during troubleshooting, rotate it privately on both hosts
when ready, then rerun the verifier and restart the bot. HTTP success still needs
a separate Discord voice playback test.

References:
- https://github.com/motdotla/dotenv#what-happens-to-environment-variables-that-were-already-set
- https://pm2.keymetrics.io/docs/usage/process-management/#updating-environment-variables-and-options
- https://lavalink.dev/api/rest
