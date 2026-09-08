// One deadline for the existing serial cycle, including metrics and store calls.
// A timed-out call is ambiguous; never retry it or declare it complete here.
export function createWorkerDeadline({ budgetMs = 50_000, clock = () => performance.now(), timers = globalThis } = {}) {
  const duration = Number.isFinite(Number(budgetMs)) ? Math.max(0, Math.min(50_000, Number(budgetMs))) : 50_000;
  const deadline = clock() + duration;
  let closed = false;
  const check = () => {
    if (closed || clock() >= deadline) throw new Error('WORKER_DEADLINE_EXHAUSTED');
  };
  const guard = action => async (...args) => {
    check();
    const result = await action(...args);
    check();
    return result;
  };
  return {
    guard,
    guardClient: client => new Proxy(client, { get(target, property) {
      const value = target[property];
      return typeof value === 'function' ? guard(value.bind(target)) : value;
    } }),
    async wait(action) {
      check();
      let timer;
      try {
        return await Promise.race([
          Promise.resolve().then(guard(action)),
          new Promise((resolve, reject) => { timer = timers.setTimeout(() => {
            closed = true;
            reject(new Error('WORKER_DEADLINE_EXHAUSTED'));
          }, Math.max(0, deadline - clock())); }),
        ]);
      } finally { timers.clearTimeout(timer); }
    },
    close() { closed = true; },
  };
}
