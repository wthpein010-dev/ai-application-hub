import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Both the checkout and portable archive keep the app beside local/.
const appRoot = new URL('../app/', import.meta.url);
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
]);

export function createLocalServer() {
  return createServer(async (request, response) => {
    const host = request.headers.host;
    if (!host || !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host) ||
        (request.headers.origin && request.headers.origin !== `http://${host}`)) {
      response.writeHead(403).end('Local requests only'); return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, `http://${host}`).pathname); }
    catch { response.writeHead(400).end(); return; }
    if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
    const entry = files.get(pathname);
    if (!entry) { response.writeHead(404).end(); return; }
    try {
      const bytes = await readFile(new URL(entry[0], appRoot));
      response.writeHead(200, {
        'Content-Type': entry[1], 'Content-Length': bytes.length,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    } catch { response.writeHead(500).end('App files unavailable'); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PLANMAP_PORT ?? 3210);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error('PLANMAP_PORT must be an integer from 1024 to 65535.'); process.exit(1);
  }
  const server = createLocalServer();
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE'
      ? `Port ${port} is occupied. Stop the other server or set PLANMAP_PORT.`
      : error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`PlanMap: http://127.0.0.1:${port}\nOpen this address in your browser. Press Ctrl+C to stop.`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
}
