import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeNewlyAdded, computeNewlyAddedAll } from '../src/marketStore.js';
import { normalizeEvents, normalizeSubmarkets } from '../src/normalize.js';
import { rawEvents } from './fixtures.js';

function emptyState() {
  return { version: 1, firstRunAt: null, lastRunAt: null, seen: {} };
}

test('first run only flags markets created within the lookback window', () => {
  const now = new Date('2026-08-31T12:00:00Z');
  const markets = normalizeEvents(rawEvents(now.toISOString()));
  const { newlyAdded, nextState, isFirstRun } = computeNewlyAdded(emptyState(), markets, {
    now,
    firstRunLookbackHours: 6,
  });

  assert.equal(isFirstRun, true);
  // Fixture id 3 was created in 2020 -> excluded from first-run "new".
  const ids = newlyAdded.map((m) => m.id).sort();
  assert.deepEqual(ids, ['1', '2', '4', '5']);
  // Every current market is recorded as seen regardless.
  assert.equal(Object.keys(nextState.seen).length, markets.length);
});

test('subsequent run flags any unseen market as newly added', () => {
  const now = new Date('2026-08-31T12:00:00Z');
  const first = normalizeEvents(rawEvents(now.toISOString()));
  const seeded = computeNewlyAdded(emptyState(), first, { now, firstRunLookbackHours: 6 });

  // Next cycle: same markets plus a brand new one with an OLD createdAt.
  const later = new Date('2026-08-31T18:00:00Z');
  const withNew = [
    ...first,
    {
      id: '99',
      slug: 'brand-new',
      title: 'Brand new market',
      volume: 8000,
      createdAt: '2019-01-01T00:00:00Z',
      tags: ['geopolitics'],
    },
  ];
  const { newlyAdded, isFirstRun } = computeNewlyAdded(seeded.nextState, withNew, {
    now: later,
    firstRunLookbackHours: 6,
  });

  assert.equal(isFirstRun, false);
  // Even though createdAt is old, it's unseen -> new. Nothing else re-flagged.
  assert.deepEqual(newlyAdded.map((m) => m.id), ['99']);
});

test('computeNewlyAddedAll diffs events and sub-markets independently', () => {
  const now = new Date('2026-08-31T12:00:00Z');
  const raw = rawEvents(now.toISOString());
  const events = normalizeEvents(raw);
  const submarkets = normalizeSubmarkets(raw);

  // First run seeds both baselines from the lookback window.
  const first = computeNewlyAddedAll(
    emptyState(),
    { events, submarkets },
    { now, firstRunLookbackHours: 6 },
  );
  assert.equal(first.isFirstRun, true);
  assert.equal(Object.keys(first.nextState.seen).length, events.length);
  assert.equal(Object.keys(first.nextState.seenSubmarkets).length, submarkets.length);

  // Next cycle: add a brand new event carrying a brand new sub-market.
  const later = new Date('2026-08-31T18:00:00Z');
  const raw2 = [
    ...raw,
    {
      id: 77,
      slug: 'fresh-event',
      title: 'A fresh event',
      volume: 4200,
      createdAt: later.toISOString(),
      tags: [{ slug: 'geopolitics' }],
      markets: [{ id: 771, question: 'Fresh sub-market?', volumeNum: 4200 }],
    },
  ];
  const second = computeNewlyAddedAll(
    first.nextState,
    { events: normalizeEvents(raw2), submarkets: normalizeSubmarkets(raw2) },
    { now: later, firstRunLookbackHours: 6 },
  );

  assert.equal(second.isFirstRun, false);
  assert.deepEqual(second.newlyAddedEvents.map((m) => m.id), ['77']);
  assert.deepEqual(second.newlyAddedSubmarkets.map((m) => m.id), ['771']);
});

test('firstSeenAt is preserved for markets already known', () => {
  const now = new Date('2026-08-31T12:00:00Z');
  const markets = normalizeEvents(rawEvents(now.toISOString()));
  const first = computeNewlyAdded(emptyState(), markets, { now, firstRunLookbackHours: 6 });
  const firstSeen = first.nextState.seen['1'].firstSeenAt;

  const later = new Date('2026-09-01T00:00:00Z');
  const second = computeNewlyAdded(first.nextState, markets, {
    now: later,
    firstRunLookbackHours: 6,
  });
  assert.equal(second.nextState.seen['1'].firstSeenAt, firstSeen);
  assert.equal(second.newlyAdded.length, 0);
});
