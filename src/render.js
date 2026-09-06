// Render the summary data model into a self-contained HTML page.
//
// The page has two tabs (bottom bar): Geopolitics (the generated list, split
// into a "fresh — last N days" area and an "earlier" area, with over-threshold
// markets highlighted and pinned) and Watchlist (client-side, backed by the
// viewer's browser localStorage). Each market card has a watchlist tick.

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

/** The watchlist tick button on a card. Carries the market data it needs so the
 *  Watchlist tab can show it even after it ages out of the list. */
function watchToggle(m) {
  return `<button type="button" class="watch-toggle" aria-pressed="false"
          data-id="${escapeHtml(m.id)}"
          data-title="${escapeHtml(m.title)}"
          data-url="${escapeHtml(m.url)}"
          data-vol="${Number(m.volume) || 0}"
          data-created="${escapeHtml(m.createdAt || '')}">
          <span class="box" aria-hidden="true">✓</span><span class="watch-label">Watchlist</span>
        </button>`;
}

/** Card for an event-level market. */
function renderEventCard(m, now, threshold) {
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
          ${m.endDate ? `<div><dt></dt><dd>Ends ${formatDateTime(m.endDate)}</dd></div>` : ''}
        </dl>
        <div class="card-actions">${watchToggle(m)}</div>
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

/** A recency area (Fresh or Earlier) that renders its event cards directly. */
function renderArea({ bucket, title, emoji, badgeClass, threshold, now, emptyText }) {
  const count = bucket.items.length
    ? `<span class="area-count">${bucket.items.length}</span>`
    : '';
  const body = bucket.items.length
    ? bucket.items.map((m) => renderEventCard(m, now, threshold)).join('\n')
    : `<div class="empty"><p class="muted">${escapeHtml(emptyText)}</p></div>`;

  return `
    <section class="area ${badgeClass}">
      <h2 class="area-title">${emoji} ${escapeHtml(title)} ${count}</h2>
      <div class="cards">
${body}
      </div>
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
      --chip: #eef1f6; --danger: #b42318;
      --fresh-bg: #eef4ff; --fresh-border: #cdddff; --fresh-title: #1d4ed8;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f1115; --panel: #171a21; --text: #e9eaee; --muted: #9aa1ac;
        --border: #262b34; --accent: #6ea0ff; --hl-bg: #4a4110; --hl-border: #b8952a;
        --chip: #232833; --danger: #ff8a80;
        --fresh-bg: #131c2e; --fresh-border: #24406e; --fresh-title: #8fb4ff;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; background: var(--bg); color: var(--text);
      font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      padding-bottom: 72px; /* room for the fixed bottom tab bar */
    }
    .wrap { max-width: 900px; margin: 0 auto; padding: 24px 16px 40px; }
    header h1 { font-size: 24px; margin: 0 0 4px; }
    .sub { color: var(--muted); margin: 0 0 20px; }
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
    .area-count { font-weight: 400; font-size: 13px; color: var(--muted); }
    .area-fresh { background: var(--fresh-bg); border: 1px solid var(--fresh-border);
      border-radius: 16px; padding: 18px 18px 6px; }
    .area-fresh .area-title { color: var(--fresh-title); }
    .area-earlier .area-title { color: var(--muted); font-size: 17px; }
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
    .card-actions { margin-top: 12px; }
    .watch-toggle { display: inline-flex; align-items: center; gap: 7px; font: inherit;
      font-size: 13px; cursor: pointer; background: var(--panel); color: var(--muted);
      border: 1px solid var(--border); border-radius: 999px; padding: 6px 13px; }
    .watch-toggle .box { width: 16px; height: 16px; border: 1.5px solid currentColor;
      border-radius: 5px; display: inline-flex; align-items: center; justify-content: center;
      font-size: 12px; line-height: 1; color: transparent; }
    .watch-toggle.on { color: var(--accent); border-color: var(--accent); background: var(--fresh-bg); }
    .watch-toggle.on .box { background: var(--accent); border-color: var(--accent); color: #fff; }
    .remove-btn { font: inherit; font-size: 13px; cursor: pointer; color: var(--danger);
      background: transparent; border: 1px solid var(--border); border-radius: 8px;
      padding: 6px 12px; margin-top: 10px; }
    .remove-btn:hover { border-color: var(--danger); }
    .empty { text-align: center; padding: 40px 16px; background: var(--panel);
      border: 1px dashed var(--border); border-radius: 14px; }
    .empty-emoji { font-size: 36px; }
    footer { margin-top: 8px; color: var(--muted); font-size: 12px; text-align: center; }
    footer a { color: var(--accent); }
    .tabbar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 20; display: flex;
      background: var(--panel); border-top: 1px solid var(--border);
      padding-bottom: env(safe-area-inset-bottom, 0); }
    .tab { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px;
      padding: 8px 4px; background: none; border: none; font: inherit; font-size: 12px;
      color: var(--muted); cursor: pointer; }
    .tab .tab-ico { font-size: 19px; line-height: 1; }
    .tab.active { color: var(--accent); font-weight: 600; }
    .tab-badge { color: var(--accent); font-weight: 700; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>🌍 Polymarket Geopolitics</h1>
    </header>

    <section id="view-geo">
      <p class="sub">
        Markets added in the last ${windowDays} ${windowDays === 1 ? 'day' : 'days'} ·
        generated ${formatDateTime(summary.generatedAt)} ·
        auto-refreshes every ${summary.scheduleHours}h (next ~${formatDateTime(nextRun)})
      </p>

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
    </section>

    <section id="view-watch" hidden>
      <h2 class="area-title">⭐ Watchlist <span id="watch-count-h" class="area-count"></span></h2>
      <p class="sub">Saved on this device. Tap “✓ Watchlist” on any market to add it here.</p>
      <div id="watch-list" class="cards"></div>
      <div id="watch-empty" class="empty">
        <div class="empty-emoji">⭐</div>
        <p>No markets in your watchlist yet.</p>
        <p class="muted">Open the Geopolitics tab and tap “✓ Watchlist” on any market.</p>
      </div>
    </section>

    <footer>
      Data from the <a href="https://gamma-api.polymarket.com" target="_blank" rel="noopener noreferrer">Polymarket Gamma API</a>
      · tag <code>${escapeHtml(summary.tagSlug)}</code>
      <br />Not affiliated with Polymarket. For informational purposes only.
    </footer>
  </div>

  <nav class="tabbar">
    <button type="button" class="tab active" id="tab-geo" aria-selected="true">
      <span class="tab-ico">🌍</span><span>Geopolitics</span>
    </button>
    <button type="button" class="tab" id="tab-watch" aria-selected="false">
      <span class="tab-ico">⭐</span><span>Watchlist <span id="watch-count" class="tab-badge"></span></span>
    </button>
  </nav>

  <script>
  /* Update button: refresh in place in server mode, else point to GitHub. */
  (function () {
    var btn = document.getElementById('update-btn');
    var status = document.getElementById('update-status');
    var workflowUrl = ${JSON.stringify(summary.refreshUrl || '').replace(/</g, '\\u003c')};
    if (!btn) return;

    function fallback() {
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

  /* Watchlist (per-device, localStorage) + bottom tabs. */
  (function () {
    var THRESHOLD = ${Number(summary.threshold) || 0};
    var KEY = 'pm-watchlist-v1';
    var TABKEY = 'pm-tab';

    function load() {
      try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; }
    }
    function save(list) {
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {}
    }
    var list = load();
    function has(id) { return list.some(function (m) { return m.id === id; }); }
    function removeId(id) { list = list.filter(function (m) { return m.id !== id; }); }

    function fmtUsd(n) {
      n = Number(n) || 0;
      return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    }
    function rel(iso) {
      if (!iso) return '';
      var t = new Date(iso).getTime();
      if (isNaN(t)) return '';
      var m = Math.round((Date.now() - t) / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + 'm ago';
      var h = Math.round(m / 60);
      if (h < 24) return h + 'h ago';
      return Math.round(h / 24) + 'd ago';
    }

    var toggles = Array.prototype.slice.call(document.querySelectorAll('.watch-toggle'));
    function syncToggle(btn) {
      var on = has(btn.getAttribute('data-id'));
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      var label = btn.querySelector('.watch-label');
      if (label) label.textContent = on ? 'On watchlist' : 'Watchlist';
    }
    function syncTogglesFor(id) {
      toggles.forEach(function (b) { if (b.getAttribute('data-id') === id) syncToggle(b); });
    }
    function updateCounts() {
      var n = list.length;
      var badge = document.getElementById('watch-count');
      if (badge) badge.textContent = n ? '(' + n + ')' : '';
      var head = document.getElementById('watch-count-h');
      if (head) head.textContent = n ? n : '';
    }

    function renderWatch() {
      var container = document.getElementById('watch-list');
      var empty = document.getElementById('watch-empty');
      if (!container) return;
      container.textContent = '';
      if (!list.length) { if (empty) empty.hidden = false; updateCounts(); return; }
      if (empty) empty.hidden = true;

      list.forEach(function (m) {
        var over = Number(m.volume) > THRESHOLD;
        var card = document.createElement('article');
        card.className = 'card' + (over ? ' highlight' : '');

        var head = document.createElement('div');
        head.className = 'card-head';
        var h = document.createElement('h3');
        h.className = 'card-title';
        var a = document.createElement('a');
        a.href = m.url || '#'; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = m.title || 'Market';
        h.appendChild(a); head.appendChild(h);
        if (over) {
          var b = document.createElement('span');
          b.className = 'badge';
          b.textContent = '🔥 > ' + fmtUsd(THRESHOLD) + ' volume';
          head.appendChild(b);
        }
        card.appendChild(head);

        var vol = document.createElement('div');
        vol.className = 'volume';
        vol.textContent = fmtUsd(m.volume);
        var vl = document.createElement('span');
        vl.className = 'volume-label'; vl.textContent = ' volume';
        vol.appendChild(vl); card.appendChild(vol);

        var meta = document.createElement('p');
        meta.className = 'sub'; meta.style.margin = '4px 0 10px';
        var addedTxt = 'Added to watchlist ' + (rel(m.addedAt) || 'recently');
        meta.textContent = m.createdAt ? addedTxt + ' · created ' + (rel(m.createdAt) || '') : addedTxt;
        card.appendChild(meta);

        var rm = document.createElement('button');
        rm.type = 'button'; rm.className = 'remove-btn'; rm.textContent = '✕ Remove';
        rm.addEventListener('click', function () {
          removeId(m.id); save(list); syncTogglesFor(m.id); renderWatch(); updateCounts();
        });
        card.appendChild(rm);
        container.appendChild(card);
      });
      updateCounts();
    }

    toggles.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (has(id)) {
          removeId(id);
        } else {
          list.push({
            id: id,
            title: btn.getAttribute('data-title'),
            url: btn.getAttribute('data-url'),
            volume: Number(btn.getAttribute('data-vol')) || 0,
            createdAt: btn.getAttribute('data-created') || null,
            addedAt: new Date().toISOString(),
          });
        }
        save(list); syncTogglesFor(id); renderWatch(); updateCounts();
      });
    });

    function showTab(name) {
      var isW = name === 'watch';
      document.getElementById('view-geo').hidden = isW;
      document.getElementById('view-watch').hidden = !isW;
      var tg = document.getElementById('tab-geo');
      var tw = document.getElementById('tab-watch');
      tg.classList.toggle('active', !isW); tg.setAttribute('aria-selected', String(!isW));
      tw.classList.toggle('active', isW); tw.setAttribute('aria-selected', String(isW));
      try { localStorage.setItem(TABKEY, name); } catch (e) {}
      window.scrollTo(0, 0);
    }
    document.getElementById('tab-geo').addEventListener('click', function () { showTab('geo'); });
    document.getElementById('tab-watch').addEventListener('click', function () { showTab('watch'); });

    toggles.forEach(syncToggle);
    renderWatch();
    updateCounts();
    var saved = 'geo';
    try { saved = localStorage.getItem(TABKEY) || 'geo'; } catch (e) {}
    showTab(saved);
  })();
  </script>
</body>
</html>
`;
}
