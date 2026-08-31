import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSummary } from '../src/summary.js';
import { renderHtml, formatUsd, escapeHtml } from '../src/render.js';
import { normalizeEvents } from '../src/normalize.js';
import { rawEvents } from './fixtures.js';

function summaryFromFixtures() {
  const now = new Date('2026-08-31T12:00:00Z');
  const markets = normalizeEvents(rawEvents(now.toISOString()));
  return buildSummary(markets, {
    threshold: 3000,
    scheduleHours: 6,
    generatedAt: now,
    tagSlug: 'geopolitics',
    totalTracked: markets.length,
  });
}

test('markets over the threshold are highlighted and sorted to the top', () => {
  const summary = summaryFromFixtures();
  // id 1 (5000) and id 3 (3500.5) are over 3000.
  assert.equal(summary.stats.highlightedCount, 2);

  const highlightedFlags = summary.markets.map((m) => m.highlighted);
  // All highlighted come before all non-highlighted.
  const firstNonHighlighted = highlightedFlags.indexOf(false);
  assert.ok(!highlightedFlags.slice(firstNonHighlighted).includes(true));

  // Within highlighted, higher volume first.
  assert.equal(summary.markets[0].id, '1'); // 5000
  assert.equal(summary.markets[1].id, '3'); // 3500.5
});

test('threshold is exclusive (exactly 3000 is not highlighted)', () => {
  const summary = buildSummary(
    [{ id: 'a', title: 'exact', volume: 3000, tags: [], url: '#' }],
    { threshold: 3000, generatedAt: new Date() },
  );
  assert.equal(summary.markets[0].highlighted, false);
});

test('stats compute counts and totals', () => {
  const summary = summaryFromFixtures();
  assert.equal(summary.stats.newCount, 5);
  assert.equal(summary.stats.topVolume, 5000);
  const expectedTotal = 5000 + 1200 + 3500.5 + 2600 + 10;
  assert.equal(summary.stats.totalVolume, Math.round(expectedTotal * 100) / 100);
});

test('renderHtml highlights over-threshold cards and escapes untrusted text', () => {
  const summary = summaryFromFixtures();
  const html = renderHtml(summary, { now: new Date('2026-08-31T12:00:00Z') });

  assert.ok(html.includes('<!doctype html>'));
  assert.ok(html.includes('class="card highlight"'), 'expected a highlighted card');
  assert.ok(html.includes(formatUsd(3000)), 'legend shows the threshold');

  // XSS fixture must be escaped, not rendered as a tag.
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes(escapeHtml('Danger <script>alert(1)</script> & "quotes"')));
});

test('renderHtml shows an empty state when there are no new markets', () => {
  const summary = buildSummary([], { threshold: 3000, generatedAt: new Date(), isFirstRun: true });
  const html = renderHtml(summary);
  assert.ok(html.includes('No newly added markets'));
});
