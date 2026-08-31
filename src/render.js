// Render the summary data model into a self-contained HTML page.
// The report has two sections — event-level markets and individual sub-markets.
// In both, items with volume over the threshold get a yellow background and a
// badge, and are already sorted to the top by buildSummary().

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

function badge(threshold) {
  return `<span class="badge">🔥 &gt; ${formatUsd(threshold)} volume</span>`;
}

function createdCell(iso, now) {
  return iso
    ? `${formatDateTime(iso)} <span class="muted">(${relativeTime(iso, now)})</span>`
    : '—';
}

/** Card for an event-level market. */
function renderEventCard(m, now, threshold) {
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
          ${m.highlighted ? badge(threshold) : ''}
        </div>
        <div class="volume">${formatUsd(m.volume)}<span class="volume-label"> volume</span></div>
        ${m.description ? `<p class="desc">${escapeHtml(m.description)}</p>` : ''}
        ${renderTags(m.tags)}
        <dl class="facts">
          <div><dt>Liquidity</dt><dd>${formatUsd(m.liquidity)}</dd></div>
          <div><dt>Created</dt><dd>${createdCell(m.createdAt, now)}</dd></div>
          ${meta.map((x) => `<div><dt></dt><dd>${escapeHtml(x)}</dd></div>`).join('')}
        </dl>
      </article>`;
}

function renderOutcomes(outcomes) {
  if (!outcomes?.length) return '';
  const parts = outcomes
    .slice(0, 3)
    .map((o) => `${escapeHtml(o.name)}${o.pct != null ? ` <b>${o.pct}%</b>` : ''}`)
    .join(' · ');
  return `<div class="outcomes">${parts}</div>`;
}

/** Card for an individual sub-market, linking back to its parent event. */
function renderSubmarketCard(m, now, threshold) {
  const parent = m.eventTitle
    ? `<div class="parent">in <a href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.eventTitle)}</a></div>`
    : '';

  return `
      <article class="card${m.highlighted ? ' highlight' : ''}">
        <div class="card-head">
          <h3 class="card-title">
            <a href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.question)}</a>
          </h3>
          ${m.highlighted ? badge(threshold) : ''}
        </div>
        ${parent}
        <div class="volume">${formatUsd(m.volume)}<span class="volume-label"> volume</span></div>
        ${renderOutcomes(m.outcomes)}
        <dl class="facts">
          <div><dt>Liquidity</dt><dd>${formatUsd(m.liquidity)}</dd></div>
          <div><dt>Created</dt><dd>${createdCell(m.createdAt, now)}</dd></div>
          ${m.endDate ? `<div><dt></dt><dd>Ends ${formatDateTime(m.endDate)}</dd></div>` : ''}
        </dl>
      </article>`;
}

function renderTopStats(summary) {
  const t = summary.totals;
  return `<section class="stats">
      <div class="stat"><div class="n">${t.freshCount}</div><div class="l">Last ${summary.freshDays}d</div></div>
      <div class="stat"><div class="n">${t.windowCount}</div><div class="l">Last ${summary.windowDays}d</div></div>
      <div class="stat"><div class="n">${t.highlightedCount}</div><div class="l">Over ${formatUsd(summary.threshold)}</div></div>
    </section>`;
}

/** One typed sub-group (Markets or Sub-markets) within an area. Empty groups
 *  render nothing. */
function renderSubgroup({ group, label, emoji, threshold, now, cardFn }) {
  if (!group.items.length) return '';
  const over = group.stats.highlightedCount
    ? ` · <span class="sub-hl">${group.stats.highlightedCount} over ${formatUsd(threshold)}</span>`
    : '';
  return `
      <div class="subgroup">
        <h3 class="subgroup-title">${emoji} ${escapeHtml(label)} <span class="subgroup-count">${group.items.length}${over}</span></h3>
        <div class="cards">
