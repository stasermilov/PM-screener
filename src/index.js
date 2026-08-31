// Long-running server mode: start the HTTP server and the 6-hour scheduler.
// Composition root that wires refresh() to both the timer and the /run endpoint.

import { config } from './config.js';
import { refresh } from './refresh.js';
import { startScheduler } from './scheduler.js';
import { startServer } from './server.js';

const status = {
  startedAt: new Date().toISOString(),
  lastRunAt: null,
  lastError: null,
  scheduleHours: config.scheduleHours,
  tagSlug: config.tagSlug,
  volumeThreshold: config.volumeThreshold,
  lastStats: null,
};

let refreshing = null;

// Ensure overlapping triggers (scheduler + manual /run) share one in-flight run.
async function task() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const { summary } = await refresh();
      status.lastRunAt = summary.generatedAt;
      status.lastStats = summary.totals;
      status.lastError = null;
      return summary;
    } catch (err) {
      status.lastError = err.message;
      throw err;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function main() {
  await startServer({
    config,
    triggerRefresh: task,
    getStatus: () => ({ ok: !status.lastError, ...status }),
  });

  const stop = startScheduler(task, {
    scheduleHours: config.scheduleHours,
    runOnStart: config.runOnStart,
  });

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      console.log(`\n[pm-screener] received ${signal}, shutting down`);
      stop();
      process.exit(0);
    });
  }
}

main().catch((err) => {
  console.error(`[pm-screener] fatal: ${err.stack || err.message}`);
  process.exit(1);
});
