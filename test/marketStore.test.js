import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  reconcileSeen,
  selectWithinWindow,
  reconcileAll,
  addedAt,
} from '../src/marketStore.js';
import { normalizeEvents, normalizeSubmarkets } from '../src/normalize.js';
import { rawEvents } from './fixtures.js';

function emptyState() {
  return { version: 1, firstRunAt: null, lastRunAt: null, seen: {}, seenSubmarkets: {} };
}

test('reconcileSeen annotates firstSeenAt and preserves it across runs', () => {
  const t1 = new Date('2026-08-31T12:00:00Z');
  const items = normalizeEvents(rawEvents(t1.toISOString()));
  const first = reconcileSeen({}, items, { now: t1 });

  assert.equal(first.items.length, items.length);
  for (const m of first.items) assert.equal(m.firstSeenAt, t1.toISOString());
  assert.equal(Object.keys(first.nextSeen).length, items.length);

  const t2 = new Date('2026-09-05T12:00:00Z');
  const second = reconcileSeen(first.nextSeen, items, { now: t2 });
  // firstSeenAt stays at the original observation time; lastSeenAt advances.
  for (const m of second.items) assert.equal(m.firstSeenAt, t1.toISOString());
  assert.equal(second.nextSeen['1'].lastSeenAt, t2.toISOString());
});

test('reconcileSeen carries forward items that dropped off the feed', () => {
  const t1 = new Date('2026-08-31T12:00:00Z');
  const items = normalizeEvents(rawEvents(t1.toISOString()));
  const first = reconcileSeen({}, items, { now: t1 });

  const t2 = new Date('2026-09-01T12:00:00Z'); // one day later, empty feed
  const second = reconcileSeen(first.nextSeen, [], { now: t2 });
  assert.equal(Object.keys(second.nextSeen).length, items.length);
});

test('addedAt prefers createdAt, falls back to firstSeenAt', () => {
  assert.equal(addedAt({ createdAt: '2026-01-01T00:00:00Z' }), Date.parse('2026-01-01T00:00:00Z'));
  assert.equal(addedAt({ firstSeenAt: '2026-02-01T00:00:00Z' }), Date.parse('2026-02-01T00:00:00Z'));
  assert.ok(Number.isNaN(addedAt({})));
});

test('selectWithinWindow keeps recent items and drops old ones', () => {
  const now = new Date('2026-08-31T12:00:00Z');
  const items = normalizeEvents(rawEvents(now.toISOString())); // id 3 was created in 2020
  const recent = selectWithinWindow(items, { now, windowDays: 7, threshold: 3000 });
  assert.deepEqual(recent.map((m) => m.id).sort(), ['1', '2', '4', '5']);
});

test('selectWithinWindow with showOnlyHighlighted keeps only over-threshold', () => {
  const now = new Date('2026-08-31T12:00:00Z');
  const items = normalizeEvents(rawEvents(now.toISOString()));
  const recent = selectWithinWindow(items, {
    now,
    windowDays: 7,
    threshold: 3000,
    showOnlyHighlighted: true,
  });
  // Only id 1 (5000) is both within the window and over 3000.
  assert.deepEqual(recent.map((m) => m.id), ['1']);
});

test('selectWithinWindow uses firstSeenAt when createdAt is missing', () => {
  const now = new Date('2026-08-31T12:00:00Z');
  const items = [
    { id: 'x', volume: 100, createdAt: null, firstSeenAt: now.toISOString() },
    { id: 'y', volume: 100, createdAt: null, firstSeenAt: '2020-01-01T00:00:00Z' },
  ];
  const recent = selectWithinWindow(items, { now, windowDays: 7, threshold: 3000 });
  assert.deepEqual(recent.map((m) => m.id), ['x']);
});

test('reconcileAll returns both seen maps and annotated lists', () => {
  const now = new Date('2026-08-31T12:00:00Z');
  const raw = rawEvents(now.toISOString());
  const out = reconcileAll(
    emptyState(),
    { events: normalizeEvents(raw), submarkets: normalizeSubmarkets(raw) },
    { now },
  );
  assert.equal(out.events.length, 5);
  assert.equal(out.submarkets.length, 4);
  assert.equal(Object.keys(out.nextState.seen).length, 5);
  assert.equal(Object.keys(out.nextState.seenSubmarkets).length, 4);
});
