import assert from 'node:assert/strict';
import test from 'node:test';
import { get } from 'node:http';
import { createLocalServer } from '../server.mjs';

test('serves only the bundled app and rejects nonlocal access and writes', async () => {
  const server = createLocalServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await fetch(origin);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /id="documentTitle"/);
    assert.match((await fetch(`${origin}/app.js`)).headers.get('content-type'), /javascript/);
    assert.equal((await fetch(`${origin}/server.mjs`)).status, 404);
    assert.equal((await fetch(`${origin}/%2e%2e%2fserver.mjs`)).status, 404);
    assert.equal((await fetch(`${origin}/app.js`, {method: 'POST'})).status, 405);
    const hostileHost = await new Promise((resolve, reject) => {
      get(origin, {headers: {host: 'attacker.example'}}, response => {
        response.resume(); resolve(response.statusCode);
      }).on('error', reject);
    });
    assert.equal(hostileHost, 403);
    assert.equal((await fetch(origin, {headers: {origin: 'https://attacker.example'}})).status, 403);
    assert.equal((await fetch(`${origin}/%FF`)).status, 400);
    const head = await fetch(origin, {method: 'HEAD'});
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
