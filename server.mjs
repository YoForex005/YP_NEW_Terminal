import { createHmac, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { WebSocket, WebSocketServer } from "ws";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.dirname(__dirname);

const args = new Set(process.argv.slice(2));
const dev = args.has("--dev")
  ? true
  : args.has("--prod")
    ? false
    : process.env.NODE_ENV !== "production";

if (!dev) {
  process.env.NODE_ENV ||= "production";
}

const { default: next } = await import("next");

const parsePort = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

const hostname = process.env.HOSTNAME || process.env.HOST || "0.0.0.0";
const port = parsePort(process.env.PORT, 3000);
const authTimeoutMs = parsePort(process.env.NODE_WS_AUTH_TIMEOUT_MS, 10_000);
const maxPendingFrames = parsePort(process.env.NODE_WS_MAX_PENDING_FRAMES, 200);
/** Client WS send buffer high-water mark; above this, PRICE_UPDATE ticks coalesce (latest-wins). */
const clientBackpressureBytes = parsePort(
  process.env.NODE_WS_CLIENT_BACKPRESSURE_BYTES,
  512 * 1024,
);
const requiredUpstreamEvents = [
  "SYMBOL_LIST",
  "PRICE_UPDATE",
  "POSITION_UPDATE",
  "BALANCE_UPDATE",
];

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const normalizeWebSocketUrl = (url) => {
  if (url.startsWith("ws://") || url.startsWith("wss://")) {
    return url;
  }

  if (url.startsWith("http://")) {
    return `ws://${url.slice("http://".length)}`;
  }

  if (url.startsWith("https://")) {
    return `wss://${url.slice("https://".length)}`;
  }

  return url;
};

const resolveEnvFileValue = (envPath, key) => {
  if (!existsSync(envPath)) {
    return undefined;
  }

  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [entryKey, ...rest] = trimmed.split("=");
    if (entryKey.trim() !== key) {
      continue;
    }

    let value = rest.join("=").trim();
    if (!value) {
      return undefined;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).trim();
    }

    return value || undefined;
  }

  return undefined;
};

const resolveEnvValue = (key) => {
  const direct = process.env[key]?.trim();
  if (direct) {
    return direct;
  }

  const envPaths = [
    path.join(__dirname, ".env.local"),
    path.join(__dirname, ".env"),
    path.join(repoRoot, "backend c++", ".env.local"),
    path.join(repoRoot, "backend c++", ".env"),
  ];

  for (const envPath of envPaths) {
    const value = resolveEnvFileValue(envPath, key);
    if (value) {
      return value;
    }
  }

  return undefined;
};

const upstreamRealtimeUrl = normalizeWebSocketUrl(
  resolveEnvValue("CPP_REALTIME_WS_URL") ||
    resolveEnvValue("MT5_REALTIME_WS_URL") ||
    resolveEnvValue("REALTIME_WS_URL") ||
    `ws://127.0.0.1:${resolveEnvValue("WEBSOCKET_PORT") || "3003"}`,
);

const normalizePathname = (pathname) => {
  const trimmed = String(pathname || "").trim();
  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return trimTrailingSlash(withLeadingSlash) || "/";
};

const normalizeBridgePath = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    const normalized = normalizeWebSocketUrl(trimmed);
    const parsed = new URL(normalized, `ws://127.0.0.1:${port}`);
    return normalizePathname(parsed.pathname);
  } catch {
    return null;
  }
};

const bridgePaths = new Set(
  (process.env.NODE_WS_PATHS || "/ws,/api/ws,/stream,/realtime,/")
    .split(",")
    .map(normalizeBridgePath)
    .filter(Boolean),
);

const parseComparableWsUrl = (value) => {
  try {
    const normalized = normalizeWebSocketUrl(value.trim());
    const baseUrl = `ws://127.0.0.1:${port}`;
    return new URL(normalized, baseUrl);
  } catch {
    return null;
  }
};

const resolveUrlPort = (url) => {
  if (url.port) {
    return url.port;
  }

  if (url.protocol === "wss:" || url.protocol === "https:") {
    return "443";
  }

  if (url.protocol === "ws:" || url.protocol === "http:") {
    return "80";
  }

  return "";
};

const loopbackHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const isLoopbackHost = (hostnameValue) =>
  loopbackHosts.has(hostnameValue.toLowerCase());

