import { io } from "socket.io-client";

console.log("Connecting to WebSocket on http://127.0.0.1:3003...");
const socket = io("http://127.0.0.1:3003", { transports: ["websocket"] });

socket.on("connect", () => {
  console.log("Connected! socket id:", socket.id);
  
  // Authenticate with the test MT5 credentials
  socket.emit("auth", {
    login: 900873,
    password: "12345678",
    server: "57.128.141.65"
  }, (res: any) => {
    console.log("Auth response:", res);
    
    if (res.success) {
      console.log("Authentication successful! Expecting active symbol data stream...");
      
      socket.emit("subscribe_ohlc", { symbol: "EURUSD", timeframe: 1 }, (subRes: any) => {
         console.log("subscribe_ohlc response:", subRes);
      });
      
    } else {
      console.error("Auth failed:", res.error);
      process.exit(1);
    }
  });
});

socket.on("account_update", (data: any) => console.log("=> account_update:", data));
socket.on("position_update", (data: any) => console.log("=> position_update:", data.action, data.position?.ticket));
socket.on("order_update", (data: any) => console.log("=> order_update:", data.action, data.order?.ticket));

socket.on("ohlc_bar", (bar: any) => {
  console.log("=> RECEIVED LIVE TICK/CANDLE:", bar.symbol, "Price:", bar.close);
  // We can exit now that we proved data flows!
  process.exit(0);
});

socket.on("connect_error", (err: any) => {
  console.error("Connection error:", err);
  process.exit(1);
});

setTimeout(() => {
  console.log("Timeout waiting for data. Did not receive any ohlc_bar events in 40s.");
  process.exit(0);
}, 40000);
