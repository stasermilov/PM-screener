// Build the summary data model from the newly-added items. The same rule is
// applied to two independent sections — event-level markets and individual
// sub-markets: any item with volume over the threshold is highlighted and
// sorted to the top; stats are computed per section. Pure — no I/O, no HTML.

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

/**
 * Build the full summary model with both sections.
 *
 * @param {object} input
 * @param {object[]} input.events        newly added event-level markets
 * @param {object[]} input.submarkets    newly added individual sub-markets
 * @param {object} opts
 */
export function buildSummary({ events = [], submarkets = [] }, opts = {}) {
  const threshold = opts.threshold ?? 3000;
  const generatedAt = opts.generatedAt instanceof Date ? opts.generatedAt : new Date();

  return {
    generatedAt: generatedAt.toISOString(),
    scheduleHours: opts.scheduleHours ?? 6,
    threshold,
    tagSlug: opts.tagSlug ?? 'geopolitics',
    isFirstRun: Boolean(opts.isFirstRun),
    previousRunAt: opts.previousRunAt ?? null,
    events: buildSection(events, { threshold, totalTracked: opts.eventsTracked ?? null }),
    submarkets: buildSection(submarkets, { threshold, totalTracked: opts.submarketsTracked ?? null }),
  };
}
