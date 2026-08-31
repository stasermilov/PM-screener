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
 * Core pure diff over a single "seen" map. Given the prior seen map and the
 * current items, return the newly added items, the advanced seen map, and
 * whether this was a first run for that map. Does no I/O.
 *
 * Works for both events and sub-markets — items only need `id`, `createdAt`,
 * and a display title (`title` or `question`).
 */
export function diffAndAdvance(seen, items, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const nowIso = now.toISOString();
  const lookbackMs = (opts.firstRunLookbackHours ?? 6) * 3600 * 1000;
  const prior = seen || {};
  const isFirstRun = Object.keys(prior).length === 0;

  const newlyAdded = [];
  const nextSeen = {};

  for (const m of items || []) {
    const known = Boolean(prior[m.id]);
    const firstSeenAt = prior[m.id]?.firstSeenAt || nowIso;

    if (!known) {
      const createdMs = m.createdAt ? new Date(m.createdAt).getTime() : NaN;
      const withinLookback =
        Number.isFinite(createdMs) && now.getTime() - createdMs <= lookbackMs;
      // First run: only flag genuinely recent creations as "new".
      // Later runs: anything unseen is new by definition.
      if (!isFirstRun || withinLookback) {
        newlyAdded.push({ ...m, firstSeenAt });
      }
    }

    nextSeen[m.id] = {
      firstSeenAt,
      createdAt: m.createdAt || null,
      title: m.title || m.question || m.id,
      lastSeenAt: nowIso,
    };
  }

  // Carry forward recently-seen items that dropped off the current list, so an
  // item briefly missing from the feed isn't re-flagged as new next time.
  for (const [id, entry] of Object.entries(prior)) {
    if (nextSeen[id]) continue;
    const ref = entry.lastSeenAt || entry.firstSeenAt || nowIso;
    const ageMs = now.getTime() - new Date(ref).getTime();
    if (ageMs <= PRUNE_AFTER_DAYS * 86400 * 1000) nextSeen[id] = entry;
  }

  return { newlyAdded, nextSeen, isFirstRun };
}

/**
 * Events-only diff. Kept for callers/tests that just track event-level markets.
 * Returns the newly added markets plus the next state to persist.
 */
export function computeNewlyAdded(state, markets, opts = {}) {
  const nowIso = (opts.now instanceof Date ? opts.now : new Date()).toISOString();
  const { newlyAdded, nextSeen, isFirstRun } = diffAndAdvance(state.seen || {}, markets, opts);
  const nextState = {
    version: STATE_VERSION,
    firstRunAt: state.firstRunAt || nowIso,
    lastRunAt: nowIso,
    seen: nextSeen,
    seenSubmarkets: state.seenSubmarkets || {},
  };
  return { newlyAdded, nextState, isFirstRun };
}

/**
 * Diff both events and sub-markets in one pass, each against its own seen map,
 * and return a single next state carrying both. Each map keeps an independent
 * first-run notion, so upgrading an old state file (events only) seeds the
 * sub-market baseline gracefully instead of dumping the whole catalogue.
 */
export function computeNewlyAddedAll(state, { events = [], submarkets = [] }, opts = {}) {
  const nowIso = (opts.now instanceof Date ? opts.now : new Date()).toISOString();
  const ev = diffAndAdvance(state.seen || {}, events, opts);
  const sm = diffAndAdvance(state.seenSubmarkets || {}, submarkets, opts);

  const nextState = {
    version: STATE_VERSION,
    firstRunAt: state.firstRunAt || nowIso,
    lastRunAt: nowIso,
    seen: ev.nextSeen,
    seenSubmarkets: sm.nextSeen,
  };

  return {
    newlyAddedEvents: ev.newlyAdded,
    newlyAddedSubmarkets: sm.newlyAdded,
    isFirstRun: ev.isFirstRun,
    isFirstRunSubmarkets: sm.isFirstRun,
    nextState,
  };
}
