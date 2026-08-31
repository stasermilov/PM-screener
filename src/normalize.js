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

/** Parse a Gamma JSON-encoded array field (e.g. '["Yes","No"]'), tolerantly. */
export function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Pair each outcome with its price as a percentage, e.g. [{name:'Yes', pct:62}]. */
function outcomePairs(rawMarket) {
  const outcomes = parseJsonArray(rawMarket.outcomes);
  const prices = parseJsonArray(rawMarket.outcomePrices).map((p) => toNumber(p));
  return outcomes.map((name, i) => ({
    name: String(name),
    pct: Number.isFinite(prices[i]) ? Math.round(prices[i] * 100) : null,
  }));
}

/**
 * Normalize a single sub-market (one entry from an event's `markets` array)
 * into the shape used for the "individual sub-markets" section, carrying a
 * reference back to its parent event. Returns null if unusable.
 */
export function normalizeSubmarket(m, parent = {}) {
  if (!m || (m.id === undefined && !m.conditionId && !m.question && !m.slug)) {
    return null;
  }

  const id = String(pick(m, ['id', 'conditionId', 'slug']) ?? `${parent.id ?? ''}:${m.question ?? ''}`);
  const question = pick(m, ['question', 'groupItemTitle', 'title']) || parent.title || 'Untitled sub-market';
  const parentSlug = pick(parent, ['slug']) || '';
  const url = parentSlug
    ? POLYMARKET_EVENT_BASE + parentSlug
    : (m.slug ? POLYMARKET_EVENT_BASE + m.slug : 'https://polymarket.com');

  return {
    id,
    question,
    eventId: parent.id !== undefined ? String(parent.id) : '',
    eventTitle: pick(parent, ['title', 'question']) || '',
    eventSlug: parentSlug,
    url,
    volume: Math.round(toNumber(pick(m, ['volumeNum', 'volume'])) * 100) / 100,
    liquidity: Math.round(toNumber(pick(m, ['liquidityNum', 'liquidity'])) * 100) / 100,
    createdAt: toIso(pick(m, ['createdAt', 'startDate']) ?? pick(parent, ['createdAt', 'startDate'])),
    endDate: toIso(pick(m, ['endDate']) ?? pick(parent, ['endDate'])),
    outcomes: outcomePairs(m),
    active: Boolean(pick(m, ['active']) ?? true),
    closed: Boolean(pick(m, ['closed']) ?? false),
    tags: eventTags(parent),
  };
}

/** Flatten and normalize every sub-market across the given raw events. */
export function normalizeSubmarkets(events) {
  const seen = new Set();
  const out = [];
  for (const ev of events || []) {
    if (!Array.isArray(ev?.markets)) continue;
    for (const m of ev.markets) {
      const norm = normalizeSubmarket(m, ev);
      if (!norm || seen.has(norm.id)) continue;
      seen.add(norm.id);
      out.push(norm);
    }
  }
  return out;
}
