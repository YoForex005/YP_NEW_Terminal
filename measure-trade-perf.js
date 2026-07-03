#!/usr/bin/env node
/**
 * Unbiased trade-placement and trade-closing performance measurement.
 *
 * Exercises the REAL path used by the browser:
 *   Browser → Next.js API route → terminal-ws-bridge → WebSocket gateway → MT5
 *
 * Because DEV_AUTO_AUTH=true on loopback, this script runs unauthenticated
 * against http://localhost:3002 (same trust boundary the dev server uses).
 *
 * Usage:
 *   node measure-trade-perf.js                         # auto-discover account + symbol
 *   node measure-trade-perf.js --account=mt5-123456    # pin an account
 *   node measure-trade-perf.js --symbol=EURUSD         # pin a symbol
 *   node measure-trade-perf.js --rounds=5              # repeat N times (default 3)
 *   node measure-trade-perf.js --volume=0.01           # lot size (default 0.01)
 */

const http = require('http');

const BASE = 'http://localhost:3002';

// ── CLI args ────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = 'true'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const ROUNDS = Math.max(1, parseInt(args.rounds || '3', 10));
const VOLUME = parseFloat(args.volume || '0.01');
const PINNED_ACCOUNT = args.account || null;
const PINNED_SYMBOL = args.symbol || null;
const VERBOSE = args.verbose === 'true';
const SETTLE_MS = parseInt(args.settleMs || '1200', 10);

