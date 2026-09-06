import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildSummary, summarize } from '../src/summary.js';
import { renderHtml, formatUsd, escapeHtml } from '../src/render.js';
import { normalizeEvents } from '../src/normalize.js';
import { rawEvents } from './fixtures.js';

const GEN = new Date('2026-08-31T12:00:00Z');

function sampleSummary() {
  const geo = {
    slug: 'geopolitics', label: 'Geopolitics', emoji: '🌍', eventsTracked: 5,
    freshEvents: normalizeEvents(rawEvents(GEN.toISOString())), earlierEvents: [],
  };
  const tech = {
    slug: 'tech', label: 'Tech', emoji: '💻', eventsTracked: 0, freshEvents: [], earlierEvents: [],
  };
  const movers = {
    day: { total: 1, items: [{ id: 'mk:m1', rawId: 'm1', question: 'Mover A', url: '#', chance: 0.55, change: 0.25, from: 0.3, to: 0.55, volume: 5000, categoryLabel: 'Tech', categoryEmoji: '💻' }] },
    threeDay: { total: 0, items: [] },
  };
  const highChance = {
    total: 1, items: [{ id: 'mk:h1', rawId: 'h1', question: 'High A', url: '#', chance: 0.8, volume: 4000, categoryLabel: 'Politics', categoryEmoji: '🏛️' }],
  };
  const excluded = [
    { kind: 'event', id: 'ev:x1', title: 'How many times will Elon tweet?', url: '#', volume: 100, reason: 'X / Twitter post', reasonId: 'x-posts', matched: 'tweet', category: 'tech', categoryLabel: 'Tech', categoryEmoji: '💻' },
  ];
  return buildSummary(
    { categories: [geo, tech], movers, highChance, excluded },
    {
      threshold: 3000, windowDays: 7, freshDays: 2, generatedAt: GEN,
      moverDayPct: 20, mover3dPct: 30, highMin: 0.6, highMax: 0.92, categoryPageSize: 100,
      refreshUrl: 'https://github.com/o/r/actions/workflows/geopolitics-summary.yml',
    },
  );
}

test('each category highlights over-threshold markets and pins them on top', () => {
  const s = sampleSummary();
  const geo = s.categories[0];
  assert.equal(geo.fresh.stats.highlightedCount, 2); // id 1 (5000) and id 3 (3500.5)
  assert.equal(geo.fresh.items[0].id, '1');
  assert.equal(geo.totals.windowCount, 5);
});

test('summarize produces compact per-category + movers/high-chance stats', () => {
  const s = summarize(sampleSummary());
  assert.equal(s.categories.length, 2);
  assert.equal(s.categories[0].slug, 'geopolitics');
  assert.equal(s.moversDay, 1);
  assert.equal(s.highChance, 1);
});

test('renderHtml builds a tab per category plus Movers/High chance/Watchlist', () => {
  const html = renderHtml(sampleSummary(), { now: GEN });
  assert.ok(html.includes('data-view="view-cat-geopolitics"'));
  assert.ok(html.includes('data-view="view-cat-tech"'));
  assert.ok(html.includes('data-view="view-movers"'));
  assert.ok(html.includes('data-view="view-highchance"'));
  assert.ok(html.includes('data-view="view-watch"'));
  assert.ok(html.includes('id="view-cat-geopolitics"'));
  assert.ok(html.includes('id="view-movers"'));
});

test('renderHtml shows movers with a points delta and high-chance with a probability', () => {
  const html = renderHtml(sampleSummary(), { now: GEN });
  assert.ok(html.includes('Movers'));
  assert.ok(html.includes('+25 pts'), 'mover shows the points change');
  assert.ok(html.includes('55%'), 'mover shows the current chance');
  assert.ok(html.includes('High chance'));
  assert.ok(html.includes('80%'), 'high-chance shows the probability');
});

