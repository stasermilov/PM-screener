// Render the summary data model into a self-contained HTML page.
// Highlighted markets (volume over the threshold) get a yellow background and
// a badge, and are already sorted to the top by buildSummary().

const HL_BG = '#fff8c4'; // yellow highlight for over-threshold markets

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatUsd(n) {
  const value = Number(n) || 0;
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  });
}

function relativeTime(iso, now = new Date()) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = now.getTime() - then;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

function nextRunIso(generatedAt, scheduleHours) {
  const next = new Date(new Date(generatedAt).getTime() + scheduleHours * 3600 * 1000);
  return next.toISOString();
}

function renderTags(tags) {
  if (!tags?.length) return '';
  return `<div class="tags">${tags
    .slice(0, 6)
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join('')}</div>`;
}

function renderCard(m, now) {
  const created = m.createdAt
    ? `${formatDateTime(m.createdAt)} <span class="muted">(${relativeTime(m.createdAt, now)})</span>`
    : '—';
  const meta = [
    m.endDate ? `Ends ${formatDateTime(m.endDate)}` : null,
    m.subMarketCount > 1 ? `${m.subMarketCount} sub-markets` : null,
  ].filter(Boolean);

  return `
      <article class="card${m.highlighted ? ' highlight' : ''}">
        <div class="card-head">
          <h3 class="card-title">
            <a href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.title)}</a>
          </h3>
          ${m.highlighted ? `<span class="badge">🔥 &gt; ${formatUsd(m.highlightThreshold)} volume</span>` : ''}
        </div>
        <div class="volume">${formatUsd(m.volume)}<span class="volume-label"> volume</span></div>
        ${m.description ? `<p class="desc">${escapeHtml(m.description)}</p>` : ''}
        ${renderTags(m.tags)}
        <dl class="facts">
          <div><dt>Liquidity</dt><dd>${formatUsd(m.liquidity)}</dd></div>
          <div><dt>Created</dt><dd>${created}</dd></div>
          ${meta.map((x) => `<div><dt></dt><dd>${escapeHtml(x)}</dd></div>`).join('')}
        </dl>
      </article>`;
}

function emptyState(summary) {
  const reason = summary.isFirstRun
    ? 'This was the first run, so the screener recorded the current geopolitics markets as a baseline. New markets that appear from now on will show up here.'
    : `No new geopolitics markets have appeared since the last check ${relativeTime(summary.previousRunAt) || 'recently'}.`;
  return `<div class="empty">
        <div class="empty-emoji">🌍</div>
        <p>No newly added markets this cycle.</p>
        <p class="muted">${escapeHtml(reason)}</p>
      </div>`;
}

/** Render the full HTML document for a summary. */
export function renderHtml(summary, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date(summary.generatedAt);
  const s = summary.stats;
  const threshold = summary.threshold;

  // Attach the threshold to each market so the badge can display it.
  const markets = summary.markets.map((m) => ({ ...m, highlightThreshold: threshold }));

  const cards = markets.length
    ? markets.map((m) => renderCard(m, now)).join('\n')
    : emptyState(summary);

  const nextRun = nextRunIso(summary.generatedAt, summary.scheduleHours);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Polymarket Geopolitics — New Markets</title>
  <style>
    :root {
      --bg: #f5f6f8; --panel: #ffffff; --text: #16181d; --muted: #6b7280;
      --border: #e5e7eb; --accent: #2f6fed; --hl-bg: ${HL_BG}; --hl-border: #f2d024;
      --chip: #eef1f6;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f1115; --panel: #171a21; --text: #e9eaee; --muted: #9aa1ac;
        --border: #262b34; --accent: #6ea0ff; --hl-bg: #4a4110; --hl-border: #b8952a;
        --chip: #232833;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; background: var(--bg); color: var(--text);
      font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .wrap { max-width: 900px; margin: 0 auto; padding: 24px 16px 64px; }
    header h1 { font-size: 24px; margin: 0 0 4px; }
    header .sub { color: var(--muted); margin: 0 0 20px; }
    .legend {
      display: inline-flex; align-items: center; gap: 8px; font-size: 13px;
      color: var(--muted); background: var(--panel); border: 1px solid var(--border);
      padding: 6px 12px; border-radius: 999px; margin-bottom: 20px;
    }
    .swatch { width: 14px; height: 14px; border-radius: 3px; background: var(--hl-bg);
      border: 1px solid var(--hl-border); display: inline-block; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px; margin-bottom: 24px; }
    .stat { background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
      padding: 14px 16px; }
    .stat .n { font-size: 22px; font-weight: 700; }
    .stat .l { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 14px;
      padding: 16px 18px; margin-bottom: 14px; }
    .card.highlight { background: var(--hl-bg); border-color: var(--hl-border);
      box-shadow: 0 0 0 1px var(--hl-border); }
    .card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .card-title { font-size: 17px; margin: 0; }
    .card-title a { color: var(--text); text-decoration: none; }
    .card-title a:hover { color: var(--accent); text-decoration: underline; }
    .badge { flex: none; font-size: 12px; font-weight: 700; white-space: nowrap;
      background: var(--hl-border); color: #3a2f00; padding: 4px 10px; border-radius: 999px; }
    .volume { font-size: 20px; font-weight: 700; margin: 8px 0 4px; }
    .volume-label { font-size: 13px; font-weight: 400; color: var(--muted); }
    .desc { margin: 6px 0 10px; color: var(--muted); }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .tag { font-size: 12px; background: var(--chip); color: var(--muted);
      padding: 2px 8px; border-radius: 999px; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 6px 18px; margin: 0; font-size: 13px; }
    .facts div { display: flex; gap: 6px; }
    .facts dt { color: var(--muted); margin: 0; }
    .facts dt:not(:empty)::after { content: ":"; }
    .facts dd { margin: 0; }
    .muted { color: var(--muted); }
    .empty { text-align: center; padding: 48px 16px; background: var(--panel);
      border: 1px dashed var(--border); border-radius: 14px; }
    .empty-emoji { font-size: 40px; }
    footer { margin-top: 32px; color: var(--muted); font-size: 12px; text-align: center; }
    footer a { color: var(--accent); }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>🌍 Polymarket Geopolitics — New Markets</h1>
      <p class="sub">
        Generated ${formatDateTime(summary.generatedAt)} ·
        refreshes every ${summary.scheduleHours}h ·
        next update ~${formatDateTime(nextRun)}
      </p>
    </header>

    <div class="legend">
      <span class="swatch"></span>
      Highlighted &amp; pinned to top: markets with more than ${formatUsd(threshold)} volume
    </div>

    <section class="stats">
      <div class="stat"><div class="n">${s.newCount}</div><div class="l">New markets</div></div>
      <div class="stat"><div class="n">${s.highlightedCount}</div><div class="l">Over ${formatUsd(threshold)}</div></div>
      <div class="stat"><div class="n">${formatUsd(s.topVolume)}</div><div class="l">Top volume</div></div>
      <div class="stat"><div class="n">${formatUsd(s.totalVolume)}</div><div class="l">Combined volume</div></div>
    </section>

    <main>
${cards}
    </main>

    <footer>
      Data from the <a href="https://gamma-api.polymarket.com" target="_blank" rel="noopener noreferrer">Polymarket Gamma API</a>
      · tag <code>${escapeHtml(summary.tagSlug)}</code>
      · ${s.totalTracked != null ? `${s.totalTracked} markets tracked` : ''}
      <br />Not affiliated with Polymarket. For informational purposes only.
    </footer>
  </div>
</body>
</html>
`;
}
