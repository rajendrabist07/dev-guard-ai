import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DevGuard AI — OpenAPI 3.1 Documentation</title>
  <style>
    :root {
      --bg: #090d16;
      --surface: #0f172a;
      --border: #1e293b;
      --text: #f8fafc;
      --muted: #94a3b8;
      --emerald: #10b981;
      --blue: #38bdf8;
      --amber: #f59e0b;
      --rose: #f43f5e;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; line-height: 1.5; }
    header { border-bottom: 1px solid var(--border); padding: 1.5rem 2rem; background: rgba(15,23,42,0.7); }
    .container { max-width: 1100px; margin: 0 auto; padding: 2rem; }
    h1 { margin: 0 0 0.5rem; font-size: 1.75rem; color: var(--emerald); }
    .meta { color: var(--muted); font-size: 0.9rem; display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; }
    .pill { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; border: 1px solid var(--border); background: var(--surface); color: var(--text); text-decoration: none; }
    .tag-group { margin-top: 2rem; }
    .tag-title { font-size: 1.15rem; font-weight: 700; border-bottom: 1px solid var(--border); padding-bottom: 0.5rem; margin-bottom: 1rem; color: #e2e8f0; }
    details.op { background: var(--surface); border: 1px solid var(--border); border-radius: 0.75rem; margin-bottom: 0.75rem; overflow: hidden; }
    summary.op-head { cursor: pointer; padding: 0.85rem 1rem; display: flex; align-items: center; gap: 0.75rem; list-style: none; }
    summary.op-head:hover { background: rgba(30,41,59,0.5); }
    .method { font-family: ui-monospace, monospace; font-size: 0.75rem; font-weight: 800; padding: 0.2rem 0.55rem; border-radius: 0.375rem; min-width: 4.2rem; text-align: center; text-transform: uppercase; }
    .GET { background: rgba(16,185,129,0.15); color: var(--emerald); border: 1px solid rgba(16,185,129,0.4); }
    .POST { background: rgba(56,189,248,0.15); color: var(--blue); border: 1px solid rgba(56,189,248,0.4); }
    .path { font-family: ui-monospace, monospace; font-size: 0.9rem; font-weight: 600; color: var(--text); }
    .summary { color: var(--muted); font-size: 0.875rem; margin-left: auto; }
    .op-body { padding: 1rem 1.25rem; border-top: 1px solid var(--border); background: #070b13; font-size: 0.875rem; }
    pre { background: #020617; border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.75rem; overflow-x: auto; font-size: 0.78rem; color: #cbd5e1; }
    .sec-badge { font-size: 0.75rem; color: var(--amber); font-family: ui-monospace, monospace; }
    @media (max-width: 720px) { .summary { display: none; } }
  </style>
</head>
<body>
  <header>
    <div class="container" style="padding: 0;">
      <h1 id="api-title">DevGuard AI — OpenAPI 3.1.0 Documentation</h1>
      <div class="meta">
        <span id="api-version" class="pill">OpenAPI 3.1.0</span>
        <a class="pill" href="/api/docs.json" target="_blank" rel="noopener noreferrer">Raw /api/docs.json</a>
        <a class="pill" href="/">Back to App</a>
      </div>
      <p id="api-desc" style="color: var(--muted); margin: 0.75rem 0 0; font-size: 0.9rem;"></p>
    </div>
  </header>
  <main class="container" id="app">Loading OpenAPI specification...</main>
  <script>
    (async function () {
      const root = document.getElementById('app');
      try {
        const res = await fetch('/api/docs.json');
        const spec = await res.json();
        document.getElementById('api-title').textContent = spec.info.title;
        document.getElementById('api-version').textContent = 'OpenAPI ' + spec.openapi + ' • v' + spec.info.version;
        document.getElementById('api-desc').textContent = spec.info.description || '';

        const groups = new Map();
        for (const [path, methods] of Object.entries(spec.paths || {})) {
          for (const [method, op] of Object.entries(methods)) {
            const tag = (op.tags && op.tags[0]) || 'General';
            if (!groups.has(tag)) groups.set(tag, []);
            groups.get(tag).push({ path, method: method.toUpperCase(), op });
          }
        }

        root.innerHTML = '';
        for (const [tag, items] of groups.entries()) {
          const sec = document.createElement('section');
          sec.className = 'tag-group';
          const h2 = document.createElement('h2');
          h2.className = 'tag-title';
          h2.textContent = tag;
          sec.appendChild(h2);

          for (const { path, method, op } of items) {
            const det = document.createElement('details');
            det.className = 'op';
            const sum = document.createElement('summary');
            sum.className = 'op-head';
            sum.innerHTML = '<span class="method ' + method + '">' + method + '</span><span class="path">' + path + '</span><span class="summary">' + (op.summary || '') + '</span>';
            det.appendChild(sum);

            const body = document.createElement('div');
            body.className = 'op-body';
            const secNames = (op.security && op.security.length > 0)
              ? op.security.map((s) => Object.keys(s).join(', ')).join(' | ')
              : 'Public (no auth required)';
            body.innerHTML =
              '<p style="margin-top:0;">' + (op.description || '') + '</p>' +
              '<p class="sec-badge">Auth: ' + secNames + '</p>' +
              (op.parameters ? '<strong>Parameters</strong><pre>' + JSON.stringify(op.parameters, null, 2) + '</pre>' : '') +
              (op.requestBody ? '<strong>Request Body</strong><pre>' + JSON.stringify(op.requestBody, null, 2) + '</pre>' : '') +
              '<strong>Responses</strong><pre>' + JSON.stringify(op.responses, null, 2) + '</pre>';
            det.appendChild(body);
            sec.appendChild(det);
          }
          root.appendChild(sec);
        }
      } catch (err) {
        root.textContent = 'Failed to load /api/docs.json: ' + (err && err.message ? err.message : String(err));
      }
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
}