test('renderHtml has watchlist ticks for both events and markets, and escapes text', () => {
  const html = renderHtml(sampleSummary(), { now: GEN });
  assert.ok(html.includes('data-id="ev:1"'), 'event card tick');
  assert.ok(html.includes('data-id="mk:m1"'), 'mover card tick');
  assert.ok(html.includes('data-id="mk:h1"'), 'high-chance card tick');
  assert.ok(html.includes('localStorage'));
  assert.ok(html.includes('id="update-btn"'));
  assert.ok(html.includes('https://github.com/o/r/actions/workflows/geopolitics-summary.yml'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes(escapeHtml('Danger <script>alert(1)</script> & "quotes"')));
});

test('an empty category shows a helpful "no markets" note', () => {
  const html = renderHtml(sampleSummary(), { now: GEN });
  assert.ok(html.includes('No open markets found'));
  assert.ok(html.includes(formatUsd(3000)));
});

test('Excluded tab lists excluded markets with reason and matched phrase', () => {
  const s = sampleSummary();
  assert.equal(s.excluded.length, 1);
  const html = renderHtml(s, { now: GEN });
  assert.ok(html.includes('data-view="view-excluded"'), 'has an Excluded tab');
  assert.ok(html.includes('id="view-excluded"'));
  assert.ok(html.includes('How many times will Elon tweet?'), 'lists the excluded market');
  assert.ok(html.includes('X / Twitter post'), 'shows the reason');
  assert.ok(html.includes('<code>tweet</code>'), 'shows the matched phrase');
});

test('Movers/High-chance/Excluded paginate when over 100 items', () => {
  const mkMovers = (n) => Array.from({ length: n }, (_, i) => ({
    id: `mk:mv${i}`, rawId: `mv${i}`, question: `Mover ${i}`, url: '#',
    chance: 0.5, change: 0.25, from: 0.25, to: 0.5, volume: 5000,
    categoryLabel: 'Tech', categoryEmoji: '💻',
  }));
  const mkHigh = (n) => Array.from({ length: n }, (_, i) => ({
    id: `mk:hc${i}`, rawId: `hc${i}`, question: `High ${i}`, url: '#',
    chance: 0.8, volume: 4000, categoryLabel: 'Politics', categoryEmoji: '🏛️',
  }));
  const mkExcl = (n) => Array.from({ length: n }, (_, i) => ({
    kind: 'event', id: `ev:ex${i}`, title: `Excluded ${i}`, url: '#', volume: 100,
    reason: 'X / Twitter post', reasonId: 'x-posts', matched: 'tweet',
    category: 'tech', categoryLabel: 'Tech', categoryEmoji: '💻',
  }));
  const s = buildSummary({
    categories: [],
    movers: { day: { total: 120, items: mkMovers(120) }, threeDay: { total: 0, items: [] } },
    highChance: { total: 110, items: mkHigh(110) },
    excluded: mkExcl(105),
  }, { threshold: 3000, windowDays: 7, freshDays: 2, categoryPageSize: 100, generatedAt: GEN });
  const html = renderHtml(s, { now: GEN });
  assert.ok(html.includes('data-pager="pg-movers-day"'), 'movers 24h paginated');
  assert.ok(html.includes('data-pager="pg-highchance"'), 'high-chance paginated');
  assert.ok(html.includes('data-pager="pg-excluded"'), 'excluded paginated');
});

test('a category with more than 100 markets renders pagination chips', () => {
  const many = Array.from({ length: 130 }, (_, i) => ({
    id: String(1000 + i), title: `Market ${i}`, url: '#', volume: 10, tags: [], createdAt: GEN.toISOString(),
  }));
  const cat = {
    slug: 'politics', label: 'Politics', emoji: '🏛️', eventsTracked: 130,
    freshEvents: many.slice(0, 10), earlierEvents: many.slice(10),
  };
  const s = buildSummary({ categories: [cat] }, { threshold: 3000, windowDays: 7, freshDays: 2, categoryPageSize: 100, generatedAt: GEN });
  const html = renderHtml(s, { now: GEN });
  assert.ok(html.includes('class="pager"'), 'renders a pager');
  assert.ok(html.includes('data-pager="pg-politics"'));
  assert.ok(html.includes('>1–100<'), 'first page chip');
  assert.ok(html.includes('>101–130<'), 'second page chip');
});
