"use strict";

const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const envPath = path.resolve(__dirname, "../.env");
const knownPasswords = new Set();

// Non-secret Lavalink config (host, port, name, secure) comes from config.json.
// The password MUST remain in .env as LAVALINK_PASSWORD — never in config.json.
let _cfgLavalink = {};
let configError = null;
try {
  const cfg = require("../config.json");
  _cfgLavalink = cfg.lavalink || {};
} catch {
  configError = "Cannot read config.json. Check that it exists and contains valid JSON.";
}

function rememberPassword(value) {
  if (!value) return;
  knownPasswords.add(value);
  if (knownPasswords.size > 4) knownPasswords.delete(knownPasswords.values().next().value);
}

function loadLavalinkEnvironment({ file = envPath, env = process.env } = {}) {
  let parsed = {};
  let filePresent = true;
  try {
    parsed = dotenv.parse(fs.readFileSync(file));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("Cannot read the project's .env file. Check its permissions.");
    filePresent = false;
  }
  const fromFile = Object.prototype.hasOwnProperty.call(parsed, "LAVALINK_PASSWORD");
  const overridden = fromFile && env.LAVALINK_PASSWORD !== undefined && env.LAVALINK_PASSWORD !== parsed.LAVALINK_PASSWORD;
  rememberPassword(env.LAVALINK_PASSWORD);
  // Only the Lavalink secret overrides inherited PM2 values; all other env settings stay unchanged.
  if (fromFile) env.LAVALINK_PASSWORD = parsed.LAVALINK_PASSWORD;
  rememberPassword(env.LAVALINK_PASSWORD);
  return {
    filePresent,
    passwordLoaded: Boolean(env.LAVALINK_PASSWORD),
    source: fromFile ? "project .env" : (env.LAVALINK_PASSWORD ? "process environment" : "missing"),
    inheritedPasswordOverridden: overridden,
  };
}

function logLavalinkEnvironment(status, logger = console) {
  logger.log(`[LAVALINK] LAVALINK_PASSWORD loaded: ${status.passwordLoaded}; source: ${status.source}`);
  if (status.inheritedPasswordOverridden) {
    logger.warn("[LAVALINK] Replaced a differing inherited password with the project .env value.");
  }
}

function readRequiredEnv(name, env) {
  const value = String(env[name] || "").trim();
  return value || null;
}

function getLavalinkConfiguration({ settings = _cfgLavalink, env = process.env } = {}) {
  if (settings === _cfgLavalink && configError) return { nodes: [], error: configError };
  // Non-secrets: prefer config.json, fall back to legacy env vars for backward compat
  const host =
    (typeof settings.host === "string" && settings.host.trim()) ||
    readRequiredEnv("LAVALINK_HOST", env);

  const portRaw =
    (settings.port !== undefined ? String(settings.port) : null) ||
    readRequiredEnv("LAVALINK_PORT", env);

  const name =
    (typeof settings.name === "string" && settings.name.trim()) ||
    readRequiredEnv("LAVALINK_NAME", env) ||
    "Lavalink";

  const secureRaw = String(settings.secure ?? readRequiredEnv("LAVALINK_SECURE", env) ?? "false").trim().toLowerCase();

  // Secret: password ONLY from env — never from config.json
  const password = env.LAVALINK_PASSWORD;

  const port = Number(portRaw);

  if (!host || !portRaw || typeof password !== "string" || !password.trim()) {
    return {
      nodes: [],
      error:
        "Lavalink is not configured. Set host/port in config.json and LAVALINK_PASSWORD in .env.",
    };
  }
  if (password !== password.trim() || /[\r\n\0]/.test(password) || /^["']|["']$/.test(password)) {
    return { nodes: [], error: "LAVALINK_PASSWORD contains surrounding whitespace, literal quotes, or a line break. Check the .env value." };
  }
  if (secureRaw !== "true" && secureRaw !== "false") {
    return { nodes: [], error: "Lavalink secure must be true or false." };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { nodes: [], error: "Lavalink port must be a number from 1 to 65535." };
  }
  if (/^[a-z]+:\/\//i.test(host) || /[\s/@?#]/.test(host)) {
    return {
      nodes: [],
      error: "Lavalink host must be a hostname or IP address without a protocol or path.",
    };
  }

  return {
    nodes: [{ name, url: `${host}:${port}`, auth: password, secure: secureRaw === "true" }],
    error: null,
  };
}

function redactLavalinkError(error) {
  let message = String(error?.message || error || "Unknown Lavalink error");
  const passwords = [...knownPasswords, process.env.LAVALINK_PASSWORD].filter(Boolean);
  for (const password of passwords.sort((a, b) => b.length - a.length)) {
    const forms = new Set([password, password.trim(), encodeURIComponent(password), JSON.stringify(password).slice(1, -1)]);
    for (const form of forms) if (form) message = message.split(form).join("[REDACTED]");
  }
  return message;
}

module.exports = { getLavalinkConfiguration, redactLavalinkError, loadLavalinkEnvironment, logLavalinkEnvironment };