const isLikelyUpstreamTarget = (candidateUrl) => {
  const upstreamUrl = parseComparableWsUrl(upstreamRealtimeUrl);
  if (!upstreamUrl) {
    return false;
  }

  const sameHost =
    candidateUrl.hostname.toLowerCase() === upstreamUrl.hostname.toLowerCase();
  const samePort = resolveUrlPort(candidateUrl) === resolveUrlPort(upstreamUrl);
  if (sameHost && samePort) {
    return true;
  }

  return (
    samePort &&
    isLoopbackHost(candidateUrl.hostname) &&
    isLoopbackHost(upstreamUrl.hostname)
  );
};

const defaultPublicBridgePath = bridgePaths.has("/ws")
  ? "/ws"
  : [...bridgePaths][0] || "/ws";

const resolvePublicWebSocketUrl = () => {
  const configured = resolveEnvValue("NEXT_PUBLIC_WS_URL");
  if (!configured) {
    return {
      configured: null,
      rewritten: false,
      rewriteReason: null,
      value: defaultPublicBridgePath,
    };
  }

  const candidateUrl = parseComparableWsUrl(configured);
  if (!candidateUrl) {
    console.warn(
      `[node-ws-bridge] Ignoring invalid NEXT_PUBLIC_WS_URL "${configured}". Using ${defaultPublicBridgePath}.`,
    );
    return {
      configured,
      rewritten: true,
      rewriteReason: "invalid_public_ws_url",
      value: defaultPublicBridgePath,
    };
  }

  if (isLikelyUpstreamTarget(candidateUrl)) {
    console.warn(
      `[node-ws-bridge] NEXT_PUBLIC_WS_URL points at the C++ upstream. Using Node bridge endpoint ${defaultPublicBridgePath}.`,
    );
    return {
      configured,
      rewritten: true,
      rewriteReason: "public_ws_url_pointed_at_cpp_upstream",
      value: defaultPublicBridgePath,
    };
  }

  const candidatePath = normalizePathname(candidateUrl.pathname);
  if (!bridgePaths.has(candidatePath)) {
    console.warn(
      `[node-ws-bridge] NEXT_PUBLIC_WS_URL path "${candidateUrl.pathname}" is not served by the Node bridge. Using ${defaultPublicBridgePath}.`,
    );
    return {
      configured,
      rewritten: true,
      rewriteReason: "public_ws_url_path_not_served_by_bridge",
      value: defaultPublicBridgePath,
    };
  }

  return {
    configured,
    rewritten: false,
    rewriteReason: null,
    value: normalizeWebSocketUrl(configured.trim()),
  };
};

const publicWebSocketResolution = resolvePublicWebSocketUrl();
const publicWebSocketUrl = publicWebSocketResolution.value;
process.env.NEXT_PUBLIC_WS_URL = publicWebSocketUrl;

const bridgeStartedAtMs = Date.now();
const bridgeStats = {
  acceptedConnections: 0,
  activeClients: 0,
  authenticatedClients: 0,
  activeUpstreamConnections: 0,
  clientFramesForwarded: 0,
  clientBinaryFramesForwarded: 0,
  upstreamFramesForwarded: 0,
  upstreamBinaryFramesForwarded: 0,
  droppedTicks: 0,
  upstreamEventCounts: Object.fromEntries(
    requiredUpstreamEvents.map((eventName) => [eventName, 0]),
  ),
  lastAuthFailureAt: null,
  lastClientForwardAt: null,
  lastUpstreamEventAt: null,
  lastUpstreamErrorAt: null,
  lastUpstreamErrorMessage: null,
  lastUpstreamCloseAt: null,
  lastUpstreamCloseCode: null,
  lastUpstreamCloseReason: null,
};

const upstreamDiagnosticMessage = (problem) =>
  `${problem} C++ realtime upstream: ${trimTrailingSlash(upstreamRealtimeUrl)}. Start or restart the C++ backend/realtime websocket, verify WEBSOCKET_PORT/CPP_REALTIME_WS_URL, and confirm MT5 Manager/quotes are available. Bridge health: /api/node-bridge/health.`;

