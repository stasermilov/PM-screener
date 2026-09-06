// Thin client for the Polymarket Gamma API (https://gamma-api.polymarket.com).
//
// Responsibilities:
//   1. Resolve the numeric tag id for a tag slug (e.g. "geopolitics").
//   2. Page through the /events endpoint filtered to that tag.
//
// The client is defensive: Gamma occasionally tweaks accepted query params, so
// tag filtering falls back through a few strategies, and every response is
// validated before use.

import { config } from './config.js';

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'pm-screener/1.0' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`GET ${url} -> HTTP ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function buildUrl(pathname, params = {}) {
  const url = new URL(config.apiBase + pathname);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Resolve a tag slug to its numeric id. Returns null if it can't be resolved,
 * in which case the caller falls back to slug-based filtering.
 */
export async function resolveTagId(slug) {
  // Preferred: direct slug lookup.
  try {
    const direct = await getJson(buildUrl(`/tags/slug/${encodeURIComponent(slug)}`));
    const id = direct?.id ?? direct?.[0]?.id;
    if (id !== undefined) return String(id);
  } catch {
    // fall through to list scan
  }

  // Fallback: scan the full tag list for a matching slug/label.
  try {
    const tags = await getJson(buildUrl('/tags', { limit: 2000 }));
    if (Array.isArray(tags)) {
      const match = tags.find(
        (t) =>
          t?.slug?.toLowerCase() === slug.toLowerCase() ||
          t?.label?.toLowerCase() === slug.toLowerCase(),
      );
      if (match?.id !== undefined) return String(match.id);
    }
  } catch {
    // ignore; caller handles null
  }
  return null;
}

/**
 * Fetch one page of events for the given tag. Tries tag_id first, then the
 * slug-based param variants that Gamma has accepted over time.
 */
async function fetchEventsPage({ tagId, slug, limit, offset }) {
  const base = {
    limit,
    offset,
    closed: false,
    archived: false,
    active: true,
    order: 'startDate',
    ascending: false,
  };

  const attempts = [];
  if (tagId) attempts.push({ ...base, tag_id: tagId });
  attempts.push({ ...base, tag_slug: slug });
  attempts.push({ ...base, tag: slug });

  let lastError;
  for (const params of attempts) {
    try {
      const data = await getJson(buildUrl('/events', params));
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.data)) return data.data;
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw lastError;
  return [];
}

/**
 * Fetch all open events under a single tag, paging until exhausted or the
 * configured cap is reached. Returns the raw event objects (callers normalize
 * and/or extract markets from them).
 */
export async function fetchRawEventsForTag(slug) {
  const tagId = await resolveTagId(slug);
  const raw = [];
  for (let offset = 0; offset < config.maxEvents; offset += config.pageSize) {
    const limit = Math.min(config.pageSize, config.maxEvents - offset);
    const page = await fetchEventsPage({ tagId, slug, limit, offset });
    raw.push(...page);
    if (page.length < limit) break; // last page
  }
  return { tagId, rawEvents: raw };
}

/**
 * Fetch every configured category. Each category is fetched independently so one
 * failing tag doesn't sink the whole run. Returns one entry per category with
 * its raw events (empty on failure, with an `error` note).
 */
export async function fetchCategories(categories = config.categories) {
  const results = [];
  for (const cat of categories) {
    try {
      const { tagId, rawEvents } = await fetchRawEventsForTag(cat.slug);
      results.push({ ...cat, tagId, rawEvents });
    } catch (err) {
      console.error(`[gamma] failed to fetch "${cat.slug}": ${err.message}`);
      results.push({ ...cat, tagId: null, rawEvents: [], error: err.message });
    }
  }
  return { categories: results, fetchedAt: new Date().toISOString() };
}
