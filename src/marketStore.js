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
  return { version: STATE_VERSION, firstRunAt: null, lastRunAt: null, seen: {} };
}

export async function loadState(stateFile) {
  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyState();
    return { ...emptyState(), ...parsed, seen: parsed.seen || {} };
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
 * Pure diff: given prior state and the current market list, return the newly
 * added markets and the next state to persist. Does no I/O.
 *
 * @param {object} state              prior state (from loadState)
 * @param {object[]} markets          normalized markets from this fetch
 * @param {object} opts
 * @param {Date}   opts.now
 * @param {number} opts.firstRunLookbackHours
 */
export function computeNewlyAdded(state, markets, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const nowIso = now.toISOString();
  const lookbackMs = (opts.firstRunLookbackHours ?? 6) * 3600 * 1000;
  const seen = state.seen || {};
  const isFirstRun = Object.keys(seen).length === 0;

  const newlyAdded = [];
  const nextSeen = {};

  for (const m of markets) {
    const prior = seen[m.id];
    const known = Boolean(prior);
    const firstSeenAt = prior?.firstSeenAt || nowIso;

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
      title: m.title,
      lastSeenAt: nowIso,
    };
  }

  // Carry forward recently-seen markets that dropped off the current list, so a
  // market briefly missing from the feed isn't re-flagged as new next time.
  for (const [id, entry] of Object.entries(seen)) {
    if (nextSeen[id]) continue;
    const ref = entry.lastSeenAt || entry.firstSeenAt || nowIso;
    const ageMs = now.getTime() - new Date(ref).getTime();
    if (ageMs <= PRUNE_AFTER_DAYS * 86400 * 1000) nextSeen[id] = entry;
  }

  const nextState = {
    version: STATE_VERSION,
    firstRunAt: state.firstRunAt || nowIso,
    lastRunAt: nowIso,
    seen: nextSeen,
  };

  return { newlyAdded, nextState, isFirstRun };
}
