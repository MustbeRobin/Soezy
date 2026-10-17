"use strict";
const installed = Symbol.for("soezy.memberFetchScheduler");

function installMemberFetchScheduler(Manager, { concurrency = 4, maxPending = 40, queueTimeout = 15000 } = {}) {
  if (Manager.prototype[installed]) return false;
  const original = Manager.prototype.fetch;
  const completeFetches = new WeakMap();
  const pending = [];
  let running = 0;
  function pump() {
    while (running < concurrency && pending.length) {
      const job = pending.shift();
      clearTimeout(job.timer);
      running++;
      Promise.resolve().then(job.task).then(job.resolve, job.reject).finally(() => { running--; pump(); });
    }
  }
  Manager.prototype.fetch = function (options) {
    const user = this.client.users.resolveId(options?.user ?? options);
    if (user && !options?.limit && !options?.withPresences) return original.call(this, options);
    const full = !options || Object.keys(options).length === 0;
    if (full && completeFetches.has(this)) return completeFetches.get(this);
    if (pending.length >= maxPending) return Promise.reject(Object.assign(new Error("Member fetch queue busy; retry shortly"), { code: "MEMBER_FETCH_BUSY" }));
    const promise = new Promise((resolve, reject) => {
      const job = { task: () => original.call(this, options), resolve, reject };
      job.timer = setTimeout(() => {
        const index = pending.indexOf(job);
        if (index !== -1) pending.splice(index, 1);
        reject(Object.assign(new Error("Member fetch queue timeout"), { code: "MEMBER_FETCH_BUSY" }));
      }, queueTimeout);
      job.timer.unref?.();
      pending.push(job);
      pump();
    });
    if (full) {
      completeFetches.set(this, promise);
      const done = () => { if (completeFetches.get(this) === promise) completeFetches.delete(this); };
      promise.then(done, done);
    }
    return promise;
  };
  Object.defineProperty(Manager.prototype, installed, { value: true });
  return true;
}

module.exports = { installMemberFetchScheduler };
