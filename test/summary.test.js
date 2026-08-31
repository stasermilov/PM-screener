import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSummary } from '../src/summary.js';
import { renderHtml, formatUsd, escapeHtml } from '../src/render.js';
import { normalizeEvents, normalizeSubmarkets } from '../src/normalize.js';
import { rawEvents } from './fixtures.js';

const GEN = new Date('2026-08-31T12:00:00Z');

function summaryFromFixtures(extra = {}) {
  const raw = rawEvents(GEN.toISOString());
  return buildSummary(
    {
      freshEvents: normalizeEvents(raw),
      freshSubmarkets: normalizeSubmarkets(raw),
      ...extra,
    },
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

test('within a group, over-threshold items are highlighted and sorted to the top', () => {
  const { fresh } = summaryFromFixtures();
  // id 1 (5000) and id 3 (3500.5) are over 3000.
  assert.equal(fresh.events.stats.highlightedCount, 2);
  const flags = fresh.events.items.map((m) => m.highlighted);
  const firstNonHL = flags.indexOf(false);
  assert.ok(!flags.slice(firstNonHL).includes(true), 'all highlighted come first');
  assert.equal(fresh.events.items[0].id, '1'); // 5000
  assert.equal(fresh.events.items[1].id, '3'); // 3500.5
});

test('sub-markets keep the same highlight rule within their group', () => {
  const { fresh } = summaryFromFixtures();
  assert.equal(fresh.submarkets.stats.newCount, 4);
  assert.equal(fresh.submarkets.stats.highlightedCount, 1); // only sub 11 (5000)
  assert.equal(fresh.submarkets.items[0].id, '11');
});

test('threshold is exclusive (exactly 3000 is not highlighted)', () => {
  const summary = buildSummary(
    { freshEvents: [{ id: 'a', title: 'exact', volume: 3000, tags: [], url: '#' }] },
    { threshold: 3000, generatedAt: GEN },
  );
  assert.equal(summary.fresh.events.items[0].highlighted, false);
});

test('totals aggregate fresh, earlier, and highlighted across both types', () => {
  const summary = summaryFromFixtures({
    earlierEvents: [{ id: 'z', title: 'older', volume: 10, tags: [], url: '#' }],
  });
  // fresh: 5 events + 4 sub-markets = 9; earlier: 1 event.
  assert.equal(summary.totals.freshCount, 9);
  assert.equal(summary.totals.earlierCount, 1);
  assert.equal(summary.totals.windowCount, 10);
  // highlighted: fresh events 2 + fresh subs 1 + earlier 0 = 3.
  assert.equal(summary.totals.highlightedCount, 3);
});

test('renderHtml shows a fresh area on top and an earlier area below', () => {
  const summary = summaryFromFixtures({
    earlierEvents: [{ id: 'z', title: 'older market', volume: 500, tags: [], url: '#' }],
  });
  const html = renderHtml(summary, { now: GEN });

  const freshIdx = html.indexOf('Just added');
  const earlierIdx = html.indexOf('days ago');
  assert.ok(freshIdx > -1, 'has the fresh area');
  assert.ok(earlierIdx > -1, 'has the earlier area');
  assert.ok(freshIdx < earlierIdx, 'fresh area comes first');

  assert.ok(html.includes('Last 2d') && html.includes('Last 7d'), 'top stats show both windows');
  assert.ok(html.includes('class="card highlight"'), 'highlighted cards present');
  assert.ok(html.includes(formatUsd(3000)), 'legend shows the threshold');
  assert.ok(html.includes('62%'), 'sub-market outcome prices shown');

  // XSS fixture must be escaped, not rendered as a tag.
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes(escapeHtml('Danger <script>alert(1)</script> & "quotes"')));
});

test('renderHtml includes the Update button, window wording, and refresh URL', () => {
  const html = renderHtml(summaryFromFixtures(), { now: GEN });
  assert.ok(html.includes('id="update-btn"'));
  assert.ok(html.includes('Update now'));
  assert.ok(html.includes('last 7 days'));
  assert.ok(html.includes('https://github.com/o/r/actions/workflows/geopolitics-summary.yml'));
});

test('renderHtml shows an empty fresh state and hides the earlier area when nothing is new', () => {
  const summary = buildSummary({}, { threshold: 3000, windowDays: 7, freshDays: 2, generatedAt: GEN });
  const html = renderHtml(summary);
  assert.equal(summary.totals.windowCount, 0);
  assert.ok(html.includes('Nothing new in the last 2'));
  assert.ok(!html.includes('days ago'), 'earlier area is hidden when the window is empty');
});
