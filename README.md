# PM Screener — Polymarket multi-category market screener

A phone-friendly screener over several Polymarket categories, refreshed **every
6 hours** (and on demand via an **Update** button). It has a bottom tab bar with:

- **Category tabs** — **Geopolitics, Tech, Politics, IPO** (configurable). Each
  lists markets **added in the last 7 days**, with the ones added in the **last
  2 days** pulled into a prominent area on top, and markets **over $3,000 volume
  highlighted in yellow** and pinned.
- **🚀 Movers** — markets across all categories whose probability moved
  **&gt; 20 points in 24h**, plus a subsection **&gt; 30 points in 3 days**.
- **🎯 High chance** — markets across all categories priced **60–92%**.
- **⭐ Watchlist** — markets you've ticked, saved in your browser.

Data comes from the public [Polymarket Gamma API](https://gamma-api.polymarket.com).

## What it does

On each cycle (and whenever you press **Update now**) the app:

1. Fetches every open event for each category tag from the Gamma API.
2. Per category: records when each market was first seen, keeps those **added in
   the last 7 days**, and splits them **without duplication** into
   **🆕 Just added — last 2 days** (top) and **🗓️ Added 2–7 days ago** (below).
   Markets **&gt; $3,000 volume** are highlighted and pinned. (Set
   `SHOW_ONLY_HIGHLIGHTED=true` to hide the rest.)
3. Records a **price snapshot** for each market, then computes **Movers** and
   **High chance** across all categories from that history.
4. Renders a self-contained HTML report (`public/index.html`) plus a
   machine-readable `public/data.json`.

### Movers — a note on the "warm-up"

Gamma doesn't expose an arbitrary-window price change, so the screener stores its
own price snapshot each run and measures moves against it. That means Movers
**warms up**: the **24h** list fills within about a day of runs (it also uses
Gamma's own 1‑day change as an immediate fallback where present), and the
**3‑day** list after about three days.

### Watchlist

Every market card — in any tab — has a **✓ Watchlist** tick: tap to add, tap
again to remove. The **⭐ Watchlist** tab lists what you've added, in order,
each with its own **Remove** button.

It's stored in your browser's `localStorage`, so it is **per device and per
browser** — it survives refreshes and the 6‑hourly redeploys, but is not shared
between devices and never leaves your browser. Each market's details are saved
when you add it, so it stays even after it ages out of a list.

### The "Update now" button

The report has an **Update now** button so you don't have to wait for the next
6‑hour refresh:

- **Server mode** (`npm start`, or any always-on host): the button refreshes the
  data in place and reloads the page.
- **Static hosting** (GitHub Pages): a static page can't regenerate its own data,
  so the button instead links you to **Run** the GitHub Actions workflow, which
  regenerates and republishes the page in about a minute. The link target is
  filled in automatically in CI (from `GITHUB_REPOSITORY`).

## Requirements

- **Node.js ≥ 18** (uses the built-in `fetch`). Developed on Node 22.
- **Zero runtime dependencies** — only the Node standard library.

## Run it

```bash
# One-shot: fetch, diff, and write the report to ./public
npm run generate

# Long-running server: serves the latest report and refreshes every 6 hours
npm start
# then open http://localhost:3000
```

### Server endpoints

| Path         | Description                                            |
| ------------ | ----------------------------------------------------- |
| `/`          | The latest HTML report                                |
| `/data.json` | The latest summary as JSON                            |
| `/run`       | Trigger a refresh on demand (used by the Update button) |
| `/healthz`   | Status: last run time, last error, config, last stats |

## Run automatically every 6 hours

Two supported ways to hit the 6‑hour cadence:

### 1. GitHub Actions + GitHub Pages (recommended — no computer to keep on)

`.github/workflows/geopolitics-summary.yml` runs on a `cron` of `0 */6 * * *`,
entirely on GitHub's servers. Each run regenerates the report, **publishes it to
GitHub Pages**, and commits the small `data/state.json` back so the next run can
tell what's newly added. You can also trigger it on demand from the **Actions**
tab (_Run workflow_).

**One-time setup:**

1. In your repo, open **Settings → Pages**. Under **Build and deployment →
   Source**, choose **GitHub Actions**.
2. Open the **Actions** tab, select **Geopolitics market summary**, and click
   **Run workflow** to publish immediately (otherwise it waits for the next
   6‑hour slot).
3. Your report is then live at
   `https://<your-username>.github.io/<your-repo>/` — bookmark it on your phone.

> Notes: scheduled workflows run from the repository's **default branch**, so
> keep this workflow on your default branch. GitHub Pages is free for **public**
> repositories; for private repos it needs a paid GitHub plan.

### 2. Long-running server (`npm start`)

The built-in scheduler (`src/scheduler.js`) fires on aligned UTC boundaries
(00:00 / 06:00 / 12:00 / 18:00 for a 6‑hour period) and re-arms after each run.
Deploy it anywhere that keeps a Node process alive (a VM, a container, a PaaS).

## Configuration

Everything is configurable via environment variables (defaults match the task):

| Variable                  | Default                             | Meaning                                        |
| ------------------------- | ----------------------------------- | ---------------------------------------------- |
| `GAMMA_API_BASE`          | `https://gamma-api.polymarket.com`  | Gamma API base URL                             |
| `CATEGORY_SLUGS`          | `geopolitics,tech,politics,ipo`     | Comma-separated Polymarket tags to show as tabs |
| `VOLUME_THRESHOLD`        | `3000`                              | Highlight/pin markets with volume above this   |
| `SCHEDULE_HOURS`          | `6`                                 | Refresh cadence in hours                       |
| `WINDOW_DAYS`             | `7`                                 | Rolling window: list markets added in last N days |
| `FRESH_DAYS`              | `2`                                 | Markets newer than this go in the top "Just added" area |
| `SHOW_ONLY_HIGHLIGHTED`   | `false`                             | If `true`, list only markets over the threshold |
| `MOVER_DAY_PCT`           | `20`                                | Movers: min points moved in 24h                |
| `MOVER_3D_PCT`            | `30`                                | Movers: min points moved in 3 days             |
| `HIGH_MIN` / `HIGH_MAX`   | `0.6` / `0.92`                      | High-chance price band (0–1)                   |
| `PRICE_TRACK_MIN_VOLUME`  | `1000`                              | Only snapshot prices for markets above this volume |
| `MAX_EVENTS`              | `600`                               | Max events fetched per category per refresh    |
| `OUTPUT_DIR`              | `public`                            | Where the report is written                    |
| `STATE_FILE`              | `data/state.json`                   | Where first-seen + price-history state is kept |
| `WORKFLOW_URL`            | _(auto in CI)_                      | GitHub Actions URL the Update button links to on Pages |
| `PORT` / `HOST`           | `3000` / `0.0.0.0`                  | Server bind address                            |
| `RUN_ON_START`            | `true`                              | Run one refresh immediately on server start    |

## Project layout

```
src/
  config.js        env-driven configuration (categories, thresholds, bands)
  gammaClient.js   Gamma API client (per-tag fetch across categories)
  normalize.js     raw event -> market; price extraction (pure)
  marketStore.js   first-seen state + window/fresh selection + price state (pure)
  prices.js        price-history snapshots, Movers & High-chance (pure)
  summary.js       per-category highlight/sort + model assembly (pure)
  render.js        multi-tab HTML + watchlist + Update button (pure)
  refresh.js       one full cycle: fetch -> analyse -> render -> persist
  scheduler.js     drift-safe 6-hour scheduler
  server.js        zero-dep HTTP server (serves report, /run refresh)
  cli.js           one-shot entrypoint (npm run generate)
  index.js         server mode entrypoint (npm start)
test/              node:test unit tests + fixtures
.github/workflows/ 6-hourly scheduled run + Pages publish
```

## Tests

```bash
npm test
```

Covers price coercion and Yes-price derivation, priced-market extraction, the
first-seen reconcile, the 7-day window and fresh/earlier split, the
highlight-and-sort rule, price-history recording/pruning, the Movers (24h +
3‑day, with Gamma fallback) and High-chance selection, the multi-tab render, and
HTML escaping. The interactive UI (tab switching across all tabs, the watchlist
tick add/remove, per-item remove, `localStorage` persistence) is verified
separately in a headless browser.

## Notes & disclaimer

- The `>$3,000` threshold is **exclusive** (a market at exactly $3,000 is not
  highlighted), matching "over $3,000".
- Category lists screen Gamma **events** (the cards you browse) by aggregate
  volume; **Movers** and **High chance** operate on individual **markets** (the
  units that carry a Yes price).
- If a category tab is empty, its Polymarket tag slug may differ from the default
  — adjust it via `CATEGORY_SLUGS`.
- Movers depends on the app's own price history, so it warms up over ~3 days (see
  above). Price history is kept in `data/state.json`, which therefore grows;
  it's pruned to a rolling window to stay small.
- The watchlist lives only in your browser (`localStorage`) — per device, not
  shared, and never sent anywhere.
- Not affiliated with Polymarket. For informational purposes only; not
  financial advice.