const extractEventName = (data, isBinary) => {
  if (isBinary) {
    return undefined;
  }

  try {
    const text = frameToUtf8Text(data);
    const frame = JSON.parse(text);
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
      return undefined;
    }

    if (typeof frame.event === "string" && frame.event.trim()) {
      return frame.event.trim();
    }

    if (typeof frame.type === "string" && frame.type.trim()) {
      return frame.type.trim();
    }
  } catch {
    return undefined;
  }

  return undefined;
};

/** True for PRICE_UPDATE / tick / quote style events (case-insensitive). */
const isPriceUpdateEventName = (eventName) => {
  if (typeof eventName !== "string" || !eventName.trim()) {
    return false;
  }

  switch (eventName.trim().toLowerCase()) {
    case "price_update":
    case "tick":
    case "quote":
    case "quotes":
      return true;
    default:
      return false;
  }
};

/**
 * Lightweight coalesce key for price ticks under client backpressure.
 * Prefers symbol when cheap to read; falls back to "*" (latest overall).
 */
const extractPriceCoalesceKey = (data, isBinary) => {
  if (isBinary) {
    return "*";
  }

  try {
    const text = frameToUtf8Text(data);
    const frame = JSON.parse(text);
    if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
      return "*";
    }

    if (typeof frame.symbol === "string" && frame.symbol.trim()) {
      return frame.symbol.trim();
    }

    for (const nestKey of ["tick", "quote", "price", "data", "payload"]) {
      const nested = frame[nestKey];
      if (
        nested &&
        typeof nested === "object" &&
        !Array.isArray(nested) &&
        typeof nested.symbol === "string" &&
        nested.symbol.trim()
      ) {
        return nested.symbol.trim();
      }
    }

    return "*";
  } catch {
    return "*";
  }
};

const recordUpstreamFrame = (data, isBinary) => {
  bridgeStats.upstreamFramesForwarded += 1;
  bridgeStats.lastUpstreamEventAt = new Date().toISOString();

  if (isBinary) {
    bridgeStats.upstreamBinaryFramesForwarded += 1;
    return;
  }

  const eventName = extractEventName(data, isBinary);
  if (!eventName) {
    return;
  }

  bridgeStats.upstreamEventCounts[eventName] =
    (bridgeStats.upstreamEventCounts[eventName] || 0) + 1;
};

const recordClientFrame = (isBinary) => {
  bridgeStats.clientFramesForwarded += 1;
  bridgeStats.lastClientForwardAt = new Date().toISOString();
  if (isBinary) {
    bridgeStats.clientBinaryFramesForwarded += 1;
  }
};

const getWebtraderSecret = () => {
  const secret =
    resolveEnvValue("WEBTRADER_TOKEN_SECRET") || resolveEnvValue("JWT_SECRET");

  if (!secret) {
    throw new Error(
      "WEBTRADER_TOKEN_SECRET is not configured for the Node WebSocket bridge.",
    );
  }

  return secret;
};

const signTokenBody = (body, secret) =>
  createHmac("sha256", secret).update(body).digest("base64url");

const verifyWebtraderToken = (token) => {
  if (typeof token !== "string" || token.length > 16_384) {
    throw new Error("Missing or invalid terminal token.");
  }

  const dotIdx = token.lastIndexOf(".");
  if (dotIdx <= 0 || dotIdx === token.length - 1) {
    throw new Error("Malformed terminal token.");
  }

  const body = token.slice(0, dotIdx);
  const signature = token.slice(dotIdx + 1);
  const expected = signTokenBody(body, getWebtraderSecret());
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");

  const signatureMatches =
    expectedBuffer.length === actualBuffer.length &&
    timingSafeEqual(expectedBuffer, actualBuffer);

  if (!signatureMatches) {
    throw new Error("Invalid terminal token signature.");
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid terminal token payload.");
  }

  const expiresAt = Number(payload.exp);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    throw new Error("Terminal token expired.");
  }

  if (!payload.userId || !payload.accountId || !payload.login) {
    throw new Error("Terminal token is missing required claims.");
  }

  return payload;
};

const sendJson = (socket, payload) => {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    socket.send(JSON.stringify(payload));
  } catch {
    // Best-effort diagnostics only; transport cleanup happens through ws events.
  }
};

const sendError = (socket, requestId, code, message) => {
  sendJson(socket, {
    event: "error",
    requestId,
    error: { code, message },
  });
};

