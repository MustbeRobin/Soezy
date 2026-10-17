require('dotenv').config();
const { Client } = require('discord.js');
const { connectRedis, closeRedis, getRedisConfig } = require('../utils/redis');
const { decode } = require('../utils/redisDatabase');
(async () => {
  const redis = await connectRedis();
  const db = decode(await redis.hGetAll(`${getRedisConfig().keyPrefix}:data`));
  const client = new Client({ intents: [] });
  client.rest.setToken(require('../config.json').token);
  client.user = { id: '1456175060128632996' };
  const guild = await client.guilds.fetch('1364922776007479306');
  try {
    const count = await require('../utils/nativeAutomodService').syncFilters(guild, { guildData: id => db.guilds[id], saveDB() {} });
    console.log('Synced rules:', count);
  } catch (error) { console.log(JSON.stringify({ code: error.code, errors: error.rawError?.errors, message: error.message })); }
  await closeRedis();
  client.destroy();
})().catch(async error => { console.error(error.message); await closeRedis(); process.exitCode = 1; });
