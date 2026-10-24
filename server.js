'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const INDEX = path.join(__dirname, 'index.html');
const ADMIN_INDEX = path.join(__dirname, 'admin.html');
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const ADMIN_SESSIONS = new Map();
const ADMIN_LOGIN_ATTEMPTS = new Map();
const ADMIN_EVENTS = [];
const ROOM_HISTORY = new Map();
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000;
const MAX_ADMIN_EVENTS = 500;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_WS_BYTES = 12 * 1024 * 1024;
const MAX_SIGNAL_BYTES = 64 * 1024;
const SIGNAL_LIMIT = 60;
const MAX_TEXT = 2000;
const MAX_NAME = 24;
const MAX_CLIENTS = positiveInt(process.env.MAX_CLIENTS, 250);
const MAX_PER_IP = positiveInt(process.env.MAX_CONNECTIONS_PER_IP, 12);
const MAX_ROOM_CLIENTS = positiveInt(process.env.MAX_DEVICES_PER_ROOM, 10);
const MESSAGE_LIMIT = positiveInt(process.env.MESSAGE_LIMIT_PER_SECOND, 8);
const ROOM_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;
const clients = new Map();
const ipConnections = new Map();
const screenOwners = new Map();
let nextId = 1;
let shuttingDown = false;

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function safeName(value) {
  return String(value || 'Dispositivo').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, MAX_NAME) || 'Dispositivo';
}
function safeFilename(value) {
  const name = String(value || 'arquivo').replace(/[\\/\u0000-\u001f\u007f<>:"|?*]/g, '_').trim().slice(0, 120);
  return name && name !== '.' && name !== '..' ? name : 'arquivo';
}
function roomDevices(room) {
  return [...clients.entries()].filter(([, c]) => c.room === room && c.authenticated).map(([id, c]) => ({ id, name: c.name }));
}
function recordAdminEvent(room, type, details = {}) {
  const now = Date.now();
  if (room && !ROOM_HISTORY.has(room)) {
    if (ROOM_HISTORY.size >= 1000) ROOM_HISTORY.delete(ROOM_HISTORY.keys().next().value);
    ROOM_HISTORY.set(room, { room, createdAt: now, lastActivity: now, messageCount: 0, fileCount: 0 });
  }
  const stats = room ? ROOM_HISTORY.get(room) : null;
  if (stats) {
    stats.lastActivity = now;
    if (type === 'message') stats.messageCount++;
    if (type === 'file') stats.fileCount++;
  }
  ADMIN_EVENTS.push({ id: crypto.randomUUID(), at: now, room: room || null, type, ...details });
  if (ADMIN_EVENTS.length > MAX_ADMIN_EVENTS) ADMIN_EVENTS.splice(0, ADMIN_EVENTS.length - MAX_ADMIN_EVENTS);
}
function parseCookies(req) {
  const result = Object.create(null);
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 1) continue;
    const key = part.slice(0, i).trim();
    try { result[key] = decodeURIComponent(part.slice(i + 1).trim()); } catch {}
  }
  return result;
}
function adminSession(req) {
  const token = parseCookies(req).conecta_admin;
  if (!token) return null;
  const session = ADMIN_SESSIONS.get(token);
  if (!session || session.expiresAt < Date.now()) { if (session) ADMIN_SESSIONS.delete(token); return null; }
  session.expiresAt = Date.now() + ADMIN_SESSION_TTL;
  return { token, session };
}
function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a)); const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function adminSnapshot() {
  const rooms = new Map();
  for (const [room, stats] of ROOM_HISTORY) rooms.set(room, { ...stats, devices: [], active: false, sharing: false, sharer: null });
  for (const [, c] of clients) {
    if (!c.authenticated || !c.room) continue;
    if (!rooms.has(c.room)) rooms.set(c.room, { room: c.room, createdAt: Date.now(), lastActivity: Date.now(), messageCount: 0, fileCount: 0, devices: [], active: true, sharing: false, sharer: null });
    const r = rooms.get(c.room); r.active = true; r.devices.push({ name: c.name, connectedAt: c.connectedAt || Date.now() });
  }
  for (const [room, ownerId] of screenOwners) {
    const r = rooms.get(room); const owner = clients.get(ownerId);
    if (r) { r.sharing = true; r.sharer = owner ? owner.name : 'Dispositivo'; }
  }
  return { generatedAt: Date.now(), rooms: [...rooms.values()].sort((a,b)=>b.lastActivity-a.lastActivity), events: ADMIN_EVENTS.slice(-MAX_ADMIN_EVENTS).reverse(), retention: 'Somente memória do processo; até 500 eventos recentes. Reiniciar o servidor limpa o histórico.' };
}
function readBody(req, maxBytes = 4096) {
  return new Promise((resolve, reject) => {
    let data = ''; let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > maxBytes) { reject(new Error('too-large')); req.destroy(); return; } data += chunk.toString('utf8'); });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('invalid-json')); } });
    req.on('error', reject);
  });
}
function jsonResponse(res, status, value, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', ...headers });
  res.end(JSON.stringify(value));
}
function sendJson(ws, value) {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try { ws.send(JSON.stringify(value), error => { if (error) ws.terminate(); }); return true; }
  catch { try { ws.terminate(); } catch {} return false; }
}
function sendToRoom(room, value, exceptId = null) {
  const data = JSON.stringify(value);
  for (const [id, c] of clients) {
    if (id !== exceptId && c.room === room && c.authenticated && c.ws.readyState === WebSocket.OPEN) {
      try { c.ws.send(data, error => { if (error) c.ws.terminate(); }); } catch { c.ws.terminate(); }
    }
  }
}
function htmlPage(title, body) {
  const legalPage = title.includes('Termos') || title.includes('Privacidade');
  const contactEmail = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(process.env.CONTACT_EMAIL || '') ? process.env.CONTACT_EMAIL : '';
  const contactNotice = !legalPage ? '' : contactEmail
    ? `<p class="note">Contato do responsável: <a href="mailto:${contactEmail}">${contactEmail}</a></p>`
    : '<p class="note"><strong>Contato ainda não configurado.</strong> O responsável pelo serviço deve publicar um canal de contato válido antes da divulgação pública.</p>';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#080d18"><title>${title} — Conecta</title><style>body{margin:0;background:#080d18;color:#eaf0ff;font:16px/1.75 system-ui,-apple-system,Segoe UI,sans-serif}main{max-width:850px;margin:40px auto;padding:24px}a{color:#74f0c4}h1{line-height:1.2}h2{margin-top:30px;color:#a9c5ff}.card{border:1px solid #293951;background:#101827;border-radius:18px;padding:clamp(20px,4vw,38px)}.note{color:#b7c6dc;background:#172338;padding:14px;border-radius:10px}footer{margin-top:30px;color:#8fa1bb;font-size:13px}</style></head><body><main><div class="card"><p><a href="/">← Voltar ao Conecta</a></p><h1>${title}</h1>${contactNotice}${body}<footer>Conecta · Última atualização: 24 de outubro de 2026</footer></div></main></body></html>`;
}
const termsPage = htmlPage('Termos de uso', `
<p class="note"><strong>Modelo inicial:</strong> revise este texto com orientação jurídica antes de disponibilizar o serviço publicamente. Preencha os dados de contato do responsável no arquivo README.</p>
<h2>1. Aceitação e elegibilidade</h2><p>Ao acessar o Conecta, você concorda com estes termos. Se não concordar, não utilize o serviço. Menores devem utilizá-lo com autorização e supervisão de seus responsáveis, conforme a legislação aplicável.</p>
<h2>2. Como o serviço funciona</h2><p>O Conecta permite trocar mensagens e transferir arquivos temporariamente entre dispositivos conectados à mesma sala. O serviço não garante disponibilidade contínua, entrega de mensagens, armazenamento permanente ou recuperação de arquivos. Por padrão, o servidor não grava conteúdo em banco de dados. Se o operador habilitar o painel administrativo, até 500 eventos recentes (incluindo texto das mensagens e metadados de arquivos, nunca os bytes dos arquivos) permanecem temporariamente em memória e são acessíveis apenas após autenticação administrativa; reiniciar o processo limpa esse histórico.</p>
<h2>3. Códigos de sala e responsabilidade</h2><p>Os códigos de sala funcionam como segredo de acesso. Use códigos únicos, difíceis de adivinhar e compartilhe-os apenas com pessoas autorizadas. Qualquer pessoa que conheça o código poderá tentar entrar na sala. Não use o serviço para dados sigilosos ou de alto risco.</p>
<h2>4. Uso proibido</h2><p>É proibido utilizar o serviço para atividades ilegais, fraudes, ameaças, assédio, violação de direitos autorais, distribuição de malware, exploração de vulnerabilidades, envio de conteúdo não autorizado ou tentativa de prejudicar a disponibilidade do serviço ou outros usuários.</p>
<h2>5. Arquivos e conteúdo</h2><p>Você é responsável pelo conteúdo que envia e deve ter os direitos e autorizações necessários. Não envie arquivos ilegais, maliciosos, confidenciais sem autorização ou que violem direitos de terceiros. Verifique arquivos recebidos com ferramentas de segurança antes de abri-los. O serviço não realiza análise antivírus nesta versão.</p>
<h2>6. Limites e disponibilidade</h2><p>O limite de arquivo desta versão é de 8 MB por arquivo. Podemos limitar, suspender ou interromper o acesso para proteger o serviço, investigar abuso ou cumprir obrigações legais. Não prometemos funcionamento ininterrupto nem ausência absoluta de falhas.</p>
<h2>7. Segurança e privacidade</h2><p>O tráfego deve ser acessado por HTTPS/WSS quando hospedado publicamente. O Conecta não oferece criptografia ponta a ponta: o servidor retransmite o conteúdo. Não envie senhas, documentos sensíveis ou informações que exijam sigilo especial.</p>
<h2>8. Isenção e responsabilidade</h2><p>O serviço é fornecido conforme disponível. Na máxima extensão permitida pela legislação aplicável, não garantimos adequação a uma finalidade específica, disponibilidade ininterrupta ou ausência de conteúdo prejudicial enviado por terceiros. Nada nestes termos exclui direitos ou responsabilidades que não possam ser excluídos por lei.</p>
<h2>9. Alterações e contato</h2><p>Estes termos podem ser atualizados. Para dúvidas, solicitações ou denúncias, use o contato oficial publicado pelo responsável pelo serviço. Antes de publicar, configure esse contato e identifique corretamente o operador do site.</p>`);
const privacyPage = htmlPage('Política de privacidade', `
<p class="note"><strong>Modelo inicial:</strong> esta política deve ser completada com a identidade do controlador, contato, hospedagem, configurações reais e revisão jurídica. Não publique sem preencher esses dados.</p>
<h2>1. Quem é responsável</h2><p>O responsável pelo tratamento deve ser identificado pelo operador do site. Antes da publicação, informe nome/razão social e um canal de contato válido no README e nesta política. Não invente nem deixe essa identificação indefinida em produção.</p>
<h2>2. Dados tratados</h2><p>O conteúdo das mensagens, nomes de dispositivos, códigos de sala e arquivos são processados pelo servidor para retransmissão entre participantes conectados. O código de sala não deve ser considerado autenticação forte. O provedor de hospedagem e a infraestrutura de proteção podem processar dados técnicos, como endereço IP, horário de acesso e registros de segurança, de acordo com suas próprias políticas e configurações.</p>
<h2>3. Armazenamento e retenção</h2><p>Esta versão não grava mensagens ou arquivos em banco de dados. Quando o painel administrativo está habilitado por ADMIN_PASSWORD, o servidor mantém até 500 eventos recentes em memória, incluindo conteúdo textual das mensagens e metadados dos arquivos (nome, tipo e tamanho), acessíveis apenas a administradores autenticados. O conteúdo binário dos arquivos não é guardado no painel. O histórico é apagado quando o processo reinicia. O estado de compartilhamento de tela (quem está compartilhando) é registrado, mas o painel não captura, grava nem exibe o vídeo da tela. Logs operacionais da plataforma de hospedagem podem existir fora do controle direto do aplicativo e seguem as configurações do provedor.</p><p>O compartilhamento de tela é iniciado somente após uma ação explícita do usuário e a seleção de uma tela, janela ou guia no navegador. O fluxo de vídeo usa WebRTC diretamente entre os dispositivos participantes; o servidor Conecta encaminha mensagens de sinalização para estabelecer a conexão. Não há captura oculta nem gravação pelo aplicativo. A disponibilidade pode depender da rede, do navegador e de infraestrutura de conectividade.</p>
<h2>4. Finalidades e bases legais</h2><p>Os dados são processados para conectar dispositivos, encaminhar mensagens e arquivos, manter a segurança e prevenir abusos. O operador deve definir e documentar as bases legais aplicáveis à sua operação, inclusive conforme a LGPD, e ajustar esta seção à prática real do serviço.</p>
<h2>5. Compartilhamento</h2><p>O conteúdo é compartilhado com os demais dispositivos conectados à mesma sala e processado pela infraestrutura necessária para hospedar e proteger o site. Não prometa ausência total de compartilhamento técnico: hospedagem, rede e proteção contra ataques podem processar metadados.</p>
<h2>6. Segurança</h2><p>São adotadas medidas técnicas para reduzir riscos, mas nenhum serviço conectado à internet pode garantir segurança absoluta. O serviço não oferece criptografia ponta a ponta nem análise antivírus de arquivos. Evite compartilhar dados pessoais sensíveis.</p>
<h2>7. Direitos dos titulares</h2><p>Conforme a legislação aplicável, você pode solicitar informações sobre tratamento, correção, eliminação ou exercer outros direitos cabíveis. Configure um endereço de contato monitorado para receber e responder solicitações. Pedidos podem estar sujeitos a requisitos legais e de identificação.</p>
<h2>8. Crianças, cookies e terceiros</h2><p>Esta versão não implementa cookies próprios para publicidade ou análise. A hospedagem, a CDN ou a proteção contra ataques podem utilizar cookies técnicos ou coletar dados conforme suas configurações. O operador deve revisar essas configurações e a adequação para crianças e adolescentes antes da publicação.</p>
<h2>9. Atualizações e contato</h2><p>Esta política pode ser atualizada quando o serviço mudar. Antes de publicar, informe a data efetiva, a identidade do responsável e um canal de contato válido.</p>`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const pathname = url.pathname;
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), display-capture=(self)',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'Cache-Control': 'no-store'
  };
  if (pathname === '/admin/login' && req.method === 'POST') {
    if (!ADMIN_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ADMIN_EMAIL) || ADMIN_PASSWORD.length < 16) return jsonResponse(res, 503, { error: 'Painel desativado: configure ADMIN_EMAIL válido e ADMIN_PASSWORD com pelo menos 16 caracteres no ambiente do servidor.' });
    const origin = req.headers.origin;
    if (origin) { try { if (new URL(origin).host.toLowerCase() !== String(req.headers.host || '').toLowerCase()) return jsonResponse(res, 403, { error: 'Origem inválida.' }); } catch { return jsonResponse(res, 403, { error: 'Origem inválida.' }); } }
    const ip = getClientIp(req); const now = Date.now();
    let attempt = ADMIN_LOGIN_ATTEMPTS.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
    if (attempt.until <= now) attempt = { count: 0, until: now + 15 * 60 * 1000 };
    if (attempt.count >= 8) return jsonResponse(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos.' });
    let body; try { body = await readBody(req); } catch { return jsonResponse(res, 400, { error: 'Solicitação inválida.' }); }
    const submittedEmail = String(body.email || '').trim().toLowerCase();
    const emailMatches = constantTimeEqual(submittedEmail, ADMIN_EMAIL);
    const passwordMatches = constantTimeEqual(body.password || '', ADMIN_PASSWORD);
    if (!(emailMatches && passwordMatches)) { attempt.count++; ADMIN_LOGIN_ATTEMPTS.set(ip, attempt); return jsonResponse(res, 401, { error: 'E-mail ou senha incorretos.' }); }
    ADMIN_LOGIN_ATTEMPTS.delete(ip);
    for (const [key, value] of ADMIN_SESSIONS) if (value.expiresAt < now) ADMIN_SESSIONS.delete(key);
    if (ADMIN_SESSIONS.size >= 1000) ADMIN_SESSIONS.delete(ADMIN_SESSIONS.keys().next().value);
    const token = crypto.randomBytes(32).toString('base64url'); ADMIN_SESSIONS.set(token, { expiresAt: now + ADMIN_SESSION_TTL });
    const secure = req.socket.encrypted || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
    return jsonResponse(res, 200, { ok: true }, { 'Set-Cookie': `conecta_admin=${encodeURIComponent(token)}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=28800${secure ? '; Secure' : ''}` });
  }
  if (pathname === '/admin/logout' && req.method === 'POST') {
    const current = adminSession(req); if (current) ADMIN_SESSIONS.delete(current.token);
    return jsonResponse(res, 200, { ok: true }, { 'Set-Cookie': 'conecta_admin=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0' });
  }
  if (pathname === '/admin/api/state' && req.method === 'GET') {
    if (!adminSession(req)) return jsonResponse(res, 401, { error: 'Autenticação necessária.' });
    return jsonResponse(res, 200, adminSnapshot());
  }
  if (pathname === '/admin' || pathname === '/admin/') {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { ...headers, Allow: 'GET, HEAD' }); return res.end('Method not allowed'); }
    res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(ADMIN_INDEX).on('error', () => { if (!res.headersSent) res.writeHead(500); res.end('Admin panel unavailable'); }).pipe(res);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { ...headers, 'Content-Type': 'text/plain; charset=utf-8', Allow: 'GET, HEAD' });
    return res.end('Method not allowed');
  }
  if (pathname === '/healthz') {
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ status: shuttingDown ? 'shutting_down' : 'ok', uptime: Math.floor(process.uptime()) }));
  }
  if (pathname === '/terms' || pathname === '/terms-of-use') {
    res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }); return res.end(termsPage);
  }
  if (pathname === '/privacy' || pathname === '/privacy-policy') {
    res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }); return res.end(privacyPage);
  }
  if (pathname === '/robots.txt') {
    res.writeHead(200, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('User-agent: *\nDisallow: /healthz\nDisallow: /admin\n');
  }
  if (pathname === '/' || pathname === '/index.html') {
    res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(INDEX);
    stream.on('error', () => { if (!res.headersSent) res.writeHead(500); res.end('Internal server error'); });
    return stream.pipe(res);
  }
  res.writeHead(404, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
  return res.end(htmlPage('Página não encontrada (404)', '<p>A página que você procurou não existe ou foi movida.</p><p><a href="/">Voltar à página inicial</a></p>'));
});