const frameToUtf8Text = (data) => {
  if (typeof data === "string") {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString(
      "utf8",
    );
  }

  return String(data);
};

const normalizeForwardFrame = (data, isBinary) =>
  isBinary ? data : frameToUtf8Text(data);

const parseClientFrame = (data, isBinary) => {
  if (isBinary) {
    throw new Error("Binary frames are not accepted before authentication.");
  }

  const text = frameToUtf8Text(data);
  const frame = JSON.parse(text);
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) {
    throw new Error("WebSocket frames must be JSON objects.");
  }

  return { frame, text };
};

const extractRequestId = (frame) =>
  typeof frame.requestId === "string" ? frame.requestId : undefined;

const extractTerminalToken = (frame) => {
  if (frame.action !== "auth_with_token") {
    throw new Error("First WebSocket frame must be auth_with_token.");
  }

  const data = frame.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("auth_with_token requires a data object.");
  }

  const token = data.token;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("auth_with_token requires a token.");
  }

  return token;
};

const normalizeCloseCode = (code, fallback = 1011) => {
  if (
    code === 1000 ||
    code === 1001 ||
    code === 1002 ||
    code === 1003 ||
    (code >= 1007 && code <= 1014) ||
    (code >= 3000 && code <= 4999)
  ) {
    return code;
  }

  return fallback;
};

const closeSocket = (socket, code, reason) => {
  if (
    socket.readyState === WebSocket.OPEN ||
    socket.readyState === WebSocket.CONNECTING
  ) {
    socket.close(normalizeCloseCode(code), String(reason || "").slice(0, 120));
  }
};

