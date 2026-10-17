/* ================= LIGHTWEIGHT LOGGER ================= */
(() => {
const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const configured = process.env.SOEZY_LOG_LEVEL || process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug");
let currentLevel = LEVELS[String(configured).toLowerCase()] ?? LEVELS.info;
const COLORS = {
  error: "\x1b[31m",
  warn: "\x1b[33m",
  info: "\x1b[36m",
  debug: "\x1b[90m",
  reset: "\x1b[0m",
};

function shouldLog(level) {
  return (LEVELS[level] || 0) <= currentLevel;
}

function log(level, label, message, meta = null) {
  if (!shouldLog(level)) return;
  const stamp = new Date().toISOString();
  const color = process.stdout?.isTTY ? (COLORS[level] || "") : "";
  const reset = color ? COLORS.reset : "";
  const prefix = `${color}[${stamp}] [${String(level).toUpperCase()}]${label ? ` [${label}]` : ""}${reset}`;
  const line = meta ? `${prefix} ${message} ${JSON.stringify(meta)}` : `${prefix} ${message}`;
  if (level === "error") return console.error(line);
  if (level === "warn") return console.warn(line);
  console.log(line);
}

const logger = {
  setLevel(level) { currentLevel = LEVELS[String(level).toLowerCase()] ?? currentLevel; },
  error: (label, message, meta) => log("error", label, message, meta),
  warn: (label, message, meta) => log("warn", label, message, meta),
  info: (label, message, meta) => log("info", label, message, meta),
  debug: (label, message, meta) => log("debug", label, message, meta),
};

Object.assign(globalThis, { soezyLogger: logger });
module.exports = logger;
})();
