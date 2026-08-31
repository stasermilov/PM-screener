// One full refresh cycle: fetch geopolitics markets, reconcile against saved
// state, select the markets added within the rolling window, build the summary,
// render the HTML report, and persist both the output and the updated state.

import fs from 'node:fs/promises';
import path from 'node:path';

import { config } from './config.js';
import { fetchGeopoliticsMarkets } from './gammaClient.js';
import { loadState, saveState, reconcileAll, selectWithinWindow } from './marketStore.js';
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

  // Record when each market was first seen (stable timestamp), then keep only
  // those added within the rolling window that meet the criteria.
  const reconciled = reconcileAll(state, { events: markets, submarkets }, { now });
  const nextState = reconciled.nextState;

  const windowOpts = {
    now,
    windowDays: config.windowDays,
    threshold: config.volumeThreshold,
    showOnlyHighlighted: config.showOnlyHighlighted,
  };
  const recentEvents = selectWithinWindow(reconciled.events, windowOpts);
  const recentSubmarkets = selectWithinWindow(reconciled.submarkets, windowOpts);

  const summary = buildSummary(
    { events: recentEvents, submarkets: recentSubmarkets },
    {
      threshold: config.volumeThreshold,
      scheduleHours: config.scheduleHours,
      windowDays: config.windowDays,
      showOnlyHighlighted: config.showOnlyHighlighted,
      generatedAt: now,
      tagSlug: tagSlug || config.tagSlug,
      eventsTracked: markets.length,
      submarketsTracked: submarkets.length,
      previousRunAt,
      refreshUrl: config.workflowUrl,
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