const createBridgeConnection = (client, request) => {
  const remote =
    request.socket.remoteAddress && request.socket.remotePort
      ? `${request.socket.remoteAddress}:${request.socket.remotePort}`
      : "unknown";
  let upstream = null;
  let upstreamOpen = false;
  let upstreamCounted = false;
  let authenticated = false;
  let authenticatedCounted = false;
  let closed = false;
  const pendingFrames = [];
  /** @type {Map<string, { frame: any, isBinary: boolean }>} latest-wins price ticks while client is backpressured */
  const pendingPriceByKey = new Map();
  let priceFlushTimer = null;

  bridgeStats.acceptedConnections += 1;
  bridgeStats.activeClients += 1;

  const authTimer = setTimeout(() => {
    sendError(
      client,
      undefined,
      "WS_AUTH_TIMEOUT",
      "WebSocket authentication timed out.",
    );
    closeSocket(client, 1008, "Authentication timed out");
  }, authTimeoutMs);

  const markAuthenticated = () => {
    if (authenticatedCounted) {
      return;
    }

    authenticatedCounted = true;
    bridgeStats.authenticatedClients += 1;
  };

  const markUpstreamOpen = () => {
    if (upstreamCounted) {
      return;
    }

    upstreamCounted = true;
    bridgeStats.activeUpstreamConnections += 1;
  };

  const markUpstreamClosed = () => {
    if (!upstreamCounted) {
      return;
    }

    upstreamCounted = false;
    bridgeStats.activeUpstreamConnections = Math.max(
      0,
      bridgeStats.activeUpstreamConnections - 1,
    );
  };

  const clearPriceFlushTimer = () => {
    if (priceFlushTimer != null) {
      clearTimeout(priceFlushTimer);
      priceFlushTimer = null;
    }
  };

  const cleanup = () => {
    if (closed) {
      return;
    }

    closed = true;
    clearTimeout(authTimer);
    clearPriceFlushTimer();
    pendingPriceByKey.clear();
    bridgeStats.activeClients = Math.max(0, bridgeStats.activeClients - 1);
    if (authenticatedCounted) {
      authenticatedCounted = false;
      bridgeStats.authenticatedClients = Math.max(
        0,
        bridgeStats.authenticatedClients - 1,
      );
    }

    if (upstream) {
      closeSocket(upstream, 1000, "Client disconnected");
      upstream = null;
    }
  };

  const forwardToUpstream = (data, isBinary) => {
    if (!upstream || upstream.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      upstream.send(normalizeForwardFrame(data, isBinary), { binary: isBinary });
      recordClientFrame(isBinary);
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to write upstream.";
      console.error("[node-ws-bridge] upstream send error", {
        remote,
        message,
      });
      sendError(
        client,
        undefined,
        "UPSTREAM_WS_ERROR",
        upstreamDiagnosticMessage("Realtime upstream write failed."),
      );
      closeSocket(client, 1011, "Realtime upstream unavailable");
      cleanup();
      return false;
    }
  };

  const enqueueOrForward = (data, isBinary) => {
    if (!upstream || !upstreamOpen) {
      if (pendingFrames.length >= maxPendingFrames) {
        sendError(
          client,
          undefined,
          "WS_BACKPRESSURE",
          "Realtime bridge queue is full.",
        );
        closeSocket(client, 1013, "Bridge queue is full");
        return;
      }

      pendingFrames.push({ data, isBinary });
      return;
    }

    forwardToUpstream(data, isBinary);
  };

  const flushPendingFrames = () => {
    while (
      upstream &&
      upstream.readyState === WebSocket.OPEN &&
      pendingFrames.length > 0
    ) {
      const next = pendingFrames.shift();
      if (!forwardToUpstream(next.data, next.isBinary)) {
        return;
      }
    }
  };

  const sendFrameToClient = (frame, isBinary) => {
    client.send(frame, { binary: isBinary });
    recordUpstreamFrame(frame, isBinary);
  };

  const schedulePriceFlush = () => {
    if (priceFlushTimer != null || closed) {
      return;
    }

    priceFlushTimer = setTimeout(() => {
      priceFlushTimer = null;
      flushCoalescedPriceTicks();
    }, 8);
  };

  const flushCoalescedPriceTicks = () => {
    if (
      closed ||
      pendingPriceByKey.size === 0 ||
      client.readyState !== WebSocket.OPEN
    ) {
      return;
    }

    for (const [key, pending] of pendingPriceByKey) {
      if (client.bufferedAmount > clientBackpressureBytes) {
        schedulePriceFlush();
        return;
      }

      try {
        sendFrameToClient(pending.frame, pending.isBinary);
        pendingPriceByKey.delete(key);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to write client.";
        console.error("[node-ws-bridge] client send error", {
          remote,
          message,
        });
        closeSocket(client, 1011, "Realtime bridge write failed");
        cleanup();
        return;
      }
    }
  };

  const coalescePriceTick = (frame, isBinary) => {
    const key = extractPriceCoalesceKey(frame, isBinary);
    if (pendingPriceByKey.has(key)) {
      bridgeStats.droppedTicks += 1;
    }
    pendingPriceByKey.set(key, { frame, isBinary });
    schedulePriceFlush();
  };

  const connectUpstream = (authPayload) => {
    upstream = new WebSocket(upstreamRealtimeUrl, {
      perMessageDeflate: false,
      headers: {
        "x-node-bridge-authenticated": "true",
        "x-webtrader-user-id": String(authPayload.userId),
        "x-webtrader-account-id": String(authPayload.accountId),
        "x-webtrader-login": String(authPayload.login),
        "x-webtrader-server": String(authPayload.server || ""),
        "x-webtrader-terminal-session-id": String(
          authPayload.terminalSessionId || "",
        ),
      },
    });

    upstream.on("open", () => {
      upstreamOpen = true;
      markUpstreamOpen();
      flushPendingFrames();
    });

    upstream.on("message", (data, isBinary) => {
      if (client.readyState !== WebSocket.OPEN) {
        return;
      }

      try {
        const frame = normalizeForwardFrame(data, isBinary);
        const underBackpressure =
          client.bufferedAmount > clientBackpressureBytes;

        if (underBackpressure) {
          // Classify only under pressure: coalesce PRICE_UPDATE ticks (latest-wins).
          // Auth, trade, POSITION, BALANCE, errors, requestId responses always forward.
          const eventName = extractEventName(frame, isBinary);
          if (isPriceUpdateEventName(eventName)) {
            coalescePriceTick(frame, isBinary);
            return;
          }

          sendFrameToClient(frame, isBinary);
          return;
        }

        // Low buffer: raw pass-through (plus any held latest ticks).
        flushCoalescedPriceTicks();
        sendFrameToClient(frame, isBinary);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to write client.";
        console.error("[node-ws-bridge] client send error", {
          remote,
          message,
        });
        closeSocket(client, 1011, "Realtime bridge write failed");
        cleanup();
      }
    });

    upstream.on("close", (code, reasonBuffer) => {
      upstreamOpen = false;
      markUpstreamClosed();
      const reason = reasonBuffer.toString() || "Upstream realtime closed";
      bridgeStats.lastUpstreamCloseAt = new Date().toISOString();
      bridgeStats.lastUpstreamCloseCode = code || null;
      bridgeStats.lastUpstreamCloseReason = reason;
      if (client.readyState === WebSocket.OPEN) {
        sendError(
          client,
          undefined,
          "UPSTREAM_WS_CLOSED",
          upstreamDiagnosticMessage(
            `Realtime upstream closed${code ? ` with code ${code}` : ""}: ${reason}.`,
          ),
        );
        closeSocket(client, code || 1011, reason);
      }
      cleanup();
    });

    upstream.on("error", (error) => {
      console.error("[node-ws-bridge] upstream error", {
        remote,
        upstream: trimTrailingSlash(upstreamRealtimeUrl),
        message: error.message,
      });
      bridgeStats.lastUpstreamErrorAt = new Date().toISOString();
      bridgeStats.lastUpstreamErrorMessage = error.message;
      markUpstreamClosed();
      sendError(
        client,
        undefined,
        "UPSTREAM_WS_ERROR",
        upstreamDiagnosticMessage(
          `Realtime upstream is unavailable: ${error.message}.`,
        ),
      );
      closeSocket(client, 1011, "Realtime upstream unavailable");
      cleanup();
    });
  };

  client.on("message", (data, isBinary) => {
    if (!authenticated) {
      let requestId;
      let authPayload;
      let authFrameText;
      try {
        const { frame, text } = parseClientFrame(data, isBinary);
        requestId = extractRequestId(frame);
        const token = extractTerminalToken(frame);
        authPayload = verifyWebtraderToken(token);
        authFrameText = text;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "WebSocket auth failed.";
        bridgeStats.lastAuthFailureAt = new Date().toISOString();
        sendError(client, requestId, "WS_AUTH_FAILED", message);
        closeSocket(client, 1008, "Authentication failed");
        return;
      }

      try {
        authenticated = true;
        markAuthenticated();
        clearTimeout(authTimer);
        connectUpstream(authPayload);
        enqueueOrForward(authFrameText, false);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to connect upstream.";
        console.error("[node-ws-bridge] upstream startup error", {
          remote,
          message,
        });
        bridgeStats.lastUpstreamErrorAt = new Date().toISOString();
        sendError(
          client,
          requestId,
          "UPSTREAM_WS_ERROR",
          upstreamDiagnosticMessage(
            `Realtime upstream could not be opened: ${message}.`,
          ),
        );
        closeSocket(client, 1011, "Realtime upstream unavailable");
        cleanup();
      }
      return;
    }

    enqueueOrForward(normalizeForwardFrame(data, isBinary), isBinary);
  });

  client.on("close", cleanup);
  client.on("error", (error) => {
    console.error("[node-ws-bridge] client error", {
      remote,
      message: error.message,
    });
    cleanup();
  });
};

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

