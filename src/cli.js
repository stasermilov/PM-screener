#!/usr/bin/env node
// One-shot entrypoint: run a single refresh and exit. Used by `npm run
// generate` and by the GitHub Actions scheduled workflow.

import { refresh } from './refresh.js';
import { config } from './config.js';

async function main() {
  const startedAt = Date.now();
  console.log(`[pm-screener] refreshing "${config.tagSlug}" markets from ${config.apiBase}`);
  try {
    const { summary, htmlPath, dataPath } = await refresh();
    const s = summary.stats;
    console.log(
      `[pm-screener] done in ${Date.now() - startedAt}ms · ` +
        `${s.newCount} new market(s), ${s.highlightedCount} over ${config.volumeThreshold} · ` +
        `tracked ${s.totalTracked}`,
    );
    console.log(`[pm-screener] wrote ${htmlPath}`);
    console.log(`[pm-screener] wrote ${dataPath}`);
  } catch (err) {
    console.error(`[pm-screener] refresh failed: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
