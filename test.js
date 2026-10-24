'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const WebSocket = require('ws');

let child;
let port;
function request(pathname, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method }, res => {
      let body = '';
      res.setEncoding('utf8'); res.on('data', chunk => body += chunk); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.end();
  });
}
function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = async () => {
      try { const r = await request('/healthz'); if (r.status === 200) return resolve(); }
      catch {}
      if (Date.now() - started > 5000) return reject(new Error('Server did not start'));
      setTimeout(tick, 50);
    };
    tick();
  });
}
test('HTTP routes, security headers, 404 and websocket auth', async t => {
  port = 18000 + Math.floor(Math.random() * 10000);
  child = spawn(process.execPath, ['server.js'], { cwd: __dirname, env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' }, stdio: 'ignore' });
  t.after(() => { if (child && child.exitCode === null) child.kill('SIGTERM'); });
  await waitForServer();
  const home = await request('/');
  assert.equal(home.status, 200); assert.match(home.headers['content-security-policy'], /frame-ancestors 'none'/); assert.equal(home.headers['x-content-type-options'], 'nosniff');
  assert.match(home.body, /Termos de uso/);
  assert.equal((await request('/terms')).status, 200);
  assert.match((await request('/terms')).body, /Uso proibido/);
  assert.equal((await request('/privacy')).status, 200);
  assert.match((await request('/privacy')).body, /LGPD/);
  assert.equal((await request('/healthz')).status, 200);
  const missing = await request('/rota-que-nao-existe'); assert.equal(missing.status, 404); assert.match(missing.body, /Página não encontrada/);
  assert.equal((await request('/', 'POST')).status, 405);

  const ws = new WebSocket(`ws://127.0.0.1:${port}/`, { origin: `http://127.0.0.1:${port}` });
  const received = new Promise((resolve, reject) => {
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', room: 'SalaSegura_2026' })));
    ws.on('message', data => { const m = JSON.parse(data.toString()); if (m.type === 'auth-ok') resolve(m); else if (m.type === 'auth-error') reject(new Error(m.message)); });
    ws.on('error', reject); setTimeout(() => reject(new Error('WebSocket auth timed out')), 2500).unref();
  });
  const auth = await received; assert.ok(auth.id); assert.ok(Array.isArray(auth.devices));
  ws.close();
});
