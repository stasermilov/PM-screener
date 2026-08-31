// A small drift-safe scheduler. Instead of a naive setInterval (which drifts
// and fires at arbitrary wall-clock times), this aligns ticks to fixed UTC
// boundaries — e.g. with scheduleHours=6 it fires at 00:00, 06:00, 12:00 and
// 18:00 UTC — and re-arms after each run.

/** Milliseconds from `now` until the next aligned N-hour boundary. */
export function msUntilNextTick(scheduleHours, now = new Date()) {
  const periodMs = Math.max(1, scheduleHours) * 3600 * 1000;
  const t = now.getTime();
  const next = Math.floor(t / periodMs) * periodMs + periodMs;
  return Math.max(1000, next - t);
}

/**
 * Start the scheduler. Returns a stop() function.
 * @param {Function} task            async function to run each tick
 * @param {object} opts
 * @param {number} opts.scheduleHours
 * @param {boolean} opts.runOnStart
 * @param {Console} [opts.logger]
 */
export function startScheduler(task, opts = {}) {
  const { scheduleHours = 6, runOnStart = true, logger = console } = opts;
  let timer = null;
  let stopped = false;

  async function run(reason) {
    logger.log(`[scheduler] running task (${reason})`);
    try {
      await task();
    } catch (err) {
      logger.error(`[scheduler] task failed: ${err.stack || err.message}`);
    }
  }

  function arm() {
    if (stopped) return;
    const ms = msUntilNextTick(scheduleHours);
    const at = new Date(Date.now() + ms).toISOString();
    logger.log(`[scheduler] next run in ${Math.round(ms / 60000)} min (~${at})`);
    timer = setTimeout(async () => {
      await run('scheduled');
      arm();
    }, ms);
    if (typeof timer.unref === 'function') timer.unref();
  }

  (async () => {
    if (runOnStart) await run('startup');
    arm();
  })();

  return function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
