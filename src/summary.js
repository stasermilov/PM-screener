// Build the summary data model. Each category's new-market list has a "fresh"
// and an "earlier" group (over-threshold markets highlighted and pinned to the
// top). Movers and High-chance are cross-category, computed in prices.js and
// passed through here. Pure — no I/O, no HTML.

/** Flag items over the threshold and sort highlighted + biggest-volume first. */
export function sortAndFlag(items, threshold) {
  const flagged = items.map((m) => ({
    ...m,
    highlighted: Number(m.volume) > threshold,
  }));

  flagged.sort((a, b) => {
    // 1. Highlighted (over-threshold) items always come first.
    if (a.highlighted !== b.highlighted) return a.highlighted ? -1 : 1;
    // 2. Then by volume, biggest first.
    if (b.volume !== a.volume) return b.volume - a.volume;
    // 3. Then most recently created/seen first.
    const at = new Date(a.firstSeenAt || a.createdAt || 0).getTime();
    const bt = new Date(b.firstSeenAt || b.createdAt || 0).getTime();
    return bt - at;
  });

  return flagged;
}

/** Build one section: flagged+sorted items plus headline stats. */
export function buildSection(items, { threshold = 3000, totalTracked = null } = {}) {
  const sorted = sortAndFlag(items, threshold);
  const highlighted = sorted.filter((m) => m.highlighted);
  const totalVolume = sorted.reduce((sum, m) => sum + Number(m.volume || 0), 0);

  return {
    stats: {
      newCount: sorted.length,
      highlightedCount: highlighted.length,
      totalVolume: Math.round(totalVolume * 100) / 100,
      topVolume: sorted.length ? sorted[0].volume : 0,
      totalTracked,
    },
    items: sorted,
  };
}

/** Compact, machine-friendly stats for /healthz and logs. */
export function summarize(summary) {
  return {
    categories: (summary.categories || []).map((c) => ({
      slug: c.slug,
      windowCount: c.totals.windowCount,
      freshCount: c.totals.freshCount,
      highlightedCount: c.totals.highlightedCount,
      error: c.error || null,
    })),
    moversDay: summary.movers?.day?.total ?? 0,
    movers3d: summary.movers?.threeDay?.total ?? 0,
    highChance: summary.highChance?.total ?? 0,
    excluded: summary.excluded?.length ?? 0,
  };
}

/**
 * Build one category view from its already-windowed fresh/earlier event lists.
 */
export function buildCategory(cat, threshold) {
  const fresh = buildSection(cat.freshEvents || [], { threshold });
  const earlier = buildSection(cat.earlierEvents || [], { threshold });
  return {
    slug: cat.slug,
    label: cat.label,
    emoji: cat.emoji,
    tracked: cat.eventsTracked ?? null,
    error: cat.error || null,
    fresh,
    earlier,
    totals: {
      freshCount: fresh.stats.newCount,
      earlierCount: earlier.stats.newCount,
      windowCount: fresh.stats.newCount + earlier.stats.newCount,
      highlightedCount: fresh.stats.highlightedCount + earlier.stats.highlightedCount,
    },
  };
}

/**
 * Build the full summary model.
 *
 * @param {object} input
 * @param {object[]} input.categories  per-category {slug,label,emoji,freshEvents,earlierEvents,eventsTracked,error}
 * @param {object}   input.movers      from prices.buildMovers
 * @param {object}   input.highChance  from prices.buildHighChance
 * @param {object} opts
 */
export function buildSummary(input = {}, opts = {}) {
  const { categories = [], movers = null, highChance = null, excluded = [] } = input;
  const threshold = opts.threshold ?? 3000;
  const generatedAt = opts.generatedAt instanceof Date ? opts.generatedAt : new Date();

  return {
    generatedAt: generatedAt.toISOString(),
    scheduleHours: opts.scheduleHours ?? 6,
    windowDays: opts.windowDays ?? 7,
    freshDays: opts.freshDays ?? 2,
    showOnlyHighlighted: Boolean(opts.showOnlyHighlighted),
    categoryPageSize: opts.categoryPageSize ?? 100,
    threshold,
    previousRunAt: opts.previousRunAt ?? null,
    refreshUrl: opts.refreshUrl ?? '',
    excluded,
    categories: categories.map((c) => buildCategory(c, threshold)),
    movers: {
      dayPct: opts.moverDayPct ?? 20,
      threeDayPct: opts.mover3dPct ?? 30,
      day: movers?.day ?? { total: 0, items: [] },
      threeDay: movers?.threeDay ?? { total: 0, items: [] },
    },
    highChance: {
      min: opts.highMin ?? 0.6,
      max: opts.highMax ?? 0.92,
      total: highChance?.total ?? 0,
      items: highChance?.items ?? [],
    },
  };
}
