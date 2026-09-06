// One full refresh cycle: fetch every category, reconcile events against saved
// state, select the last-N-days markets per category (fresh/earlier split),
// record price snapshots, compute Movers and High-chance across all categories,
// render the multi-tab report, and persist output + state.

import fs from 'node:fs/promises';
import path from 'node:path';

import { config } from './config.js';
import { fetchCategories } from './gammaClient.js';
import { normalizeEvents, extractPricedMarkets } from './normalize.js';
import { loadState, saveState, reconcileSeen, selectWithinWindow, partitionByFreshness } from './marketStore.js';
import { recordPrices, buildMovers, buildHighChance } from './prices.js';
import { classifyExclusion } from './exclude.js';
import { buildSummary } from './summary.js';
import { renderHtml } from './render.js';

/**
 * Run one refresh.
 * @param {object} [deps]
 * @param {Function} [deps.fetchCategories] async () => { categories: [{slug,label,emoji,rawEvents,error?}] }
 * @param {Date}     [deps.now]
 */
export async function refresh(deps = {}) {
  const now = deps.now instanceof Date ? deps.now : new Date();
  const fetchFn = deps.fetchCategories || fetchCategories;

  const state = await loadState(config.stateFile);
  const previousRunAt = state.lastRunAt;

  const { categories: fetched } = await fetchFn();

  const windowOpts = {
    now,
    windowDays: config.windowDays,
    threshold: config.volumeThreshold,
    showOnlyHighlighted: config.showOnlyHighlighted,
  };

  const extra = config.excludeExtra;
  const rawEventId = (ev) => String(ev?.id ?? ev?.slug ?? '');

  let seen = state.seen || {};
  const categoryResults = [];
  const allMarketsById = new Map(); // rawId -> priced market (deduped across categories)
  const excluded = [];
  const excludedSeen = new Set(); // dedupe excluded audit rows across categories

  for (const cat of fetched) {
    const catMeta = { category: cat.slug, categoryLabel: cat.label, categoryEmoji: cat.emoji };

    // Event-level exclusion (removes the card and all its markets everywhere).
    const events = normalizeEvents(cat.rawEvents);
    const keptEvents = [];
    const excludedEventIds = new Set();
    for (const ev of events) {
      const hit = classifyExclusion(`${ev.title} ${ev.description || ''}`, extra);
      if (hit) {
        excludedEventIds.add(ev.id);
        const key = `ev:${ev.id}`;
        if (!excludedSeen.has(key)) {
          excludedSeen.add(key);
          excluded.push({
            kind: 'event', id: key, title: ev.title, url: ev.url, volume: ev.volume,
            reason: hit.label, reasonId: hit.id, matched: hit.matched, ...catMeta,
          });
        }
      } else {
        keptEvents.push(ev);
      }
    }

    const rec = reconcileSeen(seen, keptEvents, { now });
    seen = rec.nextSeen; // thread forward so later categories keep earlier ones

    const recent = selectWithinWindow(rec.items, windowOpts);
    const { fresh, earlier } = partitionByFreshness(recent, { now, freshDays: config.freshDays });

    categoryResults.push({
      slug: cat.slug,
      label: cat.label,
      emoji: cat.emoji,
      error: cat.error || null,
      eventsTracked: keptEvents.length,
      freshEvents: fresh,
      earlierEvents: earlier,
    });

    // Market-level: skip markets inside excluded events, and exclude individual
    // markets whose own question matches a rule (e.g. "will he say 'X'?").
    const keptRaw = (cat.rawEvents || []).filter((ev) => !excludedEventIds.has(rawEventId(ev)));
    for (const m of extractPricedMarkets(keptRaw, cat)) {
      const hit = classifyExclusion(m.question, extra);
      if (hit) {
        if (!excludedSeen.has(m.id)) {
          excludedSeen.add(m.id);
          excluded.push({
            kind: 'market', id: m.id, title: m.question, url: m.url, volume: m.volume,
            reason: hit.label, reasonId: hit.id, matched: hit.matched, ...catMeta,
          });
        }
        continue;
      }
      if (!allMarketsById.has(m.rawId)) allMarketsById.set(m.rawId, m);
    }
  }

  const allMarkets = [...allMarketsById.values()];

  const prices = recordPrices(state.prices, allMarkets, {
    now,
    minVolume: config.priceTrackMinVolume,
    maxAgeHours: config.priceHistoryMaxAgeHours,
    maxPoints: config.priceHistoryMaxPoints,
  });

  const movers = buildMovers(allMarkets, prices, {
    dayPct: config.moverDayPct,
    dayHours: config.moverDayHours,
    dayMaxGapHours: config.moverDayMaxGapHours,
    threeDayPct: config.mover3dPct,
    threeDayHours: config.mover3dHours,
    threeDayMaxGapHours: config.mover3dMaxGapHours,
    limit: config.moversLimit,
  });

  const highChance = buildHighChance(allMarkets, {
    min: config.highMin,
    max: config.highMax,
    limit: config.highChanceLimit,
  });

  const summary = buildSummary(
    { categories: categoryResults, movers, highChance, excluded },
    {
      threshold: config.volumeThreshold,
      scheduleHours: config.scheduleHours,
      windowDays: config.windowDays,
      freshDays: config.freshDays,
      showOnlyHighlighted: config.showOnlyHighlighted,
      categoryPageSize: config.categoryPageSize,
      generatedAt: now,
      previousRunAt,
      refreshUrl: config.workflowUrl,
      moverDayPct: config.moverDayPct,
      mover3dPct: config.mover3dPct,
      highMin: config.highMin,
      highMax: config.highMax,
    },
  );

  const nextState = {
    version: state.version || 1,
    firstRunAt: state.firstRunAt || now.toISOString(),
    lastRunAt: now.toISOString(),
    seen,
    prices,
  };

  const html = renderHtml(summary, { now });

  await fs.mkdir(config.outputDir, { recursive: true });
  const htmlPath = path.join(config.outputDir, 'index.html');
  const dataPath = path.join(config.outputDir, 'data.json');
  await fs.writeFile(htmlPath, html, 'utf8');
  await fs.writeFile(dataPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  await saveState(config.stateFile, nextState);

  return { summary, htmlPath, dataPath };
}
