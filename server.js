'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = Number(process.env.PORT || 8787);
const INDEX = path.join(__dirname, 'index.html');
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_WS_BYTES = 12 * 1024 * 1024;
const MAX_TEXT = 2000;
const clients = new Map();
let nextId = 1;
function safeName(v) { return String(v || 'Dispositivo').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 24) || 'Dispositivo'; }
function roomDevices(room) { return [...clients.entries()].filter(([,c]) => c.room === room).map(([id,c]) => ({id, name:c.name})); }
function sendToRoom(room, obj, exceptId = null) {
  const data = JSON.stringify(obj);
  for (const [id,c] of clients) if (id !== exceptId && c.room === room && c.authenticated && c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
}
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (req.method !== 'GET' || !['/', '/index.html'].includes(pathname)) {
    res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'}); return res.end('Not found');
  }
  res.writeHead(200, {
    'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY',
    'Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' blob: data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  });
  fs.createReadStream(INDEX).pipe(res);
});
const wss = new WebSocket.Server({noServer:true,maxPayload:MAX_WS_BYTES,perMessageDeflate:false});
server.on('upgrade',(req,socket,head)=>{
  try {
    const origin = req.headers.origin, host = req.headers.host;
    if (!origin || !host || new URL(origin).host.toLowerCase() !== host.toLowerCase()) throw new Error('origin');
  } catch { socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
});
wss.on('connection',ws=>{
  const id = String(nextId++);
  const c = {ws,id,name:'Dispositivo',room:null,authenticated:false,lastMessage:0,messageCount:0,badMessages:0};
  ws.isAlive = true; ws.on('pong',()=>{ws.isAlive=true;});
  ws.on('message',raw=>{
    if (raw.length > MAX_WS_BYTES) return ws.close(1009,'Payload too large');
    let m; try { m=JSON.parse(raw.toString()); } catch { return ws.close(1007,'Invalid JSON'); }
    if (!c.authenticated) {
      if (m.type !== 'auth' || typeof m.room !== 'string' || !/^[A-Za-z0-9_-]{4,32}$/.test(m.room)) {
        ws.send(JSON.stringify({type:'auth-error',reason:'room'})); return ws.close(1008,'Invalid room code');
      }
      c.room=m.room; c.authenticated=true; clients.set(id,c);
      ws.send(JSON.stringify({type:'auth-ok',id,devices:roomDevices(c.room)}));
      sendToRoom(c.room,{type:'devices',devices:roomDevices(c.room)}); return;
    }
    const now=Date.now(); if(now-c.lastMessage>1000){c.lastMessage=now;c.messageCount=0;}
    if(++c.messageCount>20){ws.close(1008,'Rate limit');return;}
    if(m.type==='chat' && typeof m.text==='string') {
      const text=m.text.trim().slice(0,MAX_TEXT); if(text)sendToRoom(c.room,{type:'chat',name:c.name,text},id);
    } else if(m.type==='file' && typeof m.data==='string' && m.data.length<=Math.ceil(MAX_FILE_BYTES*4/3)+8) {
      const name=String(m.filename||'arquivo').replace(/[\\/\u0000-\u001f\u007f]/g,'_').slice(0,120);
      const mime=String(m.mime||'application/octet-stream').slice(0,100);
      const decoded=Buffer.from(m.data,'base64'); if(decoded.length>MAX_FILE_BYTES)return;
      sendToRoom(c.room,{type:'file',name:c.name,filename:name,mime,data:decoded.toString('base64')},id);
    } else if(m.type==='join') {
      c.name=safeName(m.name); sendToRoom(c.room,{type:'system',text:c.name+' entrou na sala.'},id);
      sendToRoom(c.room,{type:'devices',devices:roomDevices(c.room)});
    } else if(++c.badMessages>=5) ws.close(1008,'Invalid message types');
  });
  ws.on('close',()=>{if(clients.delete(id)&&c.room){sendToRoom(c.room,{type:'system',text:c.name+' saiu da sala.'});sendToRoom(c.room,{type:'devices',devices:roomDevices(c.room)});}});
  ws.on('error',()=>{});
});
const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(ws.isAlive===false){ws.terminate();continue;}ws.isAlive=false;ws.ping();}},30000);
server.listen(PORT,'0.0.0.0',()=>console.log(`Conecta pronto na porta ${PORT}.`));
process.on('SIGINT',()=>{clearInterval(heartbeat);for(const c of clients.values())c.ws.close();server.close(()=>process.exit(0));});
