import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSummary } from '../src/summary.js';
import { renderHtml, formatUsd, escapeHtml } from '../src/render.js';
import { normalizeEvents, normalizeSubmarkets } from '../src/normalize.js';
import { rawEvents } from './fixtures.js';

function summaryFromFixtures() {
  const now = new Date('2026-08-31T12:00:00Z');
  const raw = rawEvents(now.toISOString());
  const events = normalizeEvents(raw);
  const submarkets = normalizeSubmarkets(raw);
  return buildSummary(
    { events, submarkets },
    {
      threshold: 3000,
      scheduleHours: 6,
      generatedAt: now,
      tagSlug: 'geopolitics',
      eventsTracked: events.length,
      submarketsTracked: submarkets.length,
    },
  );
}

test('events over the threshold are highlighted and sorted to the top', () => {
  const { events } = summaryFromFixtures();
  // id 1 (5000) and id 3 (3500.5) are over 3000.
  assert.equal(events.stats.highlightedCount, 2);

  const flags = events.items.map((m) => m.highlighted);
  const firstNonHighlighted = flags.indexOf(false);
  assert.ok(!flags.slice(firstNonHighlighted).includes(true)); // all HL first

  assert.equal(events.items[0].id, '1'); // 5000
  assert.equal(events.items[1].id, '3'); // 3500.5
});

test('sub-markets are a separate section with the same highlight rule', () => {
  const { submarkets } = summaryFromFixtures();
  // 4 sub-markets total (11,21,41,42); only 11 (5000) is over 3000.
  assert.equal(submarkets.stats.newCount, 4);
  assert.equal(submarkets.stats.highlightedCount, 1);
  assert.equal(submarkets.items[0].id, '11'); // highlighted, on top
  assert.equal(submarkets.items[0].highlighted, true);
  assert.equal(submarkets.items[1].highlighted, false);
});

test('threshold is exclusive (exactly 3000 is not highlighted)', () => {
  const summary = buildSummary(
    { events: [{ id: 'a', title: 'exact', volume: 3000, tags: [], url: '#' }], submarkets: [] },
    { threshold: 3000, generatedAt: new Date() },
  );
  assert.equal(summary.events.items[0].highlighted, false);
});

test('stats compute counts and totals per section', () => {
  const { events, submarkets } = summaryFromFixtures();
  assert.equal(events.stats.newCount, 5);
  assert.equal(events.stats.topVolume, 5000);
  assert.equal(events.stats.totalVolume, Math.round((5000 + 1200 + 3500.5 + 2600 + 10) * 100) / 100);

  assert.equal(submarkets.stats.topVolume, 5000);
  assert.equal(submarkets.stats.totalVolume, 5000 + 1200 + 2000 + 600);
});

test('renderHtml renders both sections, highlights, and escapes untrusted text', () => {
  const summary = summaryFromFixtures();
  const html = renderHtml(summary, { now: new Date('2026-08-31T12:00:00Z') });

  assert.ok(html.includes('<!doctype html>'));
  assert.ok(html.includes('Newly added markets'));
  assert.ok(html.includes('Newly added sub-markets'));
  assert.ok(html.includes('class="card highlight"'), 'expected highlighted cards');
  assert.ok(html.includes(formatUsd(3000)), 'legend shows the threshold');
  assert.ok(html.includes('62%'), 'sub-market outcome prices are shown');

  // XSS fixture must be escaped, not rendered as a tag.
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes(escapeHtml('Danger <script>alert(1)</script> & "quotes"')));
});

test('renderHtml shows an empty state when a section has no new items', () => {
  const summary = buildSummary(
    { events: [], submarkets: [] },
    { threshold: 3000, generatedAt: new Date(), isFirstRun: true },
  );
  const html = renderHtml(summary);
  assert.ok(html.includes('No newly added markets'));
  assert.ok(html.includes('No newly added sub-markets'));
});

test('renderHtml includes the Update button, window wording, and refresh URL', () => {
  const summary = buildSummary(
    { events: [], submarkets: [] },
    {
      threshold: 3000,
      windowDays: 7,
      generatedAt: new Date('2026-08-31T12:00:00Z'),
      refreshUrl: 'https://github.com/o/r/actions/workflows/geopolitics-summary.yml',
    },
  );
  const html = renderHtml(summary);
  assert.ok(html.includes('id="update-btn"'), 'has the Update button');
  assert.ok(html.includes('Update now'));
  assert.ok(html.includes('last 7 days'), 'header states the window');
  assert.ok(
    html.includes('https://github.com/o/r/actions/workflows/geopolitics-summary.yml'),
    'embeds the workflow URL for the Pages fallback',
  );
});