await app.prepare();

const handleUpgrade =
  typeof app.getUpgradeHandler === "function" ? app.getUpgradeHandler() : null;
let nextHttpRequestSeen = false;

const findBuiltChunk = (...segments) => {
  const chunkPath = path.join(__dirname, ".next", "static", "chunks", ...segments);
  const directory = path.dirname(chunkPath);
  const basename = path.basename(chunkPath, ".js");

  if (existsSync(chunkPath)) {
    return chunkPath;
  }

  if (!existsSync(directory)) {
    return null;
  }

  const match = readdirSync(directory).find(
    (entry) => entry === `${basename}.js` || entry.startsWith(`${basename}-`),
  );
  return match ? path.join(directory, match) : null;
};

const staleNextChunkFallbacks = new Map(
  [
    ["/_next/static/chunks/main.js", findBuiltChunk("main.js")],
    ["/_next/static/chunks/pages/_app.js", findBuiltChunk("pages", "_app.js")],
    [
      "/_next/static/chunks/pages/_error.js",
      findBuiltChunk("pages", "_error.js"),
    ],
  ].filter(([, filePath]) => Boolean(filePath)),
);

const handleStaleNextChunkRequest = (pathname, response) => {
  if (pathname === "/_next/static/chunks/react-refresh.js") {
    response.writeHead(200, {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "no-store",
      "x-next-stale-chunk-fallback": "empty-react-refresh",
    });
    response.end("self.$RefreshReg$=self.$RefreshReg$||function(){};self.$RefreshSig$=self.$RefreshSig$||function(){return function(type){return type}};\n");
    return true;
  }

  const filePath = staleNextChunkFallbacks.get(pathname);
  if (!filePath) {
    return false;
  }

  response.writeHead(200, {
    "content-type": "application/javascript; charset=utf-8",
    "cache-control": "no-store",
    "x-next-stale-chunk-fallback": "hashed-build-chunk",
  });
  createReadStream(filePath).pipe(response);
  return true;
};

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