${group.items.map((m) => cardFn(m, now, threshold)).join('\n')}
        </div>
      </div>`;
}

/** A recency area (Fresh or Earlier) containing the Markets and Sub-markets
 *  sub-groups. */
function renderArea({ bucket, title, emoji, badgeClass, threshold, now, emptyText }) {
  const markets = renderSubgroup({
    group: bucket.events,
    label: 'Markets',
    emoji: '🗺️',
    threshold,
    now,
    cardFn: renderEventCard,
  });
  const submarkets = renderSubgroup({
    group: bucket.submarkets,
    label: 'Sub-markets',
    emoji: '🎯',
    threshold,
    now,
    cardFn: renderSubmarketCard,
  });
  const count = bucket.events.items.length + bucket.submarkets.items.length;
  const body =
    count > 0
      ? markets + submarkets
      : `<div class="empty"><p class="muted">${escapeHtml(emptyText)}</p></div>`;

  return `
    <section class="area ${badgeClass}">
      <h2 class="area-title">${emoji} ${escapeHtml(title)}</h2>
${body}
    </section>`;
}

/** Render the full HTML document for a summary. */
export function renderHtml(summary, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date(summary.generatedAt);
  const threshold = summary.threshold;
  const windowDays = summary.windowDays ?? 7;
  const freshDays = summary.freshDays ?? 2;
  const nextRun = nextRunIso(summary.generatedAt, summary.scheduleHours);
  const criteriaNote = summary.showOnlyHighlighted ? ` over ${formatUsd(threshold)} volume` : '';

  const freshArea = renderArea({
    bucket: summary.fresh,
    title: `Just added — last ${freshDays} ${freshDays === 1 ? 'day' : 'days'}`,
    emoji: '🆕',
    badgeClass: 'area-fresh',
    threshold,
    now,
    emptyText: `Nothing new in the last ${freshDays} ${freshDays === 1 ? 'day' : 'days'}. Check the list below.`,
  });

  const earlierArea = renderArea({
    bucket: summary.earlier,
    title: `Added ${freshDays}–${windowDays} days ago`,
    emoji: '🗓️',
    badgeClass: 'area-earlier',
    threshold,
    now,
    emptyText: `No geopolitics markets${criteriaNote} were added ${freshDays}–${windowDays} days ago.`,
  });

  // Hide the "earlier" area entirely when the whole window is empty, so a first
  // deploy with no data doesn't show two empty boxes.
  const showEarlier = summary.totals.windowCount > 0;

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
      --chip: #eef1f6; --hl-title: #8a6d00;
      --fresh-bg: #eef4ff; --fresh-border: #cdddff; --fresh-title: #1d4ed8;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f1115; --panel: #171a21; --text: #e9eaee; --muted: #9aa1ac;
        --border: #262b34; --accent: #6ea0ff; --hl-bg: #4a4110; --hl-border: #b8952a;
        --chip: #232833; --hl-title: #e6c15a;
        --fresh-bg: #131c2e; --fresh-border: #24406e; --fresh-title: #8fb4ff;
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
      padding: 6px 12px; border-radius: 999px; margin-bottom: 24px;
    }
    .swatch { width: 14px; height: 14px; border-radius: 3px; background: var(--hl-bg);
      border: 1px solid var(--hl-border); display: inline-block; }
    .updatebar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px;
      margin-bottom: 20px; }
    .update-btn { font: inherit; font-weight: 600; cursor: pointer; color: #fff;
      background: var(--accent); border: none; padding: 9px 16px; border-radius: 10px; }
    .update-btn:hover { filter: brightness(1.05); }
    .update-btn:disabled { opacity: .6; cursor: default; }
    .update-status { font-size: 13px; color: var(--muted); }
    .update-status a { color: var(--accent); }
    .area { margin-bottom: 30px; }
    .area-title { font-size: 19px; margin: 0 0 14px; }
    .area-fresh { background: var(--fresh-bg); border: 1px solid var(--fresh-border);
      border-radius: 16px; padding: 18px 18px 6px; }
    .area-fresh .area-title { color: var(--fresh-title); }
    .area-earlier .area-title { color: var(--muted); font-size: 17px; }
    .subgroup { margin-bottom: 12px; }
    .subgroup-title { font-size: 14px; font-weight: 700; margin: 4px 0 10px;
      text-transform: uppercase; letter-spacing: .03em; }
    .subgroup-count { font-weight: 400; text-transform: none; letter-spacing: 0;
      color: var(--muted); font-size: 13px; }
    .sub-hl { color: var(--hl-title); font-weight: 600; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 12px; margin-bottom: 24px; }
    .stat { background: var(--panel); border: 1px solid var(--border); border-radius: 12px;
      padding: 12px 14px; }
    .stat .n { font-size: 20px; font-weight: 700; }
    .stat .l { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
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
    .parent { font-size: 13px; color: var(--muted); margin: 2px 0 0; }
    .parent a { color: var(--accent); text-decoration: none; }
    .parent a:hover { text-decoration: underline; }
    .volume { font-size: 20px; font-weight: 700; margin: 8px 0 4px; }
    .volume-label { font-size: 13px; font-weight: 400; color: var(--muted); }
    .outcomes { font-size: 13px; color: var(--muted); margin-bottom: 10px; }
    .outcomes b { color: var(--text); }
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
    .empty { text-align: center; padding: 40px 16px; background: var(--panel);
      border: 1px dashed var(--border); border-radius: 14px; }
    .empty-emoji { font-size: 36px; }
    footer { margin-top: 8px; color: var(--muted); font-size: 12px; text-align: center; }
    footer a { color: var(--accent); }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>🌍 Polymarket Geopolitics — New Markets</h1>
      <p class="sub">
        Geopolitics markets added in the last ${windowDays} ${windowDays === 1 ? 'day' : 'days'} ·
        generated ${formatDateTime(summary.generatedAt)} ·
        auto-refreshes every ${summary.scheduleHours}h (next ~${formatDateTime(nextRun)})
      </p>
    </header>

    <div class="updatebar">
      <button type="button" class="update-btn" id="update-btn">🔄 Update now</button>
      <span class="update-status" id="update-status"></span>
    </div>

    <div class="legend">
      <span class="swatch"></span>
      Highlighted &amp; pinned to top: over ${formatUsd(threshold)} volume
    </div>

    ${renderTopStats(summary)}

    <main>
${freshArea}
${showEarlier ? earlierArea : ''}
    </main>

    <footer>
      Data from the <a href="https://gamma-api.polymarket.com" target="_blank" rel="noopener noreferrer">Polymarket Gamma API</a>
      · tag <code>${escapeHtml(summary.tagSlug)}</code>
      <br />Not affiliated with Polymarket. For informational purposes only.
    </footer>
  </div>

  <script>
  (function () {
    var btn = document.getElementById('update-btn');
    var status = document.getElementById('update-status');
    var workflowUrl = ${JSON.stringify(summary.refreshUrl || '').replace(/</g, '\\u003c')};
    if (!btn) return;

    function fallback() {
      // Static hosting (e.g. GitHub Pages) can't regenerate data in place.
      status.textContent = '';
      if (workflowUrl) {
        status.appendChild(document.createTextNode('This site refreshes on GitHub — '));
        var a = document.createElement('a');
        a.href = workflowUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = 'run an update now →';
        status.appendChild(a);
        status.appendChild(document.createTextNode(' then reload this page in ~1 min.'));
      } else {
        status.textContent = 'Live refresh needs server mode (npm start); this page updates on its schedule.';
      }
      btn.disabled = false;
    }

    btn.addEventListener('click', function () {
      btn.disabled = true;
      status.textContent = 'Requesting update…';
      fetch('./run', { method: 'POST', cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('no server');
          return res.json().catch(function () { return {}; });
        })
        .then(function (data) {
          if (data && data.ok === false) throw new Error('server error');
          status.textContent = 'Updated ✓ Reloading…';
          setTimeout(function () { location.reload(); }, 1200);
        })
        .catch(fallback);
    });
  })();
  </script>
</body>
</html>
`;
}
