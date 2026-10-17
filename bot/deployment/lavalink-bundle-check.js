"use strict";
// Run only against an extracted test bundle, never the live Lavalink directory.
const path = require("node:path");
const fs = require("node:fs/promises");
const net = require("node:net");
const { spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");

async function main() {
  if (!process.argv[2]) throw new Error("Usage: node deployment/lavalink-bundle-check.js <extracted-test-directory>");
  const directory = path.resolve(process.argv[2]);
  await fs.access(path.join(directory, "Lavalink.jar"));
  await fs.access(path.join(directory, "application.yml"));
  const listener = net.createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const password = randomUUID();
  const java = spawn("java", ["-Xms64M", "-Xmx256M", "-XX:+UseSerialGC", "-jar", "Lavalink.jar",
    "--spring.config.location=classpath:/application.yml,file:./application.yml", "--server.address=127.0.0.1", `--server.port=${port}`], {
    cwd: directory, env: { ...process.env, LAVALINK_SERVER_PASSWORD: password }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let output = "";
  let failure;
  let ended = false;
  const collect = chunk => { output = (output + chunk.toString()).slice(-16000); };
  java.stdout.on("data", collect);
  java.stderr.on("data", collect);
  java.on("error", error => { failure = error; });
  const exited = new Promise(resolve => java.once("close", code => { ended = true; resolve(code); }));
  try {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      if (failure) throw failure;
      if (ended) throw new Error("Lavalink exited before becoming ready");
      const response = await fetch(`http://127.0.0.1:${port}/v4/info`, { headers: { Authorization: password }, signal: AbortSignal.timeout(1000) }).catch(() => null);
      if (response?.ok) {
        const info = await response.json();
        const actual = new Map(info.plugins.map(plugin => [plugin.name, plugin.version]));
        for (const [name, version] of [["youtube-plugin", "1.18.2"], ["lavasrc-plugin", "4.8.3"], ["lavasearch-plugin", "1.0.0"], ["lavalyrics-plugin", "1.1.0"]]) {
          if (actual.get(name) !== version) throw new Error(`Required plugin missing/wrong version: ${name}`);
        }
        console.log(`[CHECK] Lavalink ${info.version.semver}: all four plugins loaded and authenticated`);
        console.log(`[CHECK] Sources: ${info.sourceManagers.join(", ")}`);
        return;
      }
      await delay(1000);
    }
    throw new Error("Test Lavalink startup timed out");
  } catch (error) {
    console.error(output.replaceAll(password, "[REDACTED]"));
    throw error;
  } finally {
    if (!ended) {
      java.kill("SIGTERM");
      const forced = setTimeout(() => java.kill("SIGKILL"), 5000);
      await exited;
      clearTimeout(forced);
    }
  }
}

main().catch(error => { console.error(`[CHECK] ${error.message}`); process.exitCode = 1; });
