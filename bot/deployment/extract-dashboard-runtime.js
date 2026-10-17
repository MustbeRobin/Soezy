"use strict";
// One-time source extraction. The standalone website never receives a database writer.
const fs = require("node:fs");
const path = require("node:path");
const source = fs.readFileSync("E:/Soezy bot web/web/dashboard.js", "utf8");
const boundary = source.indexOf("function registerDashboardRoutes(");
if (boundary < 0) throw new Error("Dashboard extraction boundary missing");
let runtime = source.slice(0, boundary).replaceAll('require("../utils/', 'require("./');
runtime += '\nmodule.exports = { createBotBridge };\n';
fs.writeFileSync(path.join(__dirname, "../utils/dashboardRuntime.js"), runtime);
const website = source.slice(0, source.indexOf("const ALLOWED_CONFIG_PATHS =")) + source.slice(source.lastIndexOf("// \u2500", boundary - 100), source.lastIndexOf("// \u2500", boundary - 100));
// Retain auth/scanner helpers and routes, but remove all in-process database access.
const helpers = source.slice(0, source.indexOf("const ALLOWED_CONFIG_PATHS ="));
const routes = source.slice(boundary);
fs.writeFileSync("E:/Soezy bot web/web/dashboard.js", helpers + '\nconst { createBotBridge, BRIDGE_STATES } = require("./remoteBridge");\n' + routes);