const bridgeHealthPayload = () => {
  const parsedPublicWsUrl = parseComparableWsUrl(publicWebSocketUrl);
  const publicWsPath =
    normalizeBridgePath(parsedPublicWsUrl?.pathname || defaultPublicBridgePath) ||
    defaultPublicBridgePath;

  return {
    ok: true,
    mode: dev ? "development" : "production",
    publicWsUrl: publicWebSocketUrl,
    wsPaths: [...bridgePaths],
    browserWebSocket: {
      endpoint: publicWebSocketUrl,
      requestedEndpoint: publicWebSocketResolution.configured,
      path: publicWsPath,
      servedByBridge: bridgePaths.has(publicWsPath),
      rewritten: publicWebSocketResolution.rewritten,
      rewriteReason: publicWebSocketResolution.rewriteReason,
      directCppUpstreamBlocked:
        publicWebSocketResolution.rewriteReason ===
        "public_ws_url_pointed_at_cpp_upstream",
      requiresTerminalToken: true,
      authAction: "auth_with_token",
    },
    upstream: {
      configured: Boolean(upstreamRealtimeUrl),
      realtimeUrl: trimTrailingSlash(upstreamRealtimeUrl),
      internalOnly: true,
      envKeys: [
        "CPP_REALTIME_WS_URL",
        "MT5_REALTIME_WS_URL",
        "REALTIME_WS_URL",
        "WEBSOCKET_PORT",
      ],
    },
    proxy: {
      mode: "raw-frame-pass-through",
      mutatesTradingPayloads: false,
      clientBackpressureBytes,
      priceTickCoalesceUnderBackpressure: true,
      proxiedEvents: requiredUpstreamEvents,
    },
    bridge: {
      startedAt: new Date(bridgeStartedAtMs).toISOString(),
      uptimeSeconds: Math.floor((Date.now() - bridgeStartedAtMs) / 1000),
      activeClients: bridgeStats.activeClients,
      acceptedConnections: bridgeStats.acceptedConnections,
      authenticatedClients: bridgeStats.authenticatedClients,
      activeUpstreamConnections: bridgeStats.activeUpstreamConnections,
      clientFramesForwarded: bridgeStats.clientFramesForwarded,
      clientBinaryFramesForwarded: bridgeStats.clientBinaryFramesForwarded,
      upstreamFramesForwarded: bridgeStats.upstreamFramesForwarded,
      upstreamBinaryFramesForwarded: bridgeStats.upstreamBinaryFramesForwarded,
      droppedTicks: bridgeStats.droppedTicks,
      clientBackpressureBytes,
      requiredUpstreamEvents: Object.fromEntries(
        requiredUpstreamEvents.map((eventName) => [
          eventName,
          bridgeStats.upstreamEventCounts[eventName] || 0,
        ]),
      ),
      upstreamEventCounts: bridgeStats.upstreamEventCounts,
      lastAuthFailureAt: bridgeStats.lastAuthFailureAt,
      lastClientForwardAt: bridgeStats.lastClientForwardAt,
      lastUpstreamEventAt: bridgeStats.lastUpstreamEventAt,
      lastUpstreamErrorAt: bridgeStats.lastUpstreamErrorAt,
      lastUpstreamErrorMessage: bridgeStats.lastUpstreamErrorMessage,
      lastUpstreamCloseAt: bridgeStats.lastUpstreamCloseAt,
      lastUpstreamCloseCode: bridgeStats.lastUpstreamCloseCode,
      lastUpstreamCloseReason: bridgeStats.lastUpstreamCloseReason,
    },
    diagnostics: {
      browserShouldConnectTo: publicWebSocketUrl,
      cxxRealtimeUpstream: trimTrailingSlash(upstreamRealtimeUrl),
      noSymbolListObserved:
        (bridgeStats.upstreamEventCounts.SYMBOL_LIST || 0) === 0,
      noPriceUpdatesObserved:
        (bridgeStats.upstreamEventCounts.PRICE_UPDATE || 0) === 0,
      hints: [
        "Browser websocket must use the Node bridge endpoint, usually /ws.",
        "C++ must accept auth_with_token and acknowledge get_symbols with symbols or publish SYMBOL_LIST.",
        "C++ must publish PRICE_UPDATE after subscribe_symbols for live bid/ask prices.",
      ],
    },
  };
};

