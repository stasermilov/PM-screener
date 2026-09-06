import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  toNumber,
  toIso,
  eventVolume,
  normalizeEvent,
  normalizeEvents,
  parseJsonArray,
  marketChance,
  extractPricedMarkets,
} from '../src/normalize.js';
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

test('parseJsonArray tolerates strings, arrays, and junk', () => {
  assert.deepEqual(parseJsonArray('["Yes","No"]'), ['Yes', 'No']);
  assert.deepEqual(parseJsonArray(['a', 'b']), ['a', 'b']);
  assert.deepEqual(parseJsonArray('nope'), []);
  assert.deepEqual(parseJsonArray(undefined), []);
});

test('marketChance derives the Yes probability with sensible fallbacks', () => {
  assert.equal(marketChance({ outcomes: '["Yes","No"]', outcomePrices: '["0.62","0.38"]' }), 0.62);
  assert.equal(marketChance({ outcomes: '["No","Yes"]', outcomePrices: '["0.3","0.7"]' }), 0.7);
  assert.equal(marketChance({ outcomes: '["No"]', outcomePrices: '["0.3"]' }), 0.7); // 1 - No
  assert.equal(marketChance({ lastTradePrice: 0.55 }), 0.55);
  assert.equal(marketChance({}), null);
});

test('extractPricedMarkets flattens markets and tags them with the category', () => {
  const cat = { slug: 'geopolitics', label: 'Geopolitics', emoji: '🌍' };
  const markets = extractPricedMarkets(rawEvents(), cat);
  // events 1,2,4 have markets (1+1+2 = 4); events 3,5 have none.
  assert.deepEqual(markets.map((m) => m.rawId).sort(), ['11', '21', '41', '42']);
  const m11 = markets.find((m) => m.rawId === '11');
  assert.equal(m11.id, 'mk:11');
  assert.equal(m11.chance, 0.62);
  assert.equal(m11.category, 'geopolitics');
  assert.equal(m11.categoryLabel, 'Geopolitics');
  // markets without price info have a null chance (excluded from movers/high-chance).
  assert.equal(markets.find((m) => m.rawId === '41').chance, null);
});
