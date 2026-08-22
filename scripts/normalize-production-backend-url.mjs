import { existsSync, readFileSync, writeFileSync } from "node:fs";

const LIVE_HTTP = "https://backend.yopips.com";
const LIVE_WSS = "wss://backend.yopips.com";
const ENV_PATH = ".env.production";

const replacements = [
  ["https://api.yopips.com", LIVE_HTTP],
  ["http://api.yopips.com", LIVE_HTTP],
  ["wss://api.yopips.com", LIVE_WSS],
  ["ws://api.yopips.com", LIVE_WSS],
  [`${LIVE_HTTP}/docs`, LIVE_HTTP],
  [`${LIVE_WSS}/docs`, LIVE_WSS],
];

if (!existsSync(ENV_PATH)) {
  process.exit(0);
}

const original = readFileSync(ENV_PATH, "utf8");
let next = original;
for (const [from, to] of replacements) {
  next = next.split(from).join(to);
}

if (next === original) {
  process.exit(0);
}

writeFileSync(ENV_PATH, next);
console.log(
  "[normalize-production-backend-url] rewrote api.yopips.com /docs origins to backend.yopips.com",
);