// ── HTTP helper ─────────────────────────────────────────────────────────────
function request(method, path, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const start = process.hrtime.bigint();
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      `${BASE}${path}`,
      {
        method,
        headers: {
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(headers || {}),
        },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          const end = process.hrtime.bigint();
          const wallMs = Number(end - start) / 1e6;
          let parsed = null;
          try { parsed = chunks ? JSON.parse(chunks) : null; } catch { parsed = chunks; }
          resolve({ status: res.statusCode, wallMs, body: parsed, raw: chunks });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(45_000, () => req.destroy(new Error('request-timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (ms) => (ms == null ? '—' : `${ms.toFixed(1)}ms`);
const pct = (arr, p) => {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
};

function log(...m) { console.log(...m); }
function verbose(...m) { if (VERBOSE) console.log('  ·', ...m); }

// ── Discovery ───────────────────────────────────────────────────────────────
async function discoverAccount() {
  if (PINNED_ACCOUNT) {
    log(`📍 Using pinned account: ${PINNED_ACCOUNT}`);
    return PINNED_ACCOUNT;
  }
  log('🔍 Discovering trading account via /api/dashboard/snapshot …');
  const res = await request('GET', '/api/dashboard/snapshot');
  if (res.status !== 200 || !res.body) {
    log(`   ✗ snapshot failed (status ${res.status})`);
    log('   Raw:', res.raw?.slice(0, 300));
    return null;
  }
  const snapshot = res.body.snapshot || res.body;
  const accounts = (snapshot.tradingAccounts || []).filter(
    (a) => (a.status || '').toLowerCase() === 'active' || !a.status,
  );
  if (!accounts.length) {
    log('   ✗ No active trading accounts found in snapshot.');
    log('   Raw accounts:', JSON.stringify(snapshot.tradingAccounts || [], null, 2).slice(0, 500));
    return null;
  }
  const acct = accounts[0];
  const accountId = acct.id || acct.accountId;
  log(`   ✓ Found account: ${accountId}  (login=${acct.mt5Login || acct.login || '?'}, status=${acct.status || '?'})`);
  return accountId;
}

async function discoverSymbol(accountId) {
  if (PINNED_SYMBOL) {
    log(`📍 Using pinned symbol: ${PINNED_SYMBOL}`);
    return PINNED_SYMBOL;
  }
  log(`🔍 Discovering a tradeable symbol via /api/trading/symbols?accountId=${accountId} …`);
  const res = await request('GET', `/api/trading/symbols?accountId=${encodeURIComponent(accountId)}`);
  if (res.status !== 200 || !res.body) {
    log(`   ✗ symbols fetch failed (status ${res.status})`);
    log('   Raw:', res.raw?.slice(0, 300));
    // Sensible fallback — most MT5 servers have EURUSD.
    log('   Falling back to EURUSD.');
    return 'EURUSD';
  }
  const symbols = Array.isArray(res.body.symbols)
    ? res.body.symbols
    : Array.isArray(res.body.data)
      ? res.body.data
      : [];
  if (!symbols.length) {
    log('   ⚠ No symbols returned; falling back to EURUSD.');
    return 'EURUSD';
  }
  // Prefer a well-known liquid forex pair if available.
  const preferred = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD'];
  for (const name of preferred) {
    const match = symbols.find((s) => (s.name || s).toUpperCase() === name);
    if (match) {
      const sym = match.name || match;
      log(`   ✓ Using symbol: ${sym} (preferred match)`);
      return sym;
    }
  }
  const first = symbols[0];
  const sym = typeof first === 'string' ? first : first.name;
  log(`   ✓ Using symbol: ${sym} (first available)`);
  return sym;
}

// ── Trade actions ───────────────────────────────────────────────────────────
async function placeMarketOrder(accountId, symbol, type = 'buy', volume = VOLUME) {
  const path = `/api/trading/orders?accountId=${encodeURIComponent(accountId)}`;
  const body = { symbol, type, volume, fillingMode: 'ioc', deviation: 20 };
  verbose(`POST ${path}`, body);
  const res = await request('POST', path, { body });
  verbose(`  → status=${res.status} wallMs=${res.wallMs.toFixed(1)}`);
  return res;
}

async function closePosition(accountId, ticket) {
  const path = `/api/trading/positions?accountId=${encodeURIComponent(accountId)}&ticket=${ticket}`;
  verbose(`DELETE ${path}`);
  const res = await request('DELETE', path);
  verbose(`  → status=${res.status} wallMs=${res.wallMs.toFixed(1)}`);
  return res;
}

async function getPositions(accountId, { force = false } = {}) {
  const q = new URLSearchParams({ accountId });
  if (force) q.set('force', '1');
  const res = await request('GET', `/api/trading/positions?${q.toString()}`);
  return res;
}

function extractTicket(res) {
  if (!res || !res.body) return null;
  const candidates = [
    res.body.result,
    res.body.data,
    res.body,
  ].filter(Boolean);
  for (const c of candidates) {
    if (typeof c === 'object') {
      const t = c.ticket ?? c.positionId ?? c.orderTicket ?? c.dealTicket ?? c.ticketId;
      if (typeof t === 'number' && t > 0) return t;
      // Some gateways nest under 'position'
      if (c.position && typeof c.position === 'object') {
        const pt = c.position.ticket ?? c.position.positionId;
        if (typeof pt === 'number' && pt > 0) return pt;
      }
    }
  }
  return null;
}

async function findNewPositionTicket(accountId, beforeTickets) {
  // Poll positions a few times to catch the freshly-opened position.
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await getPositions(accountId);
    if (res.status === 200 && res.body) {
      const positions = Array.isArray(res.body.positions)
        ? res.body.positions
        : Array.isArray(res.body.data?.positions)
          ? res.body.data.positions
          : [];
      const tickets = positions.map((p) => p.ticket ?? p.positionId).filter((t) => typeof t === 'number');
      const newTicket = tickets.find((t) => !beforeTickets.includes(t));
      if (newTicket) return { ticket: newTicket, positions, pollAttempts: attempt + 1 };
    }
    await sleep(300);
  }
  return { ticket: null, pollAttempts: 8 };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  log('\n╔══════════════════════════════════════════════════════════════╗');
  log('║  yopips-terminal — Trade Performance Measurement            ║');
  log('║  Unbiased end-to-end timing of place + close trade          ║');
  log('╚══════════════════════════════════════════════════════════════╝\n');

  const account = await discoverAccount();
  if (!account) {
    log('\n❌ Could not discover an account. Pass --account=mt5-XXXXX.');
    process.exit(1);
  }
  const symbol = await discoverSymbol(account);

  // Warm-up: resolve the terminal session so the first measured call isn't penalised.
  log('\n🔥 Warming up terminal session (fetching account info)…');
  const warmup = await request('GET', `/api/trading/account?accountId=${encodeURIComponent(account)}`);
  log(`   warm-up status=${warmup.status} (${fmt(warmup.wallMs)})`);

  const placeTimes = [];
  const closeTimes = [];
  const roundTripTimes = [];
  const failures = [];
  const details = [];

  log(`\n🧪 Running ${ROUNDS} round(s) — symbol=${symbol} volume=${VOLUME}\n`);

  for (let i = 1; i <= ROUNDS; i++) {
    log(`── Round ${i}/${ROUNDS} ─────────────────────────────────────────`);

    // Snapshot existing tickets BEFORE placing so we can identify the new one.
    const beforeRes = await getPositions(account);
    const beforePositions = Array.isArray(beforeRes.body?.positions)
      ? beforeRes.body.positions
      : Array.isArray(beforeRes.body?.data?.positions)
        ? beforeRes.body.data.positions
        : [];
    const beforeTickets = beforePositions.map((p) => p.ticket ?? p.positionId).filter((t) => typeof t === 'number');
    verbose(`positions before: ${beforeTickets.length} open`);

    // ── PLACE ──
    const placeStart = process.hrtime.bigint();
    const placeRes = await placeMarketOrder(account, symbol, 'buy', VOLUME);
    const placeMs = Number(process.hrtime.bigint() - placeStart) / 1e6;

    const placeOk = placeRes.status >= 200 && placeRes.status < 300 && placeRes.body?.success !== false;
    let ticket = extractTicket(placeRes);

    if (!placeOk) {
      const errMsg = placeRes.body?.error || placeRes.raw?.slice(0, 200) || `HTTP ${placeRes.status}`;
      log(`   ❌ PLACE failed in ${fmt(placeMs)} → ${errMsg}`);
      failures.push({ round: i, action: 'place', status: placeRes.status, error: errMsg });
      details.push({ round: i, placeMs, closeMs: null, ticket: null, placeOk: false });
      continue;
    }

    placeTimes.push(placeMs);
    log(`   ✅ PLACE  ${symbol} buy ${VOLUME} → ${fmt(placeMs)}  (status ${placeRes.status})`);

    // If the response didn't carry the ticket, poll positions to discover it.
    if (!ticket) {
      verbose('   order response had no ticket — polling positions…');
      const found = await findNewPositionTicket(account, beforeTickets);
      ticket = found.ticket;
      verbose(`   poll found ticket=${ticket} after ${found.pollAttempts} attempt(s)`);
    }

    if (!ticket) {
      // Fallback: try a force-refresh poll.
      const found = await findNewPositionTicket(account, beforeTickets);
      ticket = found.ticket;
    }

    if (!ticket) {
      log(`   ⚠ Could not resolve a ticket to close. Skipping close measurement.`);
      failures.push({ round: i, action: 'resolve-ticket', status: placeRes.status, error: 'no ticket' });
      details.push({ round: i, placeMs, closeMs: null, ticket: null, placeOk: true });
      continue;
    }

    // Let the position settle on the backend.
    await sleep(SETTLE_MS);

    // ── CLOSE ──
    const closeStart = process.hrtime.bigint();
    const closeRes = await closePosition(account, ticket);
    const closeMs = Number(process.hrtime.bigint() - closeStart) / 1e6;

    const closeOk = closeRes.status >= 200 && closeRes.status < 300 && closeRes.body?.success !== false;
    if (!closeOk) {
      const errMsg = closeRes.body?.error || closeRes.raw?.slice(0, 200) || `HTTP ${closeRes.status}`;
      log(`   ❌ CLOSE failed in ${fmt(closeMs)} → ${errMsg}`);
      failures.push({ round: i, action: 'close', status: closeRes.status, error: errMsg });
      details.push({ round: i, placeMs, closeMs: null, ticket, placeOk: true });
      continue;
    }

    closeTimes.push(closeMs);
    const roundTripMs = placeMs + closeMs + SETTLE_MS;
    roundTripTimes.push(roundTripMs);
    log(`   ✅ CLOSE  ticket ${ticket} → ${fmt(closeMs)}  (status ${closeRes.status})`);
    log(`   ⏱  round-trip (place+settle+close) = ${fmt(roundTripMs)}\n`);

    details.push({ round: i, placeMs, closeMs, ticket, placeOk: true, closeOk: true, roundTripMs });

    await sleep(500);
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  log('\n╔══════════════════════════════════════════════════════════════╗');
  log('║  RESULTS                                                     ║');
  log('╚══════════════════════════════════════════════════════════════╝\n');

  const stats = (label, arr) => {
    if (!arr.length) {
      log(`  ${label.padEnd(12)} — no successful samples`);
      return;
    }
    const sum = arr.reduce((a, b) => a + b, 0);
    const avg = sum / arr.length;
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const p50 = pct(arr, 50);
    const p95 = pct(arr, 95);
    log(`  ${label.padEnd(12)} avg=${fmt(avg)}  min=${fmt(min)}  max=${fmt(max)}  p50=${fmt(p50)}  p95=${fmt(p95)}  (n=${arr.length})`);
  };

  stats('PLACE', placeTimes);
  stats('CLOSE', closeTimes);
  stats('ROUND-TRIP', roundTripTimes);

  log('\n  Per-round detail:');
  for (const d of details) {
    const line = d.closeOk
      ? `place=${fmt(d.placeMs)}  close=${fmt(d.closeMs)}  ticket=${d.ticket}`
      : d.placeOk
        ? `place=${fmt(d.placeMs)}  close=FAILED  ticket=${d.ticket ?? '—'}`
        : `place=FAILED  close=—`;
    log(`   round ${d.round}: ${line}`);
  }

  if (failures.length) {
    log('\n  ⚠ Failures:');
    for (const f of failures) {
      log(`   round ${f.round} [${f.action}]: ${f.error}`);
    }
  }

  // Verdict
  log('\n── Verdict ────────────────────────────────────────────────────');
  if (placeTimes.length) {
    const avgPlace = placeTimes.reduce((a, b) => a + b, 0) / placeTimes.length;
    if (avgPlace < 1000) log(`  • Placing a trade is FAST (${fmt(avgPlace)} avg).`);
    else if (avgPlace < 3000) log(`  • Placing a trade is ACCEPTABLE (${fmt(avgPlace)} avg) — under 3s.`);
    else log(`  • Placing a trade is SLOW (${fmt(avgPlace)} avg) — over 3s, investigate.`);
  }
  if (closeTimes.length) {
    const avgClose = closeTimes.reduce((a, b) => a + b, 0) / closeTimes.length;
    if (avgClose < 1000) log(`  • Closing a trade is FAST (${fmt(avgClose)} avg).`);
    else if (avgClose < 3000) log(`  • Closing a trade is ACCEPTABLE (${fmt(avgClose)} avg) — under 3s.`);
    else log(`  • Closing a trade is SLOW (${fmt(avgClose)} avg) — over 3s, investigate.`);
  }
  log('');
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});