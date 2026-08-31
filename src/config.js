// Central configuration for the PM screener.
//
// Every value can be overridden with an environment variable so the app can be
// deployed (server or GitHub Actions) without editing code. The defaults match
// the task requirements: the Polymarket "Geopolitics" tag, a $3000 volume
// highlight threshold, and a 6-hour refresh cadence.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function num(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function str(name, fallback) {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

function resolvePath(name, fallback) {
  const raw = str(name, fallback);
  return path.isAbsolute(raw) ? raw : path.join(rootDir, raw);
}

export const config = {
  rootDir,

  // --- Data source (Polymarket Gamma API) ---
  apiBase: str('GAMMA_API_BASE', 'https://gamma-api.polymarket.com').replace(/\/+$/, ''),
  tagSlug: str('GEO_TAG_SLUG', 'geopolitics'),
  // Upper bound on how many events we pull per refresh (paginated internally).
  maxEvents: num('MAX_EVENTS', 1000),
  pageSize: num('GAMMA_PAGE_SIZE', 100),
  requestTimeoutMs: num('REQUEST_TIMEOUT_MS', 20000),

  // --- Business rules ---
  // Markets with volume strictly greater than this are highlighted and pinned
  // to the top of the list.
  volumeThreshold: num('VOLUME_THRESHOLD', 3000),
  // How often the summary is regenerated, in hours.
  scheduleHours: num('SCHEDULE_HOURS', 6),
  // On the very first run there is no prior state, so "newly added" is seeded
  // from markets created within this many hours to avoid dumping the whole
  // catalogue. Subsequent runs report a true diff against saved state.
  firstRunLookbackHours: num('FIRST_RUN_LOOKBACK_HOURS', 6),

  // --- Output & persistence ---
  outputDir: resolvePath('OUTPUT_DIR', 'public'),
  stateFile: resolvePath('STATE_FILE', 'data/state.json'),

  // --- Server ---
  port: num('PORT', 3000),
  host: str('HOST', '0.0.0.0'),
  // Run one refresh immediately on server startup instead of waiting for the
  // first scheduled tick.
  runOnStart: str('RUN_ON_START', 'true') !== 'false',
};

export const POLYMARKET_EVENT_BASE = 'https://polymarket.com/event/';
