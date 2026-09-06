import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSummary } from '../src/summary.js';
import { renderHtml, formatUsd, escapeHtml } from '../src/render.js';
import { normalizeEvents } from '../src/normalize.js';
import { rawEvents } from './fixtures.js';

const GEN = new Date('2026-08-31T12:00:00Z');

function summaryFromFixtures(extra = {}) {
  const raw = rawEvents(GEN.toISOString());
  return buildSummary(
    { freshEvents: normalizeEvents(raw), ...extra },
    {
      threshold: 3000,
      windowDays: 7,
      freshDays: 2,
      generatedAt: GEN,
      tagSlug: 'geopolitics',
      refreshUrl: 'https://github.com/o/r/actions/workflows/geopolitics-summary.yml',
    },
  );
}

test('over-threshold markets are highlighted and sorted to the top', () => {
  const { fresh } = summaryFromFixtures();
  // id 1 (5000) and id 3 (3500.5) are over 3000.
  assert.equal(fresh.stats.highlightedCount, 2);
  const flags = fresh.items.map((m) => m.highlighted);
  const firstNonHL = flags.indexOf(false);
  assert.ok(!flags.slice(firstNonHL).includes(true), 'all highlighted come first');
  assert.equal(fresh.items[0].id, '1'); // 5000
  assert.equal(fresh.items[1].id, '3'); // 3500.5
});

test('threshold is exclusive (exactly 3000 is not highlighted)', () => {
  const summary = buildSummary(
    { freshEvents: [{ id: 'a', title: 'exact', volume: 3000, tags: [], url: '#' }] },
    { threshold: 3000, generatedAt: GEN },
  );
  assert.equal(summary.fresh.items[0].highlighted, false);
});

test('totals aggregate fresh, earlier, and highlighted counts', () => {
  const summary = summaryFromFixtures({
    earlierEvents: [{ id: 'z', title: 'older', volume: 10, tags: [], url: '#' }],
  });
  assert.equal(summary.totals.freshCount, 5);
  assert.equal(summary.totals.earlierCount, 1);
  assert.equal(summary.totals.windowCount, 6);
  assert.equal(summary.totals.highlightedCount, 2);
});

test('renderHtml has both areas, no sub-markets, and escapes untrusted text', () => {
  const summary = summaryFromFixtures({
    earlierEvents: [{ id: 'z', title: 'older market', volume: 500, tags: [], url: '#' }],
  });
  const html = renderHtml(summary, { now: GEN });

  const freshIdx = html.indexOf('Just added');
  const earlierIdx = html.indexOf('days ago');
  assert.ok(freshIdx > -1 && earlierIdx > -1);
  assert.ok(freshIdx < earlierIdx, 'fresh area comes first');

  assert.ok(html.includes('class="card highlight"'), 'highlighted cards present');
  assert.ok(html.includes(formatUsd(3000)), 'legend shows the threshold');
  assert.ok(!/sub-?market/i.test(html), 'sub-markets are gone');

  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes(escapeHtml('Danger <script>alert(1)</script> & "quotes"')));
});

test('renderHtml has a watchlist tick on every card and a Watchlist tab', () => {
  const summary = summaryFromFixtures();
  const html = renderHtml(summary, { now: GEN });

  const toggleCount = (html.match(/class="watch-toggle"/g) || []).length;
  assert.equal(toggleCount, summary.totals.windowCount, 'one tick per market card');

  assert.ok(html.includes('id="tab-geo"') && html.includes('id="tab-watch"'), 'bottom tabs');
  assert.ok(html.includes('id="view-watch"'), 'watchlist view container');
  assert.ok(html.includes('id="watch-list"'), 'watchlist list container');
  assert.ok(html.includes("localStorage"), 'watchlist persists in the browser');
});

test('renderHtml keeps the Update button and refresh URL', () => {
  const html = renderHtml(summaryFromFixtures(), { now: GEN });
  assert.ok(html.includes('id="update-btn"'));
  assert.ok(html.includes('https://github.com/o/r/actions/workflows/geopolitics-summary.yml'));
});

test('renderHtml hides the earlier area when the window is empty', () => {
  const summary = buildSummary({}, { threshold: 3000, windowDays: 7, freshDays: 2, generatedAt: GEN });
  const html = renderHtml(summary);
  assert.equal(summary.totals.windowCount, 0);
  assert.ok(html.includes('Nothing new in the last 2'));
  assert.ok(!html.includes('days ago'), 'earlier area hidden');
});
