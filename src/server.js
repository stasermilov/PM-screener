// Minimal zero-dependency HTTP server that serves the latest generated report
// and exposes a couple of operational endpoints. Static files are read from the
// output directory on each request so the server always reflects the newest
// refresh without a restart.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

async function readIfExists(file) {
  try {
    return await fs.readFile(file);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

const PLACEHOLDER = `<!doctype html><meta charset="utf-8">
<title>Polymarket Geopolitics — New Markets</title>
<body style="font-family:system-ui;max-width:640px;margin:64px auto;padding:0 16px">
<h1>🌍 Warming up…</h1>
<p>The first geopolitics summary is being generated. Refresh in a few seconds.</p>
</body>`;

/**
 * @param {object} opts
 * @param {object} opts.config
 * @param {Function} opts.triggerRefresh  async () => summary
 * @param {Function} opts.getStatus       () => status object
 */
export function startServer({ config, triggerRefresh, getStatus }) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    try {
      if (pathname === '/healthz' || pathname === '/status') {
        return sendJson(res, 200, getStatus());
      }

      if (pathname === '/run') {
        const summary = await triggerRefresh();
        return sendJson(res, 200, { ok: true, totals: summary?.totals ?? null });
      }

      if (pathname === '/data.json') {
        const buf = await readIfExists(path.join(config.outputDir, 'data.json'));
        if (!buf) return sendJson(res, 503, { ok: false, error: 'not generated yet' });
        return send(res, 200, '.json', buf);
      }

      // Serve index.html for "/" and any other path (single-page report).
      const buf = await readIfExists(path.join(config.outputDir, 'index.html'));
      if (!buf) return send(res, 200, '.html', PLACEHOLDER);
      return send(res, 200, '.html', buf);
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  });

  return new Promise((resolve) => {
    server.listen(config.port, config.host, () => {
      console.log(`[server] listening on http://${config.host}:${config.port}`);
      resolve(server);
    });
  });
}

function send(res, status, ext, body) {
  res.writeHead(status, { 'Content-Type': CONTENT_TYPES[ext] || 'text/plain; charset=utf-8' });
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, '.json', JSON.stringify(obj, null, 2));
}
