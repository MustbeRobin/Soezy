"use strict";

module.exports = {
  apps: [
    {
      name: "Soezy",
      script: "index.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "700M",
      kill_timeout: 15000,
      min_uptime: "30s",
      max_restarts: 10,
      exp_backoff_restart_delay: 1000,
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      out_file: "./logs/bot.out.log",
      error_file: "./logs/bot.err.log",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        SOEZY_START_WEB: process.env.SOEZY_START_WEB || "false",
        SOEZY_BOT_DIR: process.env.SOEZY_BOT_DIR || __dirname,
      }
    }
  ]
};
