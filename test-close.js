const jwt = require('jsonwebtoken');
const WebSocket = require('ws');
const token = jwt.sign({ login: 303100, server: "57.128.141.65:443" }, "97cfdb66d8d53d442fc90e6e708baff12f91660f83078416b4c46faddce50885");
const ws = new WebSocket('ws://127.0.0.1:3003/ws');
ws.on('open', () => {
  ws.send(JSON.stringify({ action: 'authenticate', token }));
});
ws.on('message', (data) => {
  console.log(data.toString());
  const msg = JSON.parse(data.toString());
  if (msg.action === 'authenticate' && msg.status === 'success') {
    ws.send(JSON.stringify({ action: 'close_position', ticket: 2014987, req_id: 1 }));
  }
});
