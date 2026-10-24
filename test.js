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
  assert.match(home.body, /screenShareBtn/);
  assert.match(home.body, /getDisplayMedia/);
  assert.match(home.body, /RTCPeerConnection/);
  assert.equal((await request('/terms')).status, 200);
  assert.match((await request('/terms')).body, /Uso proibido/);
  assert.equal((await request('/privacy')).status, 200);
  assert.match((await request('/privacy')).body, /LGPD/);
  assert.equal((await request('/healthz')).status, 200);
  const missing = await request('/rota-que-nao-existe'); assert.equal(missing.status, 404); assert.match(missing.body, /Página não encontrada/);
  const admin = await request('/admin'); assert.equal(admin.status, 404); assert.match(admin.body, /Página não encontrada/); assert.doesNotMatch(admin.body, /Painel administrativo|login de administrador/i);
  assert.equal((await request('/', 'POST')).status, 405);

  const ws = new WebSocket(`ws://127.0.0.1:${port}/`, { origin: `http://127.0.0.1:${port}` });
  const received = new Promise((resolve, reject) => {
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', room: 'SalaSegura_2026' })));
    ws.on('message', data => { const m = JSON.parse(data.toString()); if (m.type === 'auth-ok') resolve(m); else if (m.type === 'auth-error') reject(new Error(m.message)); });
    ws.on('error', reject); setTimeout(() => reject(new Error('WebSocket auth timed out')), 2500).unref();
  });
  const auth = await received; assert.ok(auth.id); assert.ok(Array.isArray(auth.devices));
  const waitForType = (socket, type) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', onMessage); reject(new Error(`Timed out waiting for ${type}`)); }, 2500);
    const onMessage = raw => { let message; try { message = JSON.parse(raw.toString()); } catch { return; } if (message.type === type) { clearTimeout(timer); socket.off('message', onMessage); resolve(message); } };
    socket.on('message', onMessage);
  });
  const second = new WebSocket(`ws://127.0.0.1:${port}/`, { origin: `http://127.0.0.1:${port}` });
  const secondAuthPromise = waitForType(second, 'auth-ok');
  await new Promise((resolve, reject) => { second.once('open', resolve); second.once('error', reject); });
  second.send(JSON.stringify({ type: 'auth', room: 'SalaSegura_2026' }));
  const secondAuth = await secondAuthPromise;
  const startedPromise = waitForType(second, 'screen-start');
  ws.send(JSON.stringify({ type: 'screen-start' }));
  const started = await startedPromise; assert.equal(started.from, auth.id);
  const offerPromise = waitForType(second, 'rtc-offer');
  ws.send(JSON.stringify({ type: 'rtc-offer', to: secondAuth.id, description: { type: 'offer', sdp: 'v=0\r\n' } }));
  const offer = await offerPromise; assert.equal(offer.from, auth.id); assert.equal(offer.description.type, 'offer');
  const answerPromise = waitForType(ws, 'rtc-answer');
  second.send(JSON.stringify({ type: 'rtc-answer', to: auth.id, description: { type: 'answer', sdp: 'v=0\r\n' } }));
  const answer = await answerPromise; assert.equal(answer.from, secondAuth.id);
  const icePromise = waitForType(second, 'rtc-ice');
  ws.send(JSON.stringify({ type: 'rtc-ice', to: secondAuth.id, candidate: { candidate: 'candidate:1 1 UDP 1 127.0.0.1 9 typ host', sdpMid: '0', sdpMLineIndex: 0 } }));
  const ice = await icePromise; assert.equal(ice.from, auth.id);
  const stoppedPromise = waitForType(second, 'screen-stop');
  ws.send(JSON.stringify({ type: 'screen-stop' }));
  const stopped = await stoppedPromise; assert.equal(stopped.from, auth.id);
  ws.close(); second.close();
});
