"use strict";

const delayRuntimeState = globalThis.__soezyDelayRuntime || (globalThis.__soezyDelayRuntime = {
  debounceTimers: new Map(),
  throttleState: new Map(),
  safeTimers: new Set(),
});

function toMs(ms) {
  return Math.max(0, Number(ms) || 0);
}

function wait(ms) {
  const duration = toMs(ms);
  return new Promise(resolve => {
    const timer = setTimeout(resolve, duration);
    timer.unref?.();
  });
}

const sleep = wait;
const delay = wait;

function retryDelay(ms) {
  return wait(ms);
}

function randomDelay(minMs, maxMs) {
  const min = toMs(minMs);
  const max = Math.max(min, toMs(maxMs) || min);
  return wait(Math.floor(Math.random() * (max - min + 1)) + min);
}

function safeTimeout(fn, ms) {
  if (typeof fn !== "function") return null;
  const timer = setTimeout(() => {
    delayRuntimeState.safeTimers.delete(timer);
    try {
      fn();
    } catch (err) {
      console.warn("[RATELIMIT] safe timeout callback failed:", err?.message || err);
    }
  }, toMs(ms));
  timer.unref?.();
  delayRuntimeState.safeTimers.add(timer);
  return timer;
}

function debounce(fn, ms, key = fn) {
  if (typeof fn !== "function") return () => undefined;
  return function debounced(...args) {
    const timerKey = key || fn;
    const existing = delayRuntimeState.debounceTimers.get(timerKey);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      delayRuntimeState.debounceTimers.delete(timerKey);
      fn.apply(this, args);
    }, toMs(ms));
    timer.unref?.();
    delayRuntimeState.debounceTimers.set(timerKey, timer);
  };
}

function throttle(fn, ms, key = fn) {
  if (typeof fn !== "function") return () => undefined;
  return function throttled(...args) {
    const now = Date.now();
    const timerKey = key || fn;
    const entry = delayRuntimeState.throttleState.get(timerKey) || { nextAt: 0, timer: null };
    const run = () => {
      entry.nextAt = Date.now() + toMs(ms);
      entry.timer = null;
      delayRuntimeState.throttleState.set(timerKey, entry);
      fn.apply(this, args);
    };

    if (now >= entry.nextAt) {
      if (entry.timer) clearTimeout(entry.timer);
      run();
      return;
    }

    if (!entry.timer) {
      entry.timer = setTimeout(run, entry.nextAt - now);
      entry.timer.unref?.();
      delayRuntimeState.throttleState.set(timerKey, entry);
    }
  };
}

function cleanupDelayRuntime() {
  for (const timer of [...delayRuntimeState.safeTimers]) {
    if (!timer?._destroyed) continue;
    delayRuntimeState.safeTimers.delete(timer);
  }
  for (const [key, timer] of delayRuntimeState.debounceTimers) {
    if (timer?._destroyed) delayRuntimeState.debounceTimers.delete(key);
  }
  for (const [key, entry] of delayRuntimeState.throttleState) {
    if (!entry?.timer && (entry?.nextAt || 0) < Date.now() - 90_000) delayRuntimeState.throttleState.delete(key);
  }
}

const delayApi = {
  wait,
  sleep,
  delay,
  randomDelay,
  debounce,
  throttle,
  safeTimeout,
  retryDelay,
  cleanupDelayRuntime,
};

Object.assign(globalThis, delayApi);

module.exports = delayApi;
