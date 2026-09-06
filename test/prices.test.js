import { test } from 'node:test';
import assert from 'node:assert/strict';

import { recordPrices, changeOver, buildMovers, buildHighChance } from '../src/prices.js';

const SEC = (iso) => Math.floor(Date.parse(iso) / 1000);

test('recordPrices tracks only markets above the volume floor and appends points', () => {
  const now = new Date('2026-09-06T12:00:00Z');
  const p1 = recordPrices({}, [
    { rawId: 'a', chance: 0.5, volume: 5000 },
    { rawId: 'b', chance: 0.6, volume: 100 }, // below floor -> ignored
    { rawId: 'c', chance: null, volume: 9000 }, // no price -> ignored
  ], { now, minVolume: 1000, maxAgeHours: 90, maxPoints: 20 });

  assert.deepEqual(Object.keys(p1).sort(), ['a']);
  assert.equal(p1.a.length, 1);
  assert.equal(p1.a[0][1], 0.5);

  const later = new Date('2026-09-06T18:00:00Z');
  const p2 = recordPrices(p1, [{ rawId: 'a', chance: 0.55, volume: 5000 }], {
    now: later, minVolume: 1000, maxAgeHours: 90, maxPoints: 20,
  });
  assert.equal(p2.a.length, 2);
  assert.equal(p2.a[1][1], 0.55);
});

test('recordPrices prunes points older than the max age', () => {
  const now = new Date('2026-09-06T12:00:00Z');
  const old = [[SEC('2026-08-01T00:00:00Z'), 0.4]]; // ~36 days old
  const p = recordPrices({ a: old }, [{ rawId: 'a', chance: 0.5, volume: 5000 }], {
    now, minVolume: 1000, maxAgeHours: 90, maxPoints: 20,
  });
  assert.equal(p.a.length, 1); // old point pruned, only the fresh one remains
  assert.equal(p.a[0][1], 0.5);
});

test('changeOver finds a snapshot near the target age', () => {
  const nowSec = SEC('2026-09-06T12:00:00Z');
  const points = [[nowSec - 24 * 3600, 0.3], [nowSec, 0.55]];
  const c = changeOver(points, 24, 14);
  assert.ok(Math.abs(c.change - 0.25) < 1e-9);
  assert.equal(c.from, 0.3);
  assert.equal(changeOver([[nowSec, 0.5]], 24, 14), null); // needs 2 points
  assert.equal(changeOver([[nowSec - 3 * 3600, 0.5], [nowSec, 0.55]], 24, 14), null); // too recent
});

test('buildMovers flags 24h (with Gamma fallback) and 3-day movers', () => {
  const nowSec = SEC('2026-09-06T12:00:00Z');
  const prices = {
    m1: [[nowSec - 24 * 3600, 0.3], [nowSec, 0.55]], // +25 pts in 24h
    m2: [[nowSec - 72 * 3600, 0.2], [nowSec - 24 * 3600, 0.4], [nowSec, 0.55]], // +15/24h, +35/3d
  };
  const markets = [
    { rawId: 'm1', id: 'mk:m1', chance: 0.55, volume: 5000, question: 'M1' },
    { rawId: 'm2', id: 'mk:m2', chance: 0.55, volume: 5000, question: 'M2' },
    { rawId: 'm3', id: 'mk:m3', chance: 0.55, volume: 5000, question: 'M3', gammaDayChange: 0.25 },
  ];
  const mv = buildMovers(markets, prices, {
    dayPct: 20, dayHours: 24, dayMaxGapHours: 14,
    threeDayPct: 30, threeDayHours: 72, threeDayMaxGapHours: 30, limit: 100,
  });
  assert.deepEqual(mv.day.items.map((m) => m.rawId).sort(), ['m1', 'm3']); // m2 only +15/24h
  assert.deepEqual(mv.threeDay.items.map((m) => m.rawId), ['m2']);
});

test('buildHighChance keeps markets inside the price band, sorted by chance', () => {
  const markets = [
    { rawId: 'a', chance: 0.55, volume: 100 },
    { rawId: 'b', chance: 0.7, volume: 100 },
    { rawId: 'c', chance: 0.9, volume: 100 },
    { rawId: 'd', chance: 0.95, volume: 100 },
    { rawId: 'e', chance: null, volume: 100 },
  ];
  const h = buildHighChance(markets, { min: 0.6, max: 0.92, limit: 100 });
  assert.deepEqual(h.items.map((m) => m.rawId), ['c', 'b']); // 0.9 then 0.7
  assert.equal(h.total, 2);
});
