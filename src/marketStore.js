// Persistence + diffing for detecting *newly added* markets between runs.
//
// The screener remembers every market id it has ever seen (in a small JSON
// state file). On each refresh it compares the freshly fetched set against that
// memory: anything not seen before is "newly added". The first run has no
// memory, so it seeds "newly added" from markets created within a short
// look-back window to avoid reporting the entire catalogue at once.

import fs from 'node:fs/promises';
import path from 'node:path';

const STATE_VERSION = 1;
const PRUNE_AFTER_DAYS = 45; // forget markets absent this long to bound file size

function emptyState() {
  return {
    version: STATE_VERSION,
    firstRunAt: null,
    lastRunAt: null,
    seen: {}, // event-level markets
    seenSubmarkets: {}, // individual sub-markets
  };
}

export async function loadState(stateFile) {
  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyState();
    return {
      ...emptyState(),
      ...parsed,
      seen: parsed.seen || {},
      seenSubmarkets: parsed.seenSubmarkets || {},
    };
  } catch (err) {
    if (err.code === 'ENOENT') return emptyState();
    throw err;
  }
}

export async function saveState(stateFile, state) {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Reconcile a single "seen" map with the current items. Annotates every item
 * with a stable `firstSeenAt` (when the screener first observed it), and returns
 * the advanced seen map (current items refreshed, absent ones carried forward
 * until they age out). Pure — does no I/O.
 *
 * Works for both events and sub-markets — items only need `id`, `createdAt`,
 * and a display title (`title` or `question`).
 */
export function reconcileSeen(seen, items, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const nowIso = now.toISOString();
  const prior = seen || {};

  const annotated = [];
  const nextSeen = {};

  for (const m of items || []) {
    const firstSeenAt = prior[m.id]?.firstSeenAt || nowIso;
    annotated.push({ ...m, firstSeenAt });
    nextSeen[m.id] = {
      firstSeenAt,
      createdAt: m.createdAt || null,
      title: m.title || m.question || m.id,
      lastSeenAt: nowIso,
    };
  }

  // Carry forward recently-seen items that dropped off the current list so a
  // stable firstSeenAt survives brief disappearances, until they age out.
  for (const [id, entry] of Object.entries(prior)) {
    if (nextSeen[id]) continue;
    const ref = entry.lastSeenAt || entry.firstSeenAt || nowIso;
    const ageMs = now.getTime() - new Date(ref).getTime();
    if (ageMs <= PRUNE_AFTER_DAYS * 86400 * 1000) nextSeen[id] = entry;
  }

  return { items: annotated, nextSeen };
}

/** The time a market is considered "added": its Gamma createdAt, else when the
 *  screener first saw it. */
export function addedAt(item) {
  const created = item.createdAt ? new Date(item.createdAt).getTime() : NaN;
  if (Number.isFinite(created)) return created;
  const seen = item.firstSeenAt ? new Date(item.firstSeenAt).getTime() : NaN;
  return Number.isFinite(seen) ? seen : NaN;
}

/**
 * Select the items added within the rolling window (in days), optionally
 * restricting to those over the volume threshold. Pure.
 */
export function selectWithinWindow(items, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const windowMs = (opts.windowDays ?? 7) * 86400 * 1000;
  const cutoff = now.getTime() - windowMs;
  const threshold = opts.threshold ?? 3000;
  const onlyOver = Boolean(opts.showOnlyHighlighted);

  return (items || []).filter((m) => {
    const t = addedAt(m);
    if (!Number.isFinite(t) || t < cutoff) return false;
    if (onlyOver && !(Number(m.volume) > threshold)) return false;
    return true;
  });
}

/**
 * Split already-windowed items into a "fresh" group (added within freshDays)
 * and an "earlier" group (the rest). Disjoint by construction, so nothing is
 * shown twice. Pure.
 */
export function partitionByFreshness(items, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const freshMs = (opts.freshDays ?? 2) * 86400 * 1000;
  const cutoff = now.getTime() - freshMs;
  const fresh = [];
  const earlier = [];
  for (const m of items || []) {
    const t = addedAt(m);
    if (Number.isFinite(t) && t >= cutoff) fresh.push(m);
    else earlier.push(m);
  }
  return { fresh, earlier };
}

/**
 * Reconcile events and sub-markets against their own seen maps and return one
 * next state carrying both. Attaches the annotated item lists for the caller to
 * window-filter.
 */
export function reconcileAll(state, { events = [], submarkets = [] }, opts = {}) {
  const nowIso = (opts.now instanceof Date ? opts.now : new Date()).toISOString();
  const ev = reconcileSeen(state.seen || {}, events, opts);
  const sm = reconcileSeen(state.seenSubmarkets || {}, submarkets, opts);

  const nextState = {
    version: STATE_VERSION,
    firstRunAt: state.firstRunAt || nowIso,
    lastRunAt: nowIso,
    seen: ev.nextSeen,
    seenSubmarkets: sm.nextSeen,
  };

  return { events: ev.items, submarkets: sm.items, nextState };
}