const getRequestUrl = (request) => {
  const host = request.headers.host || `127.0.0.1:${port}`;
  return new URL(request.url || "/", `http://${host}`);
};

const headerValue = (value) => (Array.isArray(value) ? value[0] : value);

const isWebSocketUpgrade = (request) =>
  String(headerValue(request.headers.upgrade) || "").toLowerCase() ===
  "websocket";

const isNextUpgradePath = (pathname) =>
  pathname === "/_next/webpack-hmr" || pathname.endsWith("/_next/webpack-hmr");

const closeUpgradeSocket = (socket, statusCode, statusMessage) => {
  if (socket.destroyed) {
    return;
  }

  const message = `${statusCode} ${statusMessage}\n`;
  try {
    if (socket.writable) {
      socket.write(
        `HTTP/1.1 ${statusCode} ${statusMessage}\r\n` +
          "Connection: close\r\n" +
          "Content-Type: text/plain; charset=utf-8\r\n" +
          `Content-Length: ${Buffer.byteLength(message)}\r\n` +
          "\r\n" +
          message,
      );
    }
  } catch {
    // The socket is already going away; destroy below is the important part.
  }

  socket.destroy();
};

const delegateNextUpgrade = (request, socket, head) => {
  if (!handleUpgrade) {
    closeUpgradeSocket(socket, 404, "WebSocket endpoint not found");
    return;
  }

  Promise.resolve(handleUpgrade(request, socket, head)).catch((error) => {
    const message =
      error instanceof Error ? error.message : "Next upgrade handler failed.";
    console.error("[node-ws-bridge] Next upgrade handler failed", {
      path: request.url,
      message,
    });
    closeUpgradeSocket(socket, 500, "Next upgrade failed");
  });
};

const server = createServer((request, response) => {
  const url = getRequestUrl(request);

  if (url.pathname === "/api/node-bridge/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(bridgeHealthPayload()));
    return;
  }

  if (handleStaleNextChunkRequest(url.pathname, response)) {
    return;
  }

  nextHttpRequestSeen = true;
  void handle(request, response);
});

server.on("upgrade", (request, socket, head) => {
  const url = getRequestUrl(request);
  const pathname = normalizePathname(url.pathname);

  if (!isWebSocketUpgrade(request)) {
    closeUpgradeSocket(socket, 400, "Expected WebSocket upgrade");
    return;
  }

  if (bridgePaths.has(pathname)) {
    try {
      wss.handleUpgrade(request, socket, head, (client) => {
        createBridgeConnection(client, request);
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "WebSocket upgrade failed.";
      console.error("[node-ws-bridge] WebSocket bridge upgrade failed", {
        path: request.url,
        message,
      });
      closeUpgradeSocket(socket, 400, "WebSocket upgrade failed");
    }
    return;
  }

  if (dev && isNextUpgradePath(pathname)) {
    if (!nextHttpRequestSeen) {
      closeUpgradeSocket(socket, 503, "Next HMR not ready");
      return;
    }

    delegateNextUpgrade(request, socket, head);
    return;
  }

  closeUpgradeSocket(socket, 404, "WebSocket endpoint not found");
});

server.listen(port, hostname, () => {
  console.log(
    `[node-ws-bridge] Next ${dev ? "dev" : "production"} server listening on http://${hostname}:${port}`,
  );
  console.log(
    `[node-ws-bridge] WebSocket bridge ${process.env.NEXT_PUBLIC_WS_URL} -> ${upstreamRealtimeUrl}`,
  );
});

const shutdown = () => {
  wss.clients.forEach((client) => client.terminate());
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
