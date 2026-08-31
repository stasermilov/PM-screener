// Pure helpers that turn raw Gamma API event objects into the normalized
// "market" shape the rest of the app uses. Kept free of I/O so it can be unit
// tested against fixtures.

import { POLYMARKET_EVENT_BASE } from './config.js';

/** Coerce a Gamma numeric-ish value (number or string) into a finite number. */
export function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[$,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Return the first defined, non-empty value among the given keys. */
function pick(obj, keys) {
  for (const key of keys) {
    const v = obj?.[key];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** Parse a date-ish value into an ISO string, or null if unusable. */
export function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * On Polymarket, a browsable "market" card is a Gamma *event* (which may group
 * one or more underlying markets). We surface events as the user-facing unit
 * and use the event's aggregate volume, falling back to summing child markets.
 */
export function eventVolume(ev) {
  const direct = pick(ev, ['volume', 'volumeNum', 'volumeAmount']);
  if (direct !== undefined) return toNumber(direct);
  if (Array.isArray(ev.markets)) {
    return ev.markets.reduce(
      (sum, m) => sum + toNumber(pick(m, ['volumeNum', 'volume'])),
      0,
    );
  }
  return 0;
}

function eventLiquidity(ev) {
  const direct = pick(ev, ['liquidity', 'liquidityNum']);
  if (direct !== undefined) return toNumber(direct);
  if (Array.isArray(ev.markets)) {
    return ev.markets.reduce(
      (sum, m) => sum + toNumber(pick(m, ['liquidityNum', 'liquidity'])),
      0,
    );
  }
  return 0;
}

function eventTags(ev) {
  if (!Array.isArray(ev.tags)) return [];
  return ev.tags
    .map((t) => (typeof t === 'string' ? t : t?.label || t?.slug))
    .filter(Boolean);
}

function shorten(text, max = 240) {
  if (!text || typeof text !== 'string') return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/**
 * Normalize a raw Gamma event into the shape used across the app.
 * Returns null for entries that lack the minimum usable fields.
 */
export function normalizeEvent(ev) {
  if (!ev || (ev.id === undefined && !ev.slug)) return null;

  const id = String(pick(ev, ['id', 'slug']));
  const slug = pick(ev, ['slug']) || '';
  const title = pick(ev, ['title', 'question', 'name']) || 'Untitled market';

  return {
    id,
    slug,
    title,
    description: shorten(pick(ev, ['description', 'subtitle'])),
    url: slug ? POLYMARKET_EVENT_BASE + slug : 'https://polymarket.com',
    volume: Math.round(eventVolume(ev) * 100) / 100,
    liquidity: Math.round(eventLiquidity(ev) * 100) / 100,
    createdAt: toIso(pick(ev, ['createdAt', 'creationDate', 'startDate'])),
    startDate: toIso(pick(ev, ['startDate'])),
    endDate: toIso(pick(ev, ['endDate'])),
    tags: eventTags(ev),
    subMarketCount: Array.isArray(ev.markets) ? ev.markets.length : 0,
    active: Boolean(pick(ev, ['active']) ?? true),
    closed: Boolean(pick(ev, ['closed']) ?? false),
  };
}

/** Normalize a list of raw events, dropping unusable ones and de-duping by id. */
export function normalizeEvents(events) {
  const seen = new Set();
  const out = [];
  for (const ev of events || []) {
    const norm = normalizeEvent(ev);
    if (!norm || seen.has(norm.id)) continue;
    seen.add(norm.id);
    out.push(norm);
  }
  return out;
}
