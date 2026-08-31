// Build the summary data model from the newly-added markets: apply the
// highlight rule (volume over the threshold), sort highlighted markets to the
// top, and compute headline stats. Pure — no I/O, no HTML.

/**
 * @param {object[]} newlyAdded  normalized markets flagged as newly added
 * @param {object} opts
 * @param {number} opts.threshold        volume highlight threshold (exclusive)
 * @param {number} opts.scheduleHours
 * @param {Date}   opts.generatedAt
 * @param {boolean} opts.isFirstRun
 * @param {string} opts.tagSlug
 * @param {number} [opts.totalTracked]   size of the full tracked market set
 */
export function buildSummary(newlyAdded, opts = {}) {
  const threshold = opts.threshold ?? 3000;
  const generatedAt = (opts.generatedAt instanceof Date ? opts.generatedAt : new Date());

  const markets = newlyAdded.map((m) => ({
    ...m,
    highlighted: Number(m.volume) > threshold,
  }));

  markets.sort((a, b) => {
    // 1. Highlighted (over-threshold) markets always come first.
    if (a.highlighted !== b.highlighted) return a.highlighted ? -1 : 1;
    // 2. Then by volume, biggest first.
    if (b.volume !== a.volume) return b.volume - a.volume;
    // 3. Then most recently created/seen first.
    const at = new Date(a.firstSeenAt || a.createdAt || 0).getTime();
    const bt = new Date(b.firstSeenAt || b.createdAt || 0).getTime();
    return bt - at;
  });

  const highlighted = markets.filter((m) => m.highlighted);
  const totalVolume = markets.reduce((sum, m) => sum + Number(m.volume || 0), 0);

  return {
    generatedAt: generatedAt.toISOString(),
    scheduleHours: opts.scheduleHours ?? 6,
    threshold,
    tagSlug: opts.tagSlug ?? 'geopolitics',
    isFirstRun: Boolean(opts.isFirstRun),
    previousRunAt: opts.previousRunAt ?? null,
    stats: {
      newCount: markets.length,
      highlightedCount: highlighted.length,
      totalVolume: Math.round(totalVolume * 100) / 100,
      topVolume: markets.length ? markets[0].volume : 0,
      totalTracked: opts.totalTracked ?? null,
    },
    markets,
  };
}
