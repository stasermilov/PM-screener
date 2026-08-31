# PM Screener — Polymarket Geopolitics new-market summary

An app that summarizes **newly added markets under the _Geopolitics_ category on
Polymarket**, refreshed **every 6 hours**. Markets with **over $3,000 volume are
highlighted in yellow and pinned to the top** of the list.

Data comes from the public [Polymarket Gamma API](https://gamma-api.polymarket.com).

## What it does

On each 6‑hour cycle the app:

1. Fetches every open event under the `geopolitics` tag from the Gamma API.
2. Diffs the fetched set against a saved state file to find items that are
   **newly added** since the previous run. Two things are tracked
   independently:
   - **Markets** — the event cards you browse on Polymarket.
   - **Sub-markets** — the individual outcome markets inside each event.
3. Applies the highlight rule to **each section separately**: any item with
   **volume &gt; $3,000** is highlighted in yellow and sorted to the top; the
   rest follow by volume.
4. Renders a self-contained HTML report (`public/index.html`) with two sections
   — _Newly added markets_ and _Newly added sub-markets_ — plus a
   machine-readable `public/data.json`.

The first run has no prior state, so it records the current markets as a
baseline and only reports those created within the last few hours. Every run
after that reports a true diff.

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
| `/run`       | Trigger a refresh on demand                            |
| `/healthz`   | Status: last run time, last error, config, last stats |

## Run automatically every 6 hours

Two supported ways to hit the 6‑hour cadence:

### 1. GitHub Actions (serverless, no host to run)

`.github/workflows/geopolitics-summary.yml` runs on a `cron` of `0 */6 * * *`.
Each run regenerates the report and commits the updated `public/` output and
`data/state.json` back to the branch (so the next run can diff against it).
You can also trigger it manually from the **Actions** tab (_workflow_dispatch_).

To publish the report as a web page, enable **GitHub Pages** for the branch and
point it at the `/public` folder — GitHub then serves `public/index.html`.

> Note: scheduled workflows run from the repository's **default branch**, so
> merge this workflow to your default branch for the cron to fire.

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
| `FIRST_RUN_LOOKBACK_HOURS`| `6`                                 | First-run "new" window (see above)             |
| `MAX_EVENTS`              | `1000`                              | Max events fetched per refresh                 |
| `OUTPUT_DIR`              | `public`                            | Where the report is written                    |
| `STATE_FILE`              | `data/state.json`                   | Where seen-market state is persisted           |
| `PORT` / `HOST`           | `3000` / `0.0.0.0`                  | Server bind address                            |
| `RUN_ON_START`            | `true`                              | Run one refresh immediately on server start    |

## Project layout

```
src/
  config.js        env-driven configuration
  gammaClient.js   Gamma API client (tag resolution + paging)
  normalize.js     raw event -> normalized market + sub-markets (pure)
  marketStore.js   state persistence + newly-added diff (events & sub-markets)
  summary.js       highlight rule, sorting, per-section stats (pure)
  render.js        HTML report renderer (pure)
  refresh.js       one full cycle: fetch -> diff -> render -> persist
  scheduler.js     drift-safe 6-hour scheduler
  server.js        zero-dep HTTP server
  cli.js           one-shot entrypoint (npm run generate)
  index.js         server mode entrypoint (npm start)
test/              node:test unit tests + fixtures
.github/workflows/ 6-hourly scheduled run
```

## Tests

```bash
npm test
```

Covers volume/date coercion, the newly-added diff (first run vs. later runs),
the highlight-and-sort rule, HTML escaping, and the scheduler math.

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
