# PM Screener — Polymarket Geopolitics new-market summary

An app that summarizes **markets added under the _Geopolitics_ category on
Polymarket in the last 7 days**, refreshed **every 6 hours** (and on demand via
an **Update** button). Markets added in the **last 2 days** get their own
prominent area at the top, and markets with **over $3,000 volume are highlighted
in yellow and pinned to the top** of each list.

Data comes from the public [Polymarket Gamma API](https://gamma-api.polymarket.com).

## What it does

On each cycle (and whenever you press **Update now**) the app:

1. Fetches every open event under the `geopolitics` tag from the Gamma API.
2. Records when each market was first seen, then keeps those **added within the
   last 7 days** (a rolling window, independent of how often it refreshes).
3. Splits them into two areas so the newest stand out, **without duplication**:
   - **🆕 Just added — last 2 days** (top, highlighted area).
   - **🗓️ Added 2–7 days ago** (below).
   Each area is broken into **Markets** (the event cards you browse on
   Polymarket) and **Sub-markets** (the individual outcome markets inside each
   event).
4. Applies the highlight rule within **every group**: any item with **volume
   &gt; $3,000** is highlighted in yellow and sorted to the top; the rest follow
   by volume. (Set `SHOW_ONLY_HIGHLIGHTED=true` to hide the rest.)
5. Renders a self-contained HTML report (`public/index.html`) plus a
   machine-readable `public/data.json`.

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
| `GEO_TAG_SLUG`            | `geopolitics`                       | Polymarket tag to screen                       |
| `VOLUME_THRESHOLD`        | `3000`                              | Highlight/pin markets with volume above this   |
| `SCHEDULE_HOURS`          | `6`                                 | Refresh cadence in hours                       |
| `WINDOW_DAYS`             | `7`                                 | Rolling window: list markets added in last N days |
| `FRESH_DAYS`              | `2`                                 | Markets newer than this go in the top "Just added" area |
| `SHOW_ONLY_HIGHLIGHTED`   | `false`                             | If `true`, list only markets over the threshold |
| `MAX_EVENTS`              | `1000`                              | Max events fetched per refresh                 |
| `OUTPUT_DIR`              | `public`                            | Where the report is written                    |
| `STATE_FILE`              | `data/state.json`                   | Where first-seen state is persisted            |
| `WORKFLOW_URL`            | _(auto in CI)_                      | GitHub Actions URL the Update button links to on Pages |
| `PORT` / `HOST`           | `3000` / `0.0.0.0`                  | Server bind address                            |
| `RUN_ON_START`            | `true`                              | Run one refresh immediately on server start    |

## Project layout

```
src/
  config.js        env-driven configuration
  gammaClient.js   Gamma API client (tag resolution + paging)
  normalize.js     raw event -> normalized market + sub-markets (pure)
  marketStore.js   first-seen state + rolling-window selection (pure)
  summary.js       highlight rule, sorting, per-section stats (pure)
  render.js        HTML report renderer + Update button (pure)
  refresh.js       one full cycle: fetch -> select -> render -> persist
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

Covers volume/date coercion, sub-market flattening, the first-seen reconcile,
the 7-day window selection, the highlight-and-sort rule, HTML escaping, the
Update button/URL, and the scheduler math.

## Notes & disclaimer

- The `>$3,000` threshold is **exclusive** (a market at exactly $3,000 is not
  highlighted), matching "over $3,000".
- A Polymarket "market" card is a Gamma **event**; the _Newly added markets_
  section screens events and uses each event's aggregate volume (falling back to
  summing child markets). The _Newly added sub-markets_ section screens the
  individual markets inside those events and uses each one's own volume, so the
  $3,000 rule is applied at both levels.
- Not affiliated with Polymarket. For informational purposes only; not
  financial advice.
