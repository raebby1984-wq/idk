const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const PORT = Number(process.env.PORT || 3000);
const html = path.join(__dirname, 'index.html');
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8', 'Cache-Control':'no-store'});
    return fs.createReadStream(html).pipe(res);
  }
  res.writeHead(404, {'Content-Type':'text/plain'}); res.end('Not found');
});
const wss = new WebSocket.Server({server});
const rooms = new Map();
function send(ws, obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }
function roomCode() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }
wss.on('connection', ws => {
  ws.room = null; ws.role = null;
  ws.on('message', raw => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'create') {
      let code; do { code = roomCode(); } while (rooms.has(code));
      const room = {host:ws, guest:null}; rooms.set(code, room); ws.room=code; ws.role='host';
      send(ws,{type:'created',code,role:'host'}); return;
    }
    if (msg.type === 'join') {
      const code = String(msg.code || '').trim().toUpperCase(); const room = rooms.get(code);
      if (!room) return send(ws,{type:'error',message:'Room not found. Check the code and try again.'});
      if (room.guest && room.guest.readyState === WebSocket.OPEN) return send(ws,{type:'error',message:'That room already has two fighters.'});
      room.guest=ws; ws.room=code; ws.role='guest';
      send(ws,{type:'joined',code,role:'guest'}); send(ws,{type:'opponent',connected:true}); send(room.host,{type:'opponent',connected:true}); return;
    }
    if (!ws.room) return;
    const room = rooms.get(ws.room); if (!room) return;
    if (msg.type === 'input' && ws.role === 'guest' && room.host) send(room.host,{type:'opponentInput',input:msg.input || {}});
    if (msg.type === 'state' && ws.role === 'host' && room.guest) send(room.guest,{type:'state',state:msg.state});
    if (msg.type === 'restart' && ws.role === 'host' && room.guest) send(room.guest,{type:'restart'});
  });
  ws.on('close', () => {
    if (!ws.room) return; const room=rooms.get(ws.room); if (!room) return;
    if (ws.role==='host') { send(room.guest,{type:'opponent',connected:false}); if(room.guest) room.guest.room=null; rooms.delete(ws.room); }
    else { room.guest=null; send(room.host,{type:'opponent',connected:false}); }
  });
});
server.listen(PORT, '0.0.0.0', () => console.log(`Arena Brawl is running at http://localhost:${PORT}`));