const wss = new WebSocket.Server({ noServer: true, maxPayload: MAX_WS_BYTES, perMessageDeflate: false, clientTracking: true });
function getClientIp(req) {
  // Em produção no Render, o proxy da plataforma fornece X-Forwarded-For.
  // Não use esse cabeçalho em hospedagens não confiáveis sem configurar explicitamente o proxy.
  if (process.env.RENDER_SERVICE_ID && typeof req.headers['x-forwarded-for'] === 'string') {
    const forwarded = req.headers['x-forwarded-for'].split(',')[0].trim();
    if (forwarded && forwarded.length <= 64) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {});
  let upgradePath = '';
  try { upgradePath = req.url ? new URL(req.url, 'http://localhost').pathname : ''; } catch {}
  if (shuttingDown || upgradePath !== '/') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return socket.destroy();
  }
  const origin = req.headers.origin;
  const host = req.headers.host;
  let originHost = '';
  try { originHost = new URL(origin).host.toLowerCase(); } catch {}
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!origin || !host || (!allowedOrigins.includes(origin.toLowerCase()) && originHost !== host.toLowerCase())) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return socket.destroy();
  }
  const ip = getClientIp(req);
  const currentIp = ipConnections.get(ip) || 0;
  if (wss.clients.size >= MAX_CLIENTS || currentIp >= MAX_PER_IP) {
    socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n'); return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, ws => { ws.clientIp = ip; wss.emit('connection', ws, req); });
});

