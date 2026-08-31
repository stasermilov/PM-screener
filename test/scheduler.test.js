import { test } from 'node:test';
import assert from 'node:assert/strict';

import { msUntilNextTick } from '../src/scheduler.js';

test('msUntilNextTick aligns to fixed UTC boundaries', () => {
  // 6-hour period: boundaries at 00:00, 06:00, 12:00, 18:00 UTC.
  const at13 = new Date('2026-08-31T13:00:00Z');
  const ms = msUntilNextTick(6, at13);
  // Next boundary is 18:00 -> 5 hours away.
  assert.equal(ms, 5 * 3600 * 1000);
});

test('msUntilNextTick never returns less than 1s', () => {
  const onBoundary = new Date('2026-08-31T12:00:00Z');
  const ms = msUntilNextTick(6, onBoundary);
  assert.ok(ms >= 1000);
  assert.ok(ms <= 6 * 3600 * 1000);
});
