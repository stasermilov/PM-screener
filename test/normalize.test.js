import { test } from 'node:test';
import assert from 'node:assert/strict';

import { toNumber, toIso, eventVolume, normalizeEvent, normalizeEvents } from '../src/normalize.js';
import { rawEvents } from './fixtures.js';

test('toNumber coerces numbers, strings, and junk', () => {
  assert.equal(toNumber(1234), 1234);
  assert.equal(toNumber('3,500.5'), 3500.5);
  assert.equal(toNumber('$1,000'), 1000);
  assert.equal(toNumber('nope'), 0);
  assert.equal(toNumber(undefined), 0);
  assert.equal(toNumber(NaN), 0);
});

test('toIso normalizes dates and rejects bad values', () => {
  assert.equal(toIso('2026-01-01T00:00:00Z'), '2026-01-01T00:00:00.000Z');
  assert.equal(toIso('not-a-date'), null);
  assert.equal(toIso(null), null);
});

test('eventVolume falls back to summing child markets', () => {
  const events = rawEvents();
  const summed = events.find((e) => e.id === 4);
  assert.equal(eventVolume(summed), 2600); // 2000 + 600
  const direct = events.find((e) => e.id === 3);
  assert.equal(eventVolume(direct), 3500.5);
});

test('normalizeEvent builds the expected shape and URL', () => {
  const [ev] = rawEvents();
  const m = normalizeEvent(ev);
  assert.equal(m.id, '1');
  assert.equal(m.title, 'Ukraine ceasefire in 2026?');
  assert.equal(m.url, 'https://polymarket.com/event/ukraine-ceasefire-2026');
  assert.equal(m.volume, 5000);
  assert.deepEqual(m.tags, ['Geopolitics', 'Ukraine']);
  assert.equal(m.subMarketCount, 1);
});

test('normalizeEvents de-dupes and drops unusable entries', () => {
  const events = [...rawEvents(), { foo: 'bar' }, rawEvents()[0]];
  const out = normalizeEvents(events);
  const ids = out.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length); // unique
  assert.equal(out.length, 5); // 5 valid fixtures, dupe + junk removed
});
