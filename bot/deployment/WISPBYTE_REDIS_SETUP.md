# AWS bot + WispByte Redis

The Soezy bot runs on AWS. Only the Redis server runs on WispByte.
Do not upload redis.js, the bot folder, or database.json to WispByte.

## WispByte

1. Open the Redis server in your WispByte panel and stop it before editing startup settings.
2. In Startup / server variables, set the existing SERVER_PASSWORD (Server Password) to the same value as REDIS_PASSWORD in the AWS bot's .env. Keep the allocated SERVER_PORT (currently 11313) and SERVER_MEMORY values. The console screenshot confirms this WispByte template uses SERVER_PASSWORD, not REDIS_PASSWORD. Do not put the password in source files.
3. Keep the existing /home/container/redis.conf. Replace the old startup command with:

```sh
test "${SERVER_MEMORY:?Missing SERVER_MEMORY}" -gt 1 && exec /usr/local/bin/redis-server /home/container/redis.conf --bind 0.0.0.0 --port "${SERVER_PORT:?Missing SERVER_PORT}" --protected-mode yes --requirepass "${SERVER_PASSWORD:?Set SERVER_PASSWORD}" --dir /home/container --daemonize no --logfile "" --appendonly yes --appendfsync everysec --save 60 1 --maxmemory "$((SERVER_MEMORY / 2))mb" --maxmemory-policy noeviction
```

4. Save the command and start the server. The console should report that Redis is ready to accept connections. It must remain running.
5. Keep /home/container persistent. Never delete dump.rdb, appendonlydir, or other Redis persistence files. This setup enables AOF for the new, not-yet-migrated instance; if the server already contains important Redis data, back it up and follow Redis's existing-data AOF conversion instructions before changing persistence settings.

This command caps Redis data memory at half of the panel's numeric SERVER_MEMORY allocation in MB, leaving room for overhead and persistence. It refuses to start if that value is missing, nonnumeric, or less than 2. This is a starting limit, not a guarantee against memory exhaustion; monitor actual memory use.

Restrict port 11313 to your AWS server's public IP. Password authentication does not encrypt traffic: arrange TLS or an encrypted tunnel for the connection between providers. REDIS_TLS=true in the bot is valid only after a TLS endpoint is configured; it cannot add TLS to a plain Redis port.

If the panel does not expose Server Password, ask WispByte support where to change SERVER_PASSWORD for the Redis template. The command intentionally fails when the password or port is missing or empty.

The console's vm.overcommit_memory warning is separate from the startup command. Ask WispByte support to enable vm.overcommit_memory=1 on the host node. It is a host-level setting, not a line for redis.conf, and cannot normally be changed from an unprivileged container. Without it, Redis background persistence can fail under memory pressure. The warning alone does not confirm either startup failure or a working connection.

## AWS

Upload the updated C:\Soezy project to the AWS bot directory, including the hidden .env and the preserved database.json. Keep credentials private and exclude node_modules. If AWS already has a newer database.json, preserve and back up that version instead of replacing it with the PC copy.

Set the Redis endpoint in `config.json`:

```json
"redis": {
  "host": "78.154.103.50",
  "port": 11313,
  "database": 0,
  "keyPrefix": "soezy:db:v1",
  "tls": false
}
```

Keep only `REDIS_PASSWORD` in `.env`; do not put credentials in `config.json`.

Stop other Soezy instances before migrating, then run these commands one at a time in the AWS bot directory. Continue only when the previous command succeeds:

```sh
npm ci
npm run redis:verify
npm run redis:migrate
npm start
```

Verification should report PING: PONG. Migration imports the JSON into a new Redis namespace; it does not overwrite existing valid Redis data or modify the original database.json.

Connection and deployment are not yet verified on AWS or WispByte. The supplied password was configured locally only. Replace the shared password with a stronger private value on both services before public deployment.

## References

- WispByte startup settings: https://wispbyte.com/kb/startup-settings
- Redis persistence: https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/
- Redis security: https://redis.io/docs/latest/operate/oss_and_stack/management/security/
