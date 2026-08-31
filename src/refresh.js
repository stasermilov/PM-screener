// One full refresh cycle: fetch geopolitics markets, diff against saved state
// to find newly added ones, build the summary, render the HTML report, and
// persist both the output and the updated state.

import fs from 'node:fs/promises';
import path from 'node:path';

import { config } from './config.js';
import { fetchGeopoliticsMarkets } from './gammaClient.js';
import { loadState, saveState, computeNewlyAddedAll } from './marketStore.js';
import { buildSummary } from './summary.js';
import { renderHtml } from './render.js';

/**
 * Run one refresh.
 * @param {object} [deps] injectable dependencies for testing
 * @param {Function} [deps.fetchMarkets] async () => { markets, tagSlug, ... }
 * @param {Date}     [deps.now]
 * @returns {Promise<{summary: object, htmlPath: string, dataPath: string}>}
 */
export async function refresh(deps = {}) {
  const now = deps.now instanceof Date ? deps.now : new Date();
  const fetchMarkets = deps.fetchMarkets || fetchGeopoliticsMarkets;

  const state = await loadState(config.stateFile);
  const previousRunAt = state.lastRunAt;

  const { markets, submarkets = [], tagSlug } = await fetchMarkets();

  const { newlyAddedEvents, newlyAddedSubmarkets, nextState, isFirstRun } =
    computeNewlyAddedAll(
      state,
      { events: markets, submarkets },
      { now, firstRunLookbackHours: config.firstRunLookbackHours },
    );

  const summary = buildSummary(
    { events: newlyAddedEvents, submarkets: newlyAddedSubmarkets },
    {
      threshold: config.volumeThreshold,
      scheduleHours: config.scheduleHours,
      generatedAt: now,
      isFirstRun,
      tagSlug: tagSlug || config.tagSlug,
      eventsTracked: markets.length,
      submarketsTracked: submarkets.length,
      previousRunAt,
    },
  );

  const html = renderHtml(summary, { now });

  await fs.mkdir(config.outputDir, { recursive: true });
  const htmlPath = path.join(config.outputDir, 'index.html');
  const dataPath = path.join(config.outputDir, 'data.json');
  await fs.writeFile(htmlPath, html, 'utf8');
  await fs.writeFile(dataPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  await saveState(config.stateFile, nextState);

  return { summary, htmlPath, dataPath };
}
