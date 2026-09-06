// Price-history tracking and the Movers / High-chance analyses.
//
// Polymarket's Gamma API doesn't expose an arbitrary-window price change, so the
// screener records a small price snapshot for each market on every run (in the
// state file) and computes 24h / 3-day moves from that history. The 3-day figure
// therefore "warms up" over ~3 days of runs. All functions here are pure.

const round3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Append this run's prices to the history and prune. Returns a new prices map
 * `{ [rawId]: [[epochSeconds, price], ...] }` (oldest → newest).
 *
 * @param {object} prev       previous prices map
 * @param {object[]} markets  priced market records ({rawId, chance, volume})
 * @param {object} opts       {now, minVolume, maxAgeHours, maxPoints}
 */
export function recordPrices(prev, markets, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const nowSec = Math.floor(now.getTime() / 1000);
  const minVolume = opts.minVolume ?? 1000;
  const maxAgeSec = (opts.maxAgeHours ?? 90) * 3600;
  const maxPoints = opts.maxPoints ?? 20;
  const cutoff = nowSec - maxAgeSec;

  const prune = (arr) => {
    const kept = (arr || []).filter((p) => Array.isArray(p) && p[0] >= cutoff);
    return kept.length > maxPoints ? kept.slice(kept.length - maxPoints) : kept;
  };

  const next = {};

  // Append current snapshots for markets we track (finite chance, enough volume).
  const updated = new Set();
  for (const m of markets || []) {
    if (m.chance == null || !Number.isFinite(m.chance)) continue;
    if (Number(m.volume) < minVolume) continue;
    const arr = prune(prev?.[m.rawId]);
    arr.push([nowSec, round3(m.chance)]);
    next[m.rawId] = arr.length > maxPoints ? arr.slice(arr.length - maxPoints) : arr;
    updated.add(m.rawId);
  }

  // Carry forward still-recent history for markets not present this run, so a
  // brief disappearance doesn't reset the series; drop fully-stale ones.
  for (const [id, arr] of Object.entries(prev || {})) {
    if (updated.has(id)) continue;
    const kept = prune(arr);
    if (kept.length) next[id] = kept;
  }

  return next;
}

/**
 * Change in probability between now (the newest point) and roughly `hoursAgo`
 * ago. Returns {change, from, to, ageHours} or null if there's no snapshot in
 * the acceptable age window.
 */
export function changeOver(points, hoursAgo, maxGapHours) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const last = points[points.length - 1];
  const nowSec = last[0];
  const pNow = last[1];
  const targetAge = hoursAgo * 3600;
  const maxGap = maxGapHours * 3600;

  let best = null;
  let bestDelta = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const age = nowSec - points[i][0];
    const delta = Math.abs(age - targetAge);
    if (delta <= maxGap && delta < bestDelta) {
      best = points[i];
      bestDelta = delta;
    }
  }
  if (!best) return null;
  return { change: pNow - best[1], from: best[1], to: pNow, ageHours: (nowSec - best[0]) / 3600 };
}

function sortByAbsChange(a, b) {
  return Math.abs(b.change) - Math.abs(a.change);
}

/**
 * Build the Movers lists: markets whose probability moved at least the given
 * number of percentage points over 24h and over 3 days.
 */
export function buildMovers(markets, prices, opts = {}) {
  const dayItems = [];
  const threeDayItems = [];

  for (const m of markets || []) {
    if (m.chance == null || !Number.isFinite(m.chance)) continue;
    const hist = prices?.[m.rawId];

    // 24h: prefer our own history, fall back to Gamma's own 1-day change.
    let day = changeOver(hist, opts.dayHours ?? 24, opts.dayMaxGapHours ?? 14);
    if (!day && m.gammaDayChange != null && Number.isFinite(m.gammaDayChange)) {
      day = { change: m.gammaDayChange, from: m.chance - m.gammaDayChange, to: m.chance };
    }
    if (day && Math.abs(day.change) * 100 >= (opts.dayPct ?? 20)) {
      dayItems.push({ ...m, change: day.change, from: day.from, to: m.chance, window: '24h' });
    }

    // 3-day: history only.
    const td = changeOver(hist, opts.threeDayHours ?? 72, opts.threeDayMaxGapHours ?? 30);
    if (td && Math.abs(td.change) * 100 >= (opts.threeDayPct ?? 30)) {
      threeDayItems.push({ ...m, change: td.change, from: td.from, to: m.chance, window: '3d' });
    }
  }

  dayItems.sort(sortByAbsChange);
  threeDayItems.sort(sortByAbsChange);

  return {
    day: { total: dayItems.length, items: dayItems },
    threeDay: { total: threeDayItems.length, items: threeDayItems },
  };
}

/** Build the High-chance list: markets whose Yes price is within [min, max]. */
export function buildHighChance(markets, opts = {}) {
  const min = opts.min ?? 0.6;
  const max = opts.max ?? 0.92;

  const items = (markets || [])
    .filter((m) => m.chance != null && Number.isFinite(m.chance) && m.chance >= min && m.chance <= max)
    .sort((a, b) => b.chance - a.chance || Number(b.volume) - Number(a.volume));

  return { total: items.length, items };
}
