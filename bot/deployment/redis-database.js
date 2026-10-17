"use strict";
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { openDatabase, exportDatabase } = require("../utils/redisDatabase");
const { connectRedis, closeRedis, getRedisConfig } = require("../utils/redis");

(async () => {
  const action = process.argv[2] || "verify";
  let store;
  try {
    if (action === "migrate") {
      store = await openDatabase();
      console.log(`[DB] Verified ${Object.keys(store.db.guilds || {}).length} guilds and ${Object.keys(store.db.users || {}).length} global users; all root sections retained`);
    } else if (action === "export") {
      const destination = process.argv[3] || path.resolve(__dirname, `../logs/db-backups/database-redis-${Date.now()}.json`);
      console.log(await exportDatabase(destination));
    } else if (action === "verify") {
      const client = await connectRedis();
      console.log(`[REDIS] PING: ${await client.ping()}`);
      const key = `${getRedisConfig().keyPrefix}:data`;
      const { decode } = require("../utils/redisDatabase");
      const hash = await client.hGetAll(key);
      if (!Object.keys(hash).length) console.log("[DB] Namespace is new; migration will run at startup");
      else {
        const db = decode(hash);
        console.log(`[DB] Schema verified: ${Object.keys(db.guilds || {}).length} guilds, ${Object.keys(db.users || {}).length} global users, revision ${hash._revision}`);
      }
    } else throw new Error("Usage: redis-database.js verify|migrate|export [new-backup-file]");
  } finally { await store?.close(); await closeRedis(); }
})().catch(error => { console.error(`[DB] Redis operation failed: ${error.message}`); process.exitCode = 1; });
