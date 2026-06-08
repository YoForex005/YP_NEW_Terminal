const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:3003');
ws.on('open', () => {
  console.log('connected');
  process.exit(0);
});
ws.on('error', (e) => {
  console.log('error', e.message);
  process.exit(1);
});
setTimeout(() => {
  console.log('timeout');
  process.exit(1);
}, 2000);
