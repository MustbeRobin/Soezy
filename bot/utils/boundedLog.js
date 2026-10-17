"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");

function createBoundedLog(file, { maxBytes = 5 * 1024 * 1024, backups = 3, maxPending = 1000 } = {}) {
  const pending = [];
  let running = false;
  let retryAt = 0;
  let dropped = 0;
  let retryTimer = null;
  let batchCount = 0;
  async function pump() {
    if (running || !pending.length || Date.now() < retryAt) return;
    running = true;
    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      while (pending.length) {
        const records = pending.splice(0, 50);
        batchCount = records.length;
        const batch = records.join("");
        const size = await fs.stat(file).then(stat => stat.size, error => { if (error.code === "ENOENT") return 0; throw error; });
        if (size + Buffer.byteLength(batch) > maxBytes) {
          for (let index = backups; index >= 1; index--) {
            const from = index === 1 ? file : `${file}.${index - 1}`;
            const to = `${file}.${index}`;
            if (index === backups) await fs.unlink(to).catch(error => { if (error.code !== "ENOENT") throw error; });
            await fs.rename(from, to).catch(error => { if (error.code !== "ENOENT") throw error; });
          }
        }
        await fs.appendFile(file, batch);
        batchCount = 0;
      }
      if (dropped) { console.warn(`[LOG] ${dropped} audit records dropped during storage pressure.`); dropped = 0; }
    } catch (error) {
      dropped += pending.length + batchCount;
      batchCount = 0;
      pending.length = 0;
      retryAt = Date.now() + 60000;
      console.error(`[LOG] Audit write failed (${error.code || "IO_ERROR"}); retrying after 60s.`);
      if (!retryTimer) {
        retryTimer = setTimeout(() => { retryTimer = null; pump(); }, 60000);
        retryTimer.unref?.();
      }
    } finally { running = false; }
  }
  return line => {
    if (pending.length >= maxPending) { dropped++; return; }
    pending.push(`${String(line).slice(0, 8192).trimEnd()}\n`);
    return pump();
  };
}
module.exports = { createBoundedLog };
