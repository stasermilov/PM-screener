#!/usr/bin/env node
// One-shot entrypoint: run a single refresh and exit. Used by `npm run
// generate` and by the GitHub Actions scheduled workflow.

import { refresh } from './refresh.js';
import { config } from './config.js';

async function main() {
  const startedAt = Date.now();
  const cats = config.categories.map((c) => c.slug).join(', ');
  console.log(`[pm-screener] refreshing [${cats}] from ${config.apiBase}`);
  try {
    const { summary, htmlPath, dataPath } = await refresh();
    console.log(`[pm-screener] done in ${Date.now() - startedAt}ms`);
    for (const c of summary.categories) {
      console.log(
        `  ${c.label}: ${c.totals.windowCount} in last ${config.windowDays}d ` +
          `(${c.totals.freshCount} fresh, ${c.totals.highlightedCount} over ${config.volumeThreshold})` +
          (c.error ? ` [error: ${c.error}]` : ''),
      );
    }
    console.log(
      `  Movers: ${summary.movers.day.total} (24h), ${summary.movers.threeDay.total} (3d) · ` +
        `High chance: ${summary.highChance.total}`,
    );
    console.log(`[pm-screener] wrote ${htmlPath}`);
    console.log(`[pm-screener] wrote ${dataPath}`);
  } catch (err) {
    console.error(`[pm-screener] refresh failed: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