wss.on('connection', ws => {
  const id = String(nextId++);
  const ip = ws.clientIp || 'unknown';
  ipConnections.set(ip, (ipConnections.get(ip) || 0) + 1);
  const c = { ws, id, ip, name: 'Dispositivo', room: null, authenticated: false, rateWindow: Date.now(), messageCount: 0, signalWindow: Date.now(), signalCount: 0, badMessages: 0 };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    if (raw.length > MAX_WS_BYTES) return ws.close(1009, 'Payload too large');
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return ws.close(1007, 'Invalid JSON'); }
    if (!m || typeof m !== 'object' || Array.isArray(m)) return ws.close(1008, 'Invalid message');
    if (!c.authenticated) {
      if (m.type !== 'auth' || typeof m.room !== 'string' || !ROOM_PATTERN.test(m.room)) {
        sendJson(ws, { type: 'auth-error', reason: 'room', message: 'Use um código de sala com 8 a 32 caracteres.' });
        return ws.close(1008, 'Invalid room code');
      }
      if (roomDevices(m.room).length >= MAX_ROOM_CLIENTS) {
        sendJson(ws, { type: 'auth-error', reason: 'room-full', message: 'Esta sala atingiu o limite de dispositivos.' });
        return ws.close(1008, 'Room full');
      }
      c.room = m.room;
      c.authenticated = true;
      c.connectedAt = Date.now();
      if (!ROOM_HISTORY.has(c.room)) ROOM_HISTORY.set(c.room, { room: c.room, createdAt: c.connectedAt, lastActivity: c.connectedAt, messageCount: 0, fileCount: 0 });
      recordAdminEvent(c.room, 'join', { user: c.name });
      clients.set(id, c);
      sendJson(ws, { type: 'auth-ok', id, devices: roomDevices(c.room) });
      sendToRoom(c.room, { type: 'devices', devices: roomDevices(c.room) });
      return;
    }
    const now = Date.now();
    const isRtcSignal = ['rtc-offer', 'rtc-answer', 'rtc-ice'].includes(m.type);
    if (isRtcSignal) {
      if (now - c.signalWindow >= 1000) { c.signalWindow = now; c.signalCount = 0; }
      if (++c.signalCount > SIGNAL_LIMIT) return ws.close(1008, 'Signaling rate limit exceeded');
    } else {
      if (now - c.rateWindow >= 1000) { c.rateWindow = now; c.messageCount = 0; }
      if (++c.messageCount > MESSAGE_LIMIT) return ws.close(1008, 'Rate limit exceeded');
    }
    if (m.type === 'join') {
      c.name = safeName(m.name);
      recordAdminEvent(c.room, 'join', { user: c.name });
      sendToRoom(c.room, { type: 'system', text: `${c.name} entrou na sala.` }, id);
      sendToRoom(c.room, { type: 'devices', devices: roomDevices(c.room) });
      return;
    }
    if (m.type === 'screen-start') {
      const owner = screenOwners.get(c.room);
      if (owner && owner !== id) { sendJson(ws, { type: 'warning', message: 'Outro dispositivo já está compartilhando a tela.' }); return; }
      screenOwners.set(c.room, id);
      recordAdminEvent(c.room, 'screen-start', { user: c.name });
      sendToRoom(c.room, { type: 'screen-start', from: id, name: c.name }, id);
      return;
    }
    if (m.type === 'screen-stop') {
      if (screenOwners.get(c.room) === id) {
        screenOwners.delete(c.room);
        recordAdminEvent(c.room, 'screen-stop', { user: c.name });
        sendToRoom(c.room, { type: 'screen-stop', from: id, name: c.name }, id);
      }
      return;
    }
    if (['rtc-offer', 'rtc-answer', 'rtc-ice'].includes(m.type)) {
      if (typeof m.to !== 'string' || m.to === id) return invalidMessage(c);
      const target = clients.get(m.to);
      if (!target || !target.authenticated || target.room !== c.room) return;
      const owner = screenOwners.get(c.room);
      if (!owner || (m.type === 'rtc-offer' && owner !== id) || (m.type === 'rtc-answer' && owner !== m.to) || (m.type === 'rtc-ice' && owner !== id && owner !== m.to)) return invalidMessage(c);
      let relay;
      if (m.type === 'rtc-offer' || m.type === 'rtc-answer') {
        if (!m.description || typeof m.description !== 'object' || m.description.type !== (m.type === 'rtc-offer' ? 'offer' : 'answer') || typeof m.description.sdp !== 'string' || !m.description.sdp.length || m.description.sdp.length > MAX_SIGNAL_BYTES) return invalidMessage(c);
        relay = { type: m.type, from: id, name: c.name, description: { type: m.description.type, sdp: m.description.sdp } };
      } else {
        const candidate = m.candidate;
        if (!candidate || typeof candidate !== 'object' || typeof candidate.candidate !== 'string' || candidate.candidate.length > 4096 || (candidate.sdpMid != null && (typeof candidate.sdpMid !== 'string' || candidate.sdpMid.length > 256)) || (candidate.sdpMLineIndex != null && (!Number.isInteger(candidate.sdpMLineIndex) || candidate.sdpMLineIndex < 0 || candidate.sdpMLineIndex > 255)) || (candidate.usernameFragment != null && (typeof candidate.usernameFragment !== 'string' || candidate.usernameFragment.length > 256))) return invalidMessage(c);
        relay = { type: m.type, from: id, name: c.name, candidate: { candidate: candidate.candidate, sdpMid: candidate.sdpMid ?? null, sdpMLineIndex: candidate.sdpMLineIndex ?? null, usernameFragment: candidate.usernameFragment ?? null } };
      }
      const encoded = JSON.stringify(relay);
      if (Buffer.byteLength(encoded) > MAX_SIGNAL_BYTES) return invalidMessage(c);
      sendJson(target.ws, relay);
      return;
    }
    if (m.type === 'chat') {
      if (typeof m.text !== 'string') return invalidMessage(c);
      const text = m.text.replace(/\u0000/g, '').trim();
      if (!text || text.length > MAX_TEXT) return invalidMessage(c);
      recordAdminEvent(c.room, 'message', { user: c.name, text });
      sendToRoom(c.room, { type: 'chat', name: c.name, text, sentAt: Date.now() }, id);
      return;
    }
    if (m.type === 'file') {
      if (typeof m.data !== 'string' || m.data.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 8) return invalidMessage(c);
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(m.data)) return invalidMessage(c);
      const data = Buffer.from(m.data, 'base64');
      if (!data.length || data.length > MAX_FILE_BYTES || data.toString('base64') !== m.data) return invalidMessage(c);
      const mime = typeof m.mime === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(m.mime) ? m.mime.slice(0, 100) : 'application/octet-stream';
      recordAdminEvent(c.room, 'file', { user: c.name, filename: safeFilename(m.filename), mime, size: data.length });
      sendToRoom(c.room, { type: 'file', name: c.name, filename: safeFilename(m.filename), mime, size: data.length, data: data.toString('base64'), sentAt: Date.now() }, id);
      return;
    }
    invalidMessage(c);
  });
  ws.on('close', () => {
    clients.delete(id);
    const count = Math.max(0, (ipConnections.get(ip) || 1) - 1);
    if (count) ipConnections.set(ip, count); else ipConnections.delete(ip);
    if (c.room) {
      if (screenOwners.get(c.room) === id) { screenOwners.delete(c.room); recordAdminEvent(c.room, 'screen-stop', { user: c.name }); sendToRoom(c.room, { type: 'screen-stop', from: id, name: c.name }); }
      if (c.authenticated) { recordAdminEvent(c.room, 'leave', { user: c.name }); sendToRoom(c.room, { type: 'system', text: `${c.name} saiu da sala.` }); }
      sendToRoom(c.room, { type: 'devices', devices: roomDevices(c.room) });
    }
  });
  ws.on('error', () => {});
});
function invalidMessage(client) {
  client.badMessages++;
  sendJson(client.ws, { type: 'warning', message: 'Mensagem inválida ou fora dos limites.' });
  if (client.badMessages >= 5) client.ws.close(1008, 'Too many invalid messages');
}
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { ws.terminate(); }
  }
}, 30000);
heartbeat.unref();
server.listen(PORT, HOST, () => console.log(`Conecta pronto na porta ${PORT}.`));
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal}: encerrando o Conecta...`);
  clearInterval(heartbeat);
  for (const ws of wss.clients) { try { ws.close(1001, 'Server shutting down'); } catch { ws.terminate(); } }
  const force = setTimeout(() => { for (const ws of wss.clients) ws.terminate(); server.close(() => process.exit(0)); }, 5000);
  force.unref();
  server.close(() => { clearTimeout(force); process.exit(0); });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
