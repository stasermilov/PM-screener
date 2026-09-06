// Render the summary data model into a self-contained, multi-tab HTML page.
//
// Tabs (in a horizontally scrollable bottom bar): one per category
// (Geopolitics, Tech, Politics, IPO), then Movers, High chance, and a
// client-side Watchlist. Category and Movers/High-chance views are rendered
// server-side; the Watchlist is backed by the viewer's browser localStorage.

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

export function pctStr(x) {
  return x == null || !Number.isFinite(Number(x)) ? '—' : `${Math.round(Number(x) * 100)}%`;
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
  });
}

function relativeTime(iso, now = new Date()) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((now.getTime() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function nextRunIso(generatedAt, scheduleHours) {
  return new Date(new Date(generatedAt).getTime() + scheduleHours * 3600 * 1000).toISOString();
}

function renderTags(tags) {
  if (!tags?.length) return '';
  return `<div class="tags">${tags.slice(0, 6).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>`;
}

function badge(threshold) {
  return `<span class="badge">🔥 &gt; ${formatUsd(threshold)} volume</span>`;
}

function createdCell(iso, now) {
  return iso ? `${formatDateTime(iso)} <span class="muted">(${relativeTime(iso, now)})</span>` : '—';
}

/** The watchlist tick button. Carries the data the Watchlist tab needs so an
 *  item stays visible even after it leaves the source list. */
function watchBtn(d) {
  return `<button type="button" class="watch-toggle" aria-pressed="false"
          data-id="${escapeHtml(d.id)}"
          data-title="${escapeHtml(d.title)}"
          data-url="${escapeHtml(d.url)}"
          data-vol="${Number(d.volume) || 0}"
          data-chance="${d.chance != null && d.chance !== '' ? Number(d.chance) : ''}"
          data-created="${escapeHtml(d.created || '')}"
          data-cat="${escapeHtml(d.cat || '')}"
          data-catemoji="${escapeHtml(d.catemoji || '')}">
          <span class="box" aria-hidden="true">✓</span><span class="watch-label">Watchlist</span>
        </button>`;
}

// --- Category (event) cards ---

function renderEventCard(m, now, threshold, opts = {}) {
  const freshTag = opts.fresh ? '<span class="fresh-tag">🆕</span> ' : '';
  return `
      <article class="card${m.highlighted ? ' highlight' : ''}">
        <div class="card-head">
          <h3 class="card-title">
            ${freshTag}<a href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.title)}</a>
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
        <div class="card-actions">${watchBtn({ id: `ev:${m.id}`, title: m.title, url: m.url, volume: m.volume, created: m.createdAt })}</div>
      </article>`;
}

function renderArea({ bucket, title, emoji, badgeClass, threshold, now, emptyText }) {
  const count = bucket.items.length ? `<span class="area-count">${bucket.items.length}</span>` : '';
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

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Generic paginated list: 1–100 / 101–200 chips + pages. */
function renderPaginated(group, items, pageSize, renderItem) {
  const pages = chunk(items, pageSize);
  const chips = pages
    .map((_, i) => {
      const start = i * pageSize + 1;
      const end = Math.min((i + 1) * pageSize, items.length);
      return `<button type="button" class="pager-chip${i === 0 ? ' active' : ''}" data-pager="${group}" data-page="${i}">${start}–${end}</button>`;
    })
    .join('');

  const pageDivs = pages
    .map(
      (pg, i) => `
        <div class="pager-page" data-pager="${group}" data-page="${i}"${i === 0 ? '' : ' hidden'}>
          <div class="cards">
${pg.map(renderItem).join('\n')}
          </div>
        </div>`,
    )
    .join('');

  return `<div class="pager">${chips}</div>\n${pageDivs}`;
}

/** Paginated flat list for a big category: 1–100 / 101–200 chips + pages. */
function renderPaginatedCategory(cat, summary, now) {
  const threshold = summary.threshold;
  const pageSize = summary.categoryPageSize || 100;
  const freshIds = new Set(cat.fresh.items.map((m) => m.id));
  const items = [...cat.fresh.items, ...cat.earlier.items];
  const group = `pg-${cat.slug}`;

  const body = renderPaginated(group, items, pageSize, (m) =>
    renderEventCard(m, now, threshold, { fresh: freshIds.has(m.id) }),
  );

  return `
      <p class="sub">${items.length} markets in the last ${summary.windowDays} days · 🆕 = added in the last ${summary.freshDays} days</p>
      ${body}`;
}

function renderCategoryView(cat, summary, now) {
  const threshold = summary.threshold;
  const note = cat.error
    ? `<div class="empty"><p class="muted">Couldn't load this category: ${escapeHtml(cat.error)}</p></div>`
    : cat.tracked === 0
      ? `<div class="empty"><p class="muted">No open markets found for the “${escapeHtml(cat.slug)}” tag. If this stays empty, the tag slug may differ — tell me and I'll adjust it.</p></div>`
      : '';

  let body;
  if (cat.totals.windowCount > (summary.categoryPageSize || 100)) {
    body = renderPaginatedCategory(cat, summary, now);
  } else {
    const fresh = renderArea({
      bucket: cat.fresh,
      title: `Just added — last ${summary.freshDays} ${summary.freshDays === 1 ? 'day' : 'days'}`,
      emoji: '🆕', badgeClass: 'area-fresh', threshold, now,
      emptyText: `Nothing new in the last ${summary.freshDays} days. Check the list below.`,
    });
    const earlier = renderArea({
      bucket: cat.earlier,
      title: `Added ${summary.freshDays}–${summary.windowDays} days ago`,
      emoji: '🗓️', badgeClass: 'area-earlier', threshold, now,
      emptyText: `No markets were added ${summary.freshDays}–${summary.windowDays} days ago.`,
    });
    body = `<p class="sub">Markets added in the last ${summary.windowDays} days${cat.tracked != null ? ` · ${cat.tracked} open markets tracked` : ''}</p>
      ${fresh}
      ${cat.totals.windowCount > 0 ? earlier : ''}`;
  }

  return `
    <section class="view" id="view-cat-${escapeHtml(cat.slug)}" hidden>
      <h1 class="view-title">${cat.emoji} ${escapeHtml(cat.label)}</h1>
      ${note}
      ${body}
    </section>`;
}

// --- Market cards (Movers, High chance) ---

function catBadge(m) {
  if (!m.categoryLabel) return '';
  return `<span class="cat-badge">${escapeHtml(m.categoryEmoji || '')} ${escapeHtml(m.categoryLabel)}</span>`;
}

function changeStr(m) {
  const pts = Math.round((m.change || 0) * 100);
  const up = (m.change || 0) >= 0;
  const from = m.from != null ? pctStr(m.from) : '?';
  const to = pctStr(m.to != null ? m.to : m.chance);
  return `<span class="chg ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${up ? '+' : ''}${pts} pts</span> <span class="muted">${from} → ${to}</span>`;
}

function renderMarketCard(m, threshold, { showChange = false } = {}) {
  const hl = Number(m.volume) > threshold;
  return `
      <article class="card${hl ? ' highlight' : ''}">
        <div class="card-head">
          <h3 class="card-title">
            <a href="${escapeHtml(m.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(m.question)}</a>
          </h3>
          ${catBadge(m)}
        </div>
        <div class="marketmeta">
          <span class="chance">${pctStr(m.chance)} <span class="muted">chance</span></span>
          ${showChange ? `<span class="sep">·</span> ${changeStr(m)}` : ''}
          <span class="sep">·</span> <span class="muted">${formatUsd(m.volume)} vol</span>
        </div>
        <div class="card-actions">${watchBtn({ id: m.id, title: m.question, url: m.url, volume: m.volume, chance: m.chance, cat: m.categoryLabel, catemoji: m.categoryEmoji })}</div>
      </article>`;
}

function renderMarketList(items, threshold, opts) {
  return items.map((m) => renderMarketCard(m, threshold, opts)).join('\n');
}

function renderMoversView(summary) {
  const t = summary.threshold;
  const pageSize = summary.categoryPageSize || 100;
  const d = summary.movers.day;
  const td = summary.movers.threeDay;
  const warm = 'Nothing here yet. Moves are measured from the app\'s own price snapshots, so 24h fills in after ~a day of runs and 3-day after ~3 days.';
  const renderOne = (m) => renderMarketCard(m, t, { showChange: true });

  const dayBody = !d.items.length
    ? `<div class="empty"><p class="muted">${escapeHtml(warm)}</p></div>`
    : d.items.length > pageSize
      ? renderPaginated('pg-movers-day', d.items, pageSize, renderOne)
      : `<div class="cards">${renderMarketList(d.items, t, { showChange: true })}</div>`;
  const tdBody = !td.items.length
    ? `<div class="empty"><p class="muted">${escapeHtml(warm)}</p></div>`
    : td.items.length > pageSize
      ? renderPaginated('pg-movers-3d', td.items, pageSize, renderOne)
      : `<div class="cards">${renderMarketList(td.items, t, { showChange: true })}</div>`;

  const cap = (grp) => (grp.total > grp.items.length ? ` <span class="area-count">showing top ${grp.items.length} of ${grp.total}</span>` : ` <span class="area-count">${grp.total}</span>`);

  return `
    <section class="view" id="view-movers" hidden>
      <h1 class="view-title">🚀 Movers</h1>
      <p class="sub">Biggest probability swings across all categories.</p>
      <section class="area">
        <h2 class="area-title">Moved &gt; ${summary.movers.dayPct} pts in 24h${cap(d)}</h2>
${dayBody}
      </section>
      <section class="area">
        <h2 class="area-title">Moved &gt; ${summary.movers.threeDayPct} pts in 3 days${cap(td)}</h2>
${tdBody}
      </section>
    </section>`;
}

function renderHighChanceView(summary) {
  const h = summary.highChance;
  const pageSize = summary.categoryPageSize || 100;
  const t = summary.threshold;
  const renderOne = (m) => renderMarketCard(m, t, { showChange: false });
  const body = !h.items.length
    ? `<div class="empty"><p class="muted">No markets are currently priced ${pctStr(h.min)}–${pctStr(h.max)}.</p></div>`
    : h.items.length > pageSize
      ? renderPaginated('pg-highchance', h.items, pageSize, renderOne)
      : `<div class="cards">${renderMarketList(h.items, t, { showChange: false })}</div>`;
  const cap = h.total > h.items.length ? `<span class="area-count">showing top ${h.items.length} of ${h.total}</span>` : `<span class="area-count">${h.total}</span>`;
  return `
    <section class="view" id="view-highchance" hidden>
      <h1 class="view-title">🎯 High chance</h1>
      <p class="sub">Markets priced between ${pctStr(h.min)} and ${pctStr(h.max)}, across all categories.</p>
      <section class="area">
        <h2 class="area-title">Priced ${pctStr(h.min)}–${pctStr(h.max)} ${cap}</h2>
${body}
      </section>
    </section>`;
}

function renderExcludedRow(x) {
  return `
      <article class="card excluded-card">
        <div class="card-head">
          <h3 class="card-title">
            <a href="${escapeHtml(x.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(x.title)}</a>
          </h3>
          <span class="reason-badge reason-${escapeHtml(x.reasonId)}">${escapeHtml(x.reason)}</span>
        </div>
        <div class="marketmeta">
          ${x.categoryLabel ? `<span class="cat-badge">${escapeHtml(x.categoryEmoji || '')} ${escapeHtml(x.categoryLabel)}</span> <span class="sep">·</span>` : ''}
          <span class="muted">matched:</span> <code>${escapeHtml(x.matched)}</code>
        </div>
      </article>`;
}

function renderExcludedView(summary) {
  const items = summary.excluded || [];
  const pageSize = summary.categoryPageSize || 100;
  const counts = {};
  for (const x of items) counts[x.reason] = (counts[x.reason] || 0) + 1;
  const chips = Object.entries(counts)
    .map(([r, n]) => `<span class="tag">${escapeHtml(r)}: ${n}</span>`)
    .join(' ');
  const body = !items.length
    ? `<div class="empty"><div class="empty-emoji">🧹</div><p>Nothing excluded this cycle.</p></div>`
    : items.length > pageSize
      ? renderPaginated('pg-excluded', items, pageSize, renderExcludedRow)
      : `<div class="cards">${items.map(renderExcludedRow).join('\n')}</div>`;
  return `
    <section class="view" id="view-excluded" hidden>
      <h1 class="view-title">🚫 Excluded <span class="area-count">${items.length}</span></h1>
      <p class="sub">Markets filtered out of every tab (X/Twitter posts, Trump insults, mentions, and "word said during an event"). Listed here so you can audit the filter. Each row shows the reason and the phrase that matched.</p>
      ${items.length ? `<div class="tags" style="margin-bottom:14px">${chips}</div>` : ''}
${body}
    </section>`;
}

function renderWatchView() {
  return `
    <section class="view" id="view-watch" hidden>
      <h1 class="view-title">⭐ Watchlist <span id="watch-count-h" class="area-count"></span></h1>
      <p class="sub">Saved on this device. Tap “✓ Watchlist” on any market to add it here.</p>
      <div id="watch-list" class="cards"></div>
      <div id="watch-empty" class="empty">
        <div class="empty-emoji">⭐</div>
        <p>No markets in your watchlist yet.</p>
        <p class="muted">Open any tab and tap “✓ Watchlist” on a market.</p>
      </div>
    </section>`;
}

function renderTabbar(summary) {
  const catTabs = summary.categories
    .map((c) => `<button type="button" class="tab" data-view="view-cat-${escapeHtml(c.slug)}"><span class="tab-ico">${c.emoji}</span><span>${escapeHtml(c.label)}</span></button>`)
    .join('\n');
  return `
  <nav class="tabbar" id="tabbar">
${catTabs}
    <button type="button" class="tab" data-view="view-movers"><span class="tab-ico">🚀</span><span>Movers</span></button>
    <button type="button" class="tab" data-view="view-highchance"><span class="tab-ico">🎯</span><span>High chance</span></button>
    <button type="button" class="tab" data-view="view-excluded"><span class="tab-ico">🚫</span><span>Excluded</span></button>
    <button type="button" class="tab" data-view="view-watch"><span class="tab-ico">⭐</span><span>Watchlist <span id="watch-count" class="tab-badge"></span></span></button>
  </nav>`;
}

/** Render the full HTML document for a summary. */
export function renderHtml(summary, opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date(summary.generatedAt);
  const threshold = summary.threshold;
  const nextRun = nextRunIso(summary.generatedAt, summary.scheduleHours);
  const defaultView = summary.categories.length ? `view-cat-${summary.categories[0].slug}` : 'view-movers';

  const categoryViews = summary.categories.map((c) => renderCategoryView(c, summary, now)).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <!-- Best-effort: ask browsers to revalidate so new deploys aren't masked by cache. -->
  <meta http-equiv="Cache-Control" content="no-cache, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <title>Polymarket Screener</title>
  <style>
    :root {
      --bg: #f5f6f8; --panel: #ffffff; --text: #16181d; --muted: #6b7280;
      --border: #e5e7eb; --accent: #2f6fed; --hl-bg: ${HL_BG}; --hl-border: #f2d024;
      --chip: #eef1f6; --danger: #b42318; --up: #157347; --down: #b42318;
      --fresh-bg: #eef4ff; --fresh-border: #cdddff; --fresh-title: #1d4ed8;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0f1115; --panel: #171a21; --text: #e9eaee; --muted: #9aa1ac;
        --border: #262b34; --accent: #6ea0ff; --hl-bg: #4a4110; --hl-border: #b8952a;
        --chip: #232833; --danger: #ff8a80; --up: #4ade80; --down: #ff8a80;
        --fresh-bg: #131c2e; --fresh-border: #24406e; --fresh-title: #8fb4ff;
      }
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); padding-bottom: 76px;
      font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .wrap { max-width: 900px; margin: 0 auto; padding: 20px 16px 40px; }
    h1.app { font-size: 22px; margin: 0 0 4px; }
    .view-title { font-size: 22px; margin: 0 0 4px; }
    .sub { color: var(--muted); margin: 0 0 16px; font-size: 13px; }
    .legend { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted);
      background: var(--panel); border: 1px solid var(--border); padding: 6px 12px; border-radius: 999px; margin: 0 0 16px; }
    .swatch { width: 14px; height: 14px; border-radius: 3px; background: var(--hl-bg); border: 1px solid var(--hl-border); display: inline-block; }
    .updatebar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px 14px; margin-bottom: 16px; }
    .update-btn { font: inherit; font-weight: 600; cursor: pointer; color: #fff; background: var(--accent);
      border: none; padding: 9px 16px; border-radius: 10px; }
    .update-btn:hover { filter: brightness(1.05); }
    .update-btn:disabled { opacity: .6; cursor: default; }
    .update-status { font-size: 13px; color: var(--muted); }
    .update-status a { color: var(--accent); }
    .area { margin-bottom: 26px; }
    .area-title { font-size: 18px; margin: 0 0 12px; }
    .area-count { font-weight: 400; font-size: 13px; color: var(--muted); }
    .area-fresh { background: var(--fresh-bg); border: 1px solid var(--fresh-border); border-radius: 16px; padding: 16px 16px 4px; }
    .area-fresh .area-title { color: var(--fresh-title); }
    .area-earlier .area-title { color: var(--muted); font-size: 16px; }
    .card { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; margin-bottom: 12px; }
    .card.highlight { background: var(--hl-bg); border-color: var(--hl-border); box-shadow: 0 0 0 1px var(--hl-border); }
    .card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .card-title { font-size: 16px; margin: 0; }
    .card-title a { color: var(--text); text-decoration: none; }
    .card-title a:hover { color: var(--accent); text-decoration: underline; }
    .badge { flex: none; font-size: 12px; font-weight: 700; white-space: nowrap; background: var(--hl-border);
      color: #3a2f00; padding: 4px 10px; border-radius: 999px; }
    .cat-badge { flex: none; font-size: 12px; white-space: nowrap; background: var(--chip); color: var(--muted);
      padding: 3px 9px; border-radius: 999px; }
    .fresh-tag { font-size: 12px; }
    .pager { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 16px; }
    .pager-chip { font: inherit; font-size: 13px; cursor: pointer; background: var(--panel); color: var(--text);
      border: 1px solid var(--border); border-radius: 999px; padding: 6px 13px; }
    .pager-chip.active { background: var(--accent); color: #fff; border-color: var(--accent); }
    .reason-badge { flex: none; font-size: 12px; font-weight: 600; white-space: nowrap; padding: 3px 9px;
      border-radius: 999px; background: var(--chip); color: var(--muted); }
    .reason-x-posts { background: #e0f2fe; color: #075985; }
    .reason-trump-insults { background: #fee2e2; color: #991b1b; }
    .reason-mentions { background: #fef3c7; color: #92400e; }
    .reason-said-during-event { background: #ede9fe; color: #5b21b6; }
    .excluded-card code { background: var(--chip); padding: 1px 6px; border-radius: 6px; }
    .volume { font-size: 19px; font-weight: 700; margin: 8px 0 4px; }
    .volume-label { font-size: 13px; font-weight: 400; color: var(--muted); }
    .marketmeta { font-size: 14px; margin: 8px 0 2px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .chance { font-weight: 700; }
    .chg { font-weight: 700; }
    .chg.up { color: var(--up); }
    .chg.down { color: var(--down); }
    .sep { color: var(--muted); }
    .desc { margin: 6px 0 10px; color: var(--muted); }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .tag { font-size: 12px; background: var(--chip); color: var(--muted); padding: 2px 8px; border-radius: 999px; }
    .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 6px 18px; margin: 0; font-size: 13px; }
    .facts div { display: flex; gap: 6px; }
    .facts dt { color: var(--muted); margin: 0; }
    .facts dt:not(:empty)::after { content: ":"; }
    .facts dd { margin: 0; }
    .muted { color: var(--muted); }
    .card-actions { margin-top: 12px; }
    .watch-toggle { display: inline-flex; align-items: center; gap: 7px; font: inherit; font-size: 13px; cursor: pointer;
      background: var(--panel); color: var(--muted); border: 1px solid var(--border); border-radius: 999px; padding: 6px 13px; }
    .watch-toggle .box { width: 16px; height: 16px; border: 1.5px solid currentColor; border-radius: 5px;
      display: inline-flex; align-items: center; justify-content: center; font-size: 12px; line-height: 1; color: transparent; }
    .watch-toggle.on { color: var(--accent); border-color: var(--accent); background: var(--fresh-bg); }
    .watch-toggle.on .box { background: var(--accent); border-color: var(--accent); color: #fff; }
    .remove-btn { font: inherit; font-size: 13px; cursor: pointer; color: var(--danger); background: transparent;
      border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; margin-top: 10px; }
    .remove-btn:hover { border-color: var(--danger); }
    .empty { text-align: center; padding: 32px 16px; background: var(--panel); border: 1px dashed var(--border); border-radius: 14px; margin-bottom: 12px; }
    .empty-emoji { font-size: 36px; }
    footer { margin-top: 8px; color: var(--muted); font-size: 12px; text-align: center; }
    footer a { color: var(--accent); }
    .tabbar { position: fixed; bottom: 0; left: 0; right: 0; z-index: 20; display: flex; overflow-x: auto;
      -webkit-overflow-scrolling: touch; background: var(--panel); border-top: 1px solid var(--border);
      padding-bottom: env(safe-area-inset-bottom, 0); scrollbar-width: none; }
    .tabbar::-webkit-scrollbar { display: none; }
    .tab { flex: 0 0 auto; min-width: 82px; display: flex; flex-direction: column; align-items: center; gap: 2px;
      padding: 8px 12px; background: none; border: none; font: inherit; font-size: 12px; color: var(--muted); cursor: pointer; white-space: nowrap; }
    .tab .tab-ico { font-size: 19px; line-height: 1; }
    .tab.active { color: var(--accent); font-weight: 600; }
    .tab-badge { color: var(--accent); font-weight: 700; }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1 class="app">📊 Polymarket Screener</h1>
      <p class="sub">
        Refreshes every ${summary.scheduleHours}h · generated ${formatDateTime(summary.generatedAt)} · next ~${formatDateTime(nextRun)}
      </p>
      <div class="updatebar">
        <button type="button" class="update-btn" id="update-btn">🔄 Update now</button>
        <span class="update-status" id="update-status"></span>
      </div>
      <div class="legend"><span class="swatch"></span> Highlighted &amp; pinned: over ${formatUsd(threshold)} volume</div>
    </header>

    <main>
${categoryViews}
${renderMoversView(summary)}
${renderHighChanceView(summary)}
${renderExcludedView(summary)}
${renderWatchView()}
    </main>

    <footer>
      Data from the <a href="https://gamma-api.polymarket.com" target="_blank" rel="noopener noreferrer">Polymarket Gamma API</a>
      <br />Not affiliated with Polymarket. For informational purposes only.
    </footer>
  </div>
${renderTabbar(summary)}

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
        .then(function (res) { if (!res.ok) throw new Error('no server'); return res.json().catch(function () { return {}; }); })
        .then(function (data) {
          if (data && data.ok === false) throw new Error('server error');
          status.textContent = 'Updated ✓ Reloading…';
          setTimeout(function () { location.reload(); }, 1200);
        })
        .catch(fallback);
    });
  })();

  /* Watchlist (per-device, localStorage) + tab switching. */
  (function () {
    var KEY = 'pm-watchlist-v1';
    var TABKEY = 'pm-tab-v2';
    var DEFAULT_VIEW = ${JSON.stringify(defaultView)};

    function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
    function save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} }
    var list = load();
    var has = function (id) { return list.some(function (m) { return m.id === id; }); };
    var removeId = function (id) { list = list.filter(function (m) { return m.id !== id; }); };

    function fmtUsd(n) { n = Number(n) || 0; return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }); }
    function pct(x) { return (x == null || x === '' || isNaN(Number(x))) ? null : Math.round(Number(x) * 100) + '%'; }
    function rel(iso) {
      if (!iso) return '';
      var t = new Date(iso).getTime(); if (isNaN(t)) return '';
      var m = Math.round((Date.now() - t) / 60000);
      if (m < 1) return 'just now'; if (m < 60) return m + 'm ago';
      var h = Math.round(m / 60); if (h < 24) return h + 'h ago';
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
    function syncFor(id) { toggles.forEach(function (b) { if (b.getAttribute('data-id') === id) syncToggle(b); }); }
    function counts() {
      var n = list.length;
      var b = document.getElementById('watch-count'); if (b) b.textContent = n ? '(' + n + ')' : '';
      var h = document.getElementById('watch-count-h'); if (h) h.textContent = n ? n : '';
    }

    function renderWatch() {
      var box = document.getElementById('watch-list');
      var empty = document.getElementById('watch-empty');
      if (!box) return;
      box.textContent = '';
      if (!list.length) { if (empty) empty.hidden = false; counts(); return; }
      if (empty) empty.hidden = true;
      list.forEach(function (m) {
        var card = document.createElement('article');
        card.className = 'card';
        var head = document.createElement('div'); head.className = 'card-head';
        var h = document.createElement('h3'); h.className = 'card-title';
        var a = document.createElement('a'); a.href = m.url || '#'; a.target = '_blank'; a.rel = 'noopener noreferrer';
        a.textContent = m.title || 'Market'; h.appendChild(a); head.appendChild(h);
        if (m.cat) { var cb = document.createElement('span'); cb.className = 'cat-badge'; cb.textContent = (m.catemoji ? m.catemoji + ' ' : '') + m.cat; head.appendChild(cb); }
        card.appendChild(head);
        var meta = document.createElement('div'); meta.className = 'marketmeta';
        var bits = [];
        var p = pct(m.chance); if (p) bits.push(p + ' chance');
        bits.push(fmtUsd(m.volume) + ' vol');
        meta.textContent = bits.join(' · ');
        card.appendChild(meta);
        var sub = document.createElement('p'); sub.className = 'sub'; sub.style.margin = '4px 0 10px';
        sub.textContent = 'Added ' + (rel(m.addedAt) || 'recently');
        card.appendChild(sub);
        var rm = document.createElement('button'); rm.type = 'button'; rm.className = 'remove-btn'; rm.textContent = '✕ Remove';
        rm.addEventListener('click', function () { removeId(m.id); save(list); syncFor(m.id); renderWatch(); counts(); });
        card.appendChild(rm);
        box.appendChild(card);
      });
      counts();
    }

    toggles.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        if (has(id)) { removeId(id); }
        else {
          list.push({
            id: id,
            title: btn.getAttribute('data-title'),
            url: btn.getAttribute('data-url'),
            volume: Number(btn.getAttribute('data-vol')) || 0,
            chance: btn.getAttribute('data-chance') !== '' ? Number(btn.getAttribute('data-chance')) : null,
            cat: btn.getAttribute('data-cat') || '',
            catemoji: btn.getAttribute('data-catemoji') || '',
            createdAt: btn.getAttribute('data-created') || null,
            addedAt: new Date().toISOString(),
          });
        }
        save(list); syncFor(id); renderWatch(); counts();
      });
    });

    // Per-category pagination chips (1-100 / 101-200 / ...).
    Array.prototype.slice.call(document.querySelectorAll('.pager-chip')).forEach(function (chip) {
      chip.addEventListener('click', function () {
        var group = chip.getAttribute('data-pager');
        var page = chip.getAttribute('data-page');
        Array.prototype.slice.call(document.querySelectorAll('.pager-page')).forEach(function (p) {
          if (p.getAttribute('data-pager') === group) p.hidden = p.getAttribute('data-page') !== page;
        });
        Array.prototype.slice.call(document.querySelectorAll('.pager-chip')).forEach(function (c) {
          if (c.getAttribute('data-pager') === group) c.classList.toggle('active', c === chip);
        });
        window.scrollTo(0, 0);
      });
    });

    var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab'));
    var views = Array.prototype.slice.call(document.querySelectorAll('.view'));
    function showView(id) {
      if (!document.getElementById(id)) id = DEFAULT_VIEW;
      views.forEach(function (v) { v.hidden = v.id !== id; });
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-view') === id;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', String(on));
        if (on && t.scrollIntoView) t.scrollIntoView({ inline: 'center', block: 'nearest' });
      });
      try { localStorage.setItem(TABKEY, id); } catch (e) {}
      window.scrollTo(0, 0);
    }
    tabs.forEach(function (t) { t.addEventListener('click', function () { showView(t.getAttribute('data-view')); }); });

    toggles.forEach(syncToggle);
    renderWatch();
    counts();
    var saved = DEFAULT_VIEW;
    try { saved = localStorage.getItem(TABKEY) || DEFAULT_VIEW; } catch (e) {}
    showView(saved);
  })();
  </script>
</body>
</html>
`;
}
