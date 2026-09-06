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

// The categories shown as tabs. Each is a Polymarket tag. Emoji/label are for
// display; slug is what the Gamma API is queried with. Override the set with
// the CATEGORY_SLUGS env var (comma-separated slugs).
const CATEGORY_META = {
  geopolitics: { label: 'Geopolitics', emoji: '🌍' },
  tech: { label: 'Tech', emoji: '💻' },
  politics: { label: 'Politics', emoji: '🏛️' },
  ipo: { label: 'IPO', emoji: '📈' },
  business: { label: 'Business', emoji: '💼' },
  crypto: { label: 'Crypto', emoji: '🪙' },
  economy: { label: 'Economy', emoji: '📊' },
  sports: { label: 'Sports', emoji: '🏆' },
};

function buildCategories() {
  const raw = str('CATEGORY_SLUGS', 'geopolitics,tech,politics,ipo');
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((slug) => {
      const meta = CATEGORY_META[slug] || {
        label: slug.charAt(0).toUpperCase() + slug.slice(1),
        emoji: '📊',
      };
      return { slug, label: meta.label, emoji: meta.emoji };
    });
}

export const config = {
  rootDir,

  // --- Data source (Polymarket Gamma API) ---
  apiBase: str('GAMMA_API_BASE', 'https://gamma-api.polymarket.com').replace(/\/+$/, ''),
  // Categories shown as tabs (each is a Polymarket tag).
  categories: buildCategories(),
  // Upper bound on how many events we pull per category per refresh (paginated).
  maxEvents: num('MAX_EVENTS', 600),
  pageSize: num('GAMMA_PAGE_SIZE', 100),
  requestTimeoutMs: num('REQUEST_TIMEOUT_MS', 20000),

  // --- Business rules ---
  // Markets with volume strictly greater than this are highlighted and pinned
  // to the top of the list.
  volumeThreshold: num('VOLUME_THRESHOLD', 3000),
  // How often the summary is regenerated, in hours.
  scheduleHours: num('SCHEDULE_HOURS', 6),
  // The report lists markets added within this rolling window (in days),
  // independent of how often it refreshes.
  windowDays: num('WINDOW_DAYS', 7),
  // Markets added within this many days are pulled into a prominent "fresh"
  // area at the top of the report. Must be <= windowDays.
  freshDays: num('FRESH_DAYS', 2),
  // When true, the list is restricted to markets over the volume threshold.
  // Default false: show every market in the window and just highlight the big
  // ones.
  showOnlyHighlighted: str('SHOW_ONLY_HIGHLIGHTED', 'false') === 'true',

  // Extra case-insensitive keywords to exclude, on top of the built-in rules
  // (X/Twitter posts, Trump insults, words-said-during-an-event). Comma list.
  excludeExtra: str('EXCLUDE_EXTRA', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // A category with more than this many windowed markets is split into
  // "1-100 / 101-200 / ..." pagination sub-tabs.
  categoryPageSize: num('CATEGORY_PAGE_SIZE', 100),

  // --- Movers tab ---
  // A market is a "mover" when its probability changed by at least this many
  // percentage points over the given window. Movement is measured against the
  // app's own price snapshots (see prices.js), so the 3-day figure warms up
  // over ~3 days of runs.
  moverDayPct: num('MOVER_DAY_PCT', 20), // >20 pts in 24h
  moverDayHours: num('MOVER_DAY_HOURS', 24),
  moverDayMaxGapHours: num('MOVER_DAY_MAX_GAP_HOURS', 14),
  mover3dPct: num('MOVER_3D_PCT', 30), // >30 pts in 3 days
  mover3dHours: num('MOVER_3D_HOURS', 72),
  mover3dMaxGapHours: num('MOVER_3D_MAX_GAP_HOURS', 30),
  moversLimit: num('MOVERS_LIMIT', 100),

  // --- High chance tab ---
  // Markets whose Yes price sits in this band (inclusive).
  highMin: num('HIGH_MIN', 0.6),
  highMax: num('HIGH_MAX', 0.92),
  highChanceLimit: num('HIGH_CHANCE_LIMIT', 200),

  // --- Price history ---
  // Only track price history for markets with at least this much volume, to keep
  // the state file small. Snapshots older than this many hours are pruned.
  priceTrackMinVolume: num('PRICE_TRACK_MIN_VOLUME', 1000),
  priceHistoryMaxAgeHours: num('PRICE_HISTORY_MAX_AGE_HOURS', 90),
  priceHistoryMaxPoints: num('PRICE_HISTORY_MAX_POINTS', 20),

  // --- Output & persistence ---
  outputDir: resolvePath('OUTPUT_DIR', 'public'),
  stateFile: resolvePath('STATE_FILE', 'data/state.json'),

  // --- Server ---
  port: num('PORT', 3000),
  host: str('HOST', '0.0.0.0'),
  // Run one refresh immediately on server startup instead of waiting for the
  // first scheduled tick.
  runOnStart: str('RUN_ON_START', 'true') !== 'false',

  // --- Update button ---
  // On the static GitHub Pages site the "Update now" button can't refresh data
  // itself, so it falls back to launching this GitHub Actions workflow (which
  // regenerates and republishes the page). Derived automatically inside CI from
  // GitHub's built-in env vars; override with WORKFLOW_URL if needed.
  workflowUrl: (() => {
    const explicit = str('WORKFLOW_URL', '');
    if (explicit) return explicit;
    const repo = process.env.GITHUB_REPOSITORY; // e.g. "owner/repo"
    if (!repo) return '';
    const server = str('GITHUB_SERVER_URL', 'https://github.com').replace(/\/+$/, '');
    const file = str('WORKFLOW_FILE', 'geopolitics-summary.yml');
    return `${server}/${repo}/actions/workflows/${file}`;
  })(),
};

export const POLYMARKET_EVENT_BASE = 'https://polymarket.com/event/';
