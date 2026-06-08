/**
 * Positions API
 * GET /api/trading/positions - Get open positions
 * DELETE /api/trading/positions?ticket=XXX - Close position
 */

import { createConnection } from 'node:net';

import { NextRequest } from 'next/server';

import { authenticateRequest } from '@/lib/server/auth';
import {
  requestAccountsBackend,
  withBrokerContext,
} from '@/lib/server/accounts-backend';
import { resolveOwnedMt5Login } from '@/lib/server/mt5-account-scope';
import {
  TerminalBridgeError,
  requestTerminalAction,
  requireTradingAccountId,
} from '@/lib/server/terminal-ws-bridge';
import {
  buildLiveTradingStateRequestPayload,
  tradingApiJson,
} from '@/lib/server/trading-api-route';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

const DEFAULT_TERMINAL_STATE_POSITIONS_TIMEOUT_MS = 500;
const DEFAULT_ACCOUNT_CACHE_POSITIONS_TIMEOUT_MS = 350;
const DEFAULT_DIRECT_REDIS_POSITIONS_TIMEOUT_MS = 200;
const DEFAULT_ACCOUNT_CACHE_POSITIONS_BASE_URL = 'http://127.0.0.1:3000';
const TERMINAL_STATE_POSITIONS_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.TRADING_POSITIONS_TERMINAL_STATE_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.trunc(parsed)
    : DEFAULT_TERMINAL_STATE_POSITIONS_TIMEOUT_MS;
})();
const ACCOUNT_CACHE_POSITIONS_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.TRADING_POSITIONS_ACCOUNT_CACHE_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.trunc(parsed)
    : DEFAULT_ACCOUNT_CACHE_POSITIONS_TIMEOUT_MS;
})();
const DIRECT_REDIS_POSITIONS_TIMEOUT_MS = (() => {
  const parsed = Number(process.env.TRADING_POSITIONS_REDIS_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.trunc(parsed)
    : DEFAULT_DIRECT_REDIS_POSITIONS_TIMEOUT_MS;
})();

class TerminalStatePositionsTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Terminal-state positions lookup timed out after ${timeoutMs}ms.`);
    this.name = 'TerminalStatePositionsTimeoutError';
  }
}

const isTerminalStatePositionsTimeoutError = (
  error: unknown,
): error is TerminalStatePositionsTimeoutError =>
  error instanceof TerminalStatePositionsTimeoutError;

const bridgeErrorResponse = (error: unknown) => {
  if (error instanceof TerminalBridgeError) {
    return tradingApiJson(
      {
        success: false,
        error: error.message,
        code: error.code,
        details: error.details,
      },
      { status: error.status },
    );
  }

  return tradingApiJson(
    {
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
    },
    { status: 500 },
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const requestAuthHeaders = (request: NextRequest): HeadersInit => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  const authorization = request.headers.get('authorization');
  const cookie = request.headers.get('cookie');

  if (authorization?.trim()) {
    headers.Authorization = authorization;
  }
  if (cookie?.trim()) {
    headers.Cookie = cookie;
  }

  return headers;
};

const normalizeAccountIdentity = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim().replace(/^mt5-/i, '');
  return normalized || null;
};

const normalizeBrokerIdentity = (value: unknown): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
};

interface TerminalStateScope {
  accountId: string;
  login: string | null;
  brokerId: string | null;
}

const TERMINAL_STATE_SCOPE_ENVELOPE_KEYS = [
  'data',
  'payload',
  'result',
  'terminalState',
  'terminal_state',
  'state',
  'snapshot',
] as const;

const collectTerminalStateScopeSources = (
  payload: unknown,
): Record<string, unknown>[] => {
  const root = isRecord(payload) ? payload : {};
  const sources: Record<string, unknown>[] = [root];

  for (const key of TERMINAL_STATE_SCOPE_ENVELOPE_KEYS) {
    const candidate = root[key];
    if (isRecord(candidate)) {
      sources.push(candidate);
    }
  }

  return sources;
};

const firstBrokerIdentity = (
  sources: Record<string, unknown>[],
): string | null => {
  for (const source of sources) {
    const brokerId =
      normalizeBrokerIdentity(source.brokerId) ??
      normalizeBrokerIdentity(source.broker_id) ??
      normalizeBrokerIdentity(source.broker);
    if (brokerId) {
      return brokerId;
    }
  }

  return null;
};

const getTerminalStateScope = (
  payload: unknown,
  accountId: string,
): TerminalStateScope => {
  const sources = collectTerminalStateScopeSources(payload);

  return {
    accountId,
    login: normalizeAccountIdentity(accountId),
    brokerId: firstBrokerIdentity(sources),
  };
};

const collectAccountIdentities = (
  source: Record<string, unknown>,
): string[] =>
  [
    source.accountId,
    source.account_id,
    source.account,
    source.accountLogin,
    source.account_login,
    source.login,
    source.mt5Login,
    source.mt5_login,
  ]
    .map(normalizeAccountIdentity)
    .filter((value): value is string => Boolean(value));

const collectBrokerIdentities = (
  source: Record<string, unknown>,
): string[] =>
  [
    source.brokerId,
    source.broker_id,
    source.broker,
  ]
    .map(normalizeBrokerIdentity)
    .filter((value): value is string => Boolean(value));

const terminalStateBelongsToScope = (
  source: Record<string, unknown>,
  scope: TerminalStateScope,
): boolean => {
  const expectedAccount =
    scope.login ?? normalizeAccountIdentity(scope.accountId);
  const accountIdentities = collectAccountIdentities(source);
  if (
    expectedAccount &&
    accountIdentities.length > 0 &&
    accountIdentities.some((value) => value !== expectedAccount)
  ) {
    return false;
  }

  const brokerIdentities = collectBrokerIdentities(source);
  if (
    scope.brokerId &&
    brokerIdentities.length > 0 &&
    brokerIdentities.some((value) => value !== scope.brokerId)
  ) {
    return false;
  }

  return true;
};

const POSITION_ARRAY_KEYS = [
  'positions',
  'openPositions',
  'open_positions',
  'activePositions',
  'active_positions',
] as const;

const POSITION_ENVELOPE_KEYS = [
  ...POSITION_ARRAY_KEYS,
  'terminalState',
  'terminal_state',
  'state',
  'snapshot',
  'data',
  'payload',
  'result',
] as const;

const parseJsonObjectString = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const encodeRedisCommand = (parts: string[]): Buffer => {
  const chunks = [`*${parts.length}\r\n`];
  for (const part of parts) {
    const bytes = Buffer.byteLength(part);
    chunks.push(`$${bytes}\r\n${part}\r\n`);
  }
  return Buffer.from(chunks.join(''), 'utf8');
};

const parseRedisReply = (
  buffer: Buffer,
  offset: number,
): { value: unknown; nextOffset: number } | null => {
  if (offset >= buffer.length) {
    return null;
  }

  const type = buffer[offset];
  const lineEnd = buffer.indexOf('\r\n', offset + 1);
  if (lineEnd < 0) {
    return null;
  }

  const line = buffer.toString('utf8', offset + 1, lineEnd);
  const nextLineOffset = lineEnd + 2;

  if (type === 43) {
    return { value: line, nextOffset: nextLineOffset };
  }
  if (type === 45) {
    throw new Error(line || 'Redis command failed.');
  }
  if (type === 58) {
    return { value: Number(line), nextOffset: nextLineOffset };
  }
  if (type === 36) {
    const length = Number(line);
    if (!Number.isInteger(length)) {
      throw new Error('Redis returned an invalid bulk-string length.');
    }
    if (length < 0) {
      return { value: null, nextOffset: nextLineOffset };
    }

    const dataStart = nextLineOffset;
    const dataEnd = dataStart + length;
    const terminatorEnd = dataEnd + 2;
    if (buffer.length < terminatorEnd) {
      return null;
    }
    return {
      value: buffer.toString('utf8', dataStart, dataEnd),
      nextOffset: terminatorEnd,
    };
  }

  throw new Error('Redis returned an unsupported reply type.');
};

const getDirectRedisPositionsUrl = (): string | null => {
  const configured =
    process.env.TRADING_POSITIONS_REDIS_URL ??
    process.env.FOREX_CRM_REDIS_REALTIME_URL ??
    process.env.MT5_REALTIME_REDIS_URL ??
    process.env.REDIS_REALTIME_URL ??
    process.env.REDIS_URL ??
    '';
  const trimmed = configured.trim();
  return trimmed || null;
};

const redisGetString = async (key: string): Promise<string | null> =>
  new Promise((resolve) => {
    let url: URL;
    try {
      const redisUrl = getDirectRedisPositionsUrl();
      if (!redisUrl) {
        resolve(null);
        return;
      }
      url = new URL(redisUrl);
    } catch {
      resolve(null);
      return;
    }

    const host = url.hostname || '127.0.0.1';
    const port = Number(url.port || '6379');
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      resolve(null);
      return;
    }

    const commands: string[][] = [];
    const password = decodeURIComponent(url.password || '');
    const username = decodeURIComponent(url.username || '');
    if (password) {
      commands.push(username ? ['AUTH', username, password] : ['AUTH', password]);
    }

    const db = url.pathname.replace(/^\//, '').trim();
    if (db && /^\d+$/.test(db)) {
      commands.push(['SELECT', db]);
    }
    commands.push(['GET', key]);

    const socket = createConnection({ host, port });
    let settled = false;
    let data = Buffer.alloc(0);

    const finish = (value: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(DIRECT_REDIS_POSITIONS_TIMEOUT_MS, () => finish(null));
    socket.on('error', () => finish(null));
    socket.on('connect', () => {
      socket.write(Buffer.concat(commands.map(encodeRedisCommand)));
    });
    socket.on('data', (chunk: Buffer) => {
      data = Buffer.concat([data, chunk]);
      try {
        let offset = 0;
        let lastValue: unknown = null;
        for (let index = 0; index < commands.length; index += 1) {
          const reply = parseRedisReply(data, offset);
          if (!reply) {
            return;
          }
          lastValue = reply.value;
          offset = reply.nextOffset;
        }
        finish(typeof lastValue === 'string' ? lastValue : null);
      } catch {
        finish(null);
      }
    });
  });

const filterPositionsForScope = (
  positions: unknown[],
  scope: TerminalStateScope,
): unknown[] =>
  positions.filter((position) => {
    if (!isRecord(position)) {
      return true;
    }

    const hasScopedIdentity =
      collectAccountIdentities(position).length > 0 ||
      collectBrokerIdentities(position).length > 0;

    return !hasScopedIdentity || terminalStateBelongsToScope(position, scope);
  });

const hasPositionScopeMismatch = (
  positions: unknown[],
  scope: TerminalStateScope,
): boolean =>
  positions.some((position) => {
    if (!isRecord(position)) {
      return false;
    }

    const hasScopedIdentity =
      collectAccountIdentities(position).length > 0 ||
      collectBrokerIdentities(position).length > 0;

    return hasScopedIdentity && !terminalStateBelongsToScope(position, scope);
  });

const extractTerminalStatePositions = (
  payload: unknown,
  scope: TerminalStateScope,
  depth = 0,
): unknown[] | null => {
  if (!isRecord(payload) || depth > 5) {
    return null;
  }

  if (!terminalStateBelongsToScope(payload, scope)) {
    return null;
  }

  for (const key of POSITION_ARRAY_KEYS) {
    const candidate = payload[key];
    if (Array.isArray(candidate)) {
      return filterPositionsForScope(candidate, scope);
    }
  }

  for (const key of POSITION_ENVELOPE_KEYS) {
    const candidate = parseJsonObjectString(payload[key]) ?? payload[key];
    if (!isRecord(candidate)) {
      continue;
    }

    const positions = extractTerminalStatePositions(candidate, scope, depth + 1);
    if (positions) {
      return positions;
    }
  }

  return null;
};

const buildBackendTerminalStatePath = (login: string): string =>
  `/accounts/${encodeURIComponent(login)}/terminal-state`;

const getAccountCachePositionsBaseUrl = (): string => {
  const configured =
    process.env.TRADING_POSITIONS_ACCOUNT_CACHE_BASE_URL ??
    process.env.RUST_GATEWAY_HTTP_URL ??
    process.env.RUST_GATEWAY_PUBLIC_API_BASE_URL ??
    DEFAULT_ACCOUNT_CACHE_POSITIONS_BASE_URL;
  const trimmed = configured.trim().replace(/\/+$/, '');

  return trimmed || DEFAULT_ACCOUNT_CACHE_POSITIONS_BASE_URL;
};

const getRustGatewayCachedPositionsByLogin = async (
  login: string,
  brokerId: string | null,
): Promise<unknown[] | null> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    ACCOUNT_CACHE_POSITIONS_TIMEOUT_MS,
  );

  try {
    const url = new URL(
      `/api/cache/positions/${encodeURIComponent(login)}`,
      getAccountCachePositionsBaseUrl(),
    );
    if (brokerId) {
      url.searchParams.set('brokerId', brokerId);
      url.searchParams.set('broker_id', brokerId);
    }
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!isRecord(payload)) {
      return null;
    }

    const payloadAccountIdentities = collectAccountIdentities(payload);
    if (
      payloadAccountIdentities.length > 0 &&
      payloadAccountIdentities.some((identity) => identity !== login)
    ) {
      return null;
    }

    const positions = payload.positions;
    if (!Array.isArray(positions)) {
      return null;
    }

    const scope = {
      accountId: `mt5-${login}`,
      login,
      brokerId,
    };

    if (brokerId) {
      const brokerIdentities = [
        ...collectBrokerIdentities(payload),
        ...positions.flatMap((position) =>
          isRecord(position) ? collectBrokerIdentities(position) : [],
        ),
      ];
      if (
        brokerIdentities.length > 0 &&
        brokerIdentities.some((identity) => identity !== brokerId)
      ) {
        return null;
      }
    }

    return filterPositionsForScope(positions, scope);
  } catch (error) {
    console.warn(
      'Rust gateway positions cache lookup failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const getDirectRedisCachedPositionsByLogin = async (
  login: string,
  brokerId: string | null,
): Promise<unknown[] | null> => {
  const raw = await redisGetString(`positions:user:${login}`);
  if (raw === null) {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  const scope = {
    accountId: `mt5-${login}`,
    login,
    brokerId,
  };

  const positions = Array.isArray(payload)
    ? payload
    : extractTerminalStatePositions(payload, scope);
  if (!Array.isArray(positions)) {
    return null;
  }

  return filterPositionsForScope(positions, scope);
};

const getAccountScopedCachedTerminalStatePositions = async (
  request: NextRequest,
  accountId: string,
): Promise<unknown[] | null> => {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) {
      return null;
    }

    const login = await resolveOwnedMt5Login(auth.user, accountId);
    if (!login) {
      return null;
    }

    const brokerId = normalizeBrokerIdentity(auth.user.brokerId);
    const rustGatewayPositions = await getRustGatewayCachedPositionsByLogin(
      login,
      brokerId,
    );
    if (rustGatewayPositions !== null) {
      return rustGatewayPositions;
    }

    const redisPositions = await getDirectRedisCachedPositionsByLogin(
      login,
      brokerId,
    );
    if (redisPositions !== null) {
      return redisPositions;
    }

    const data = await requestAccountsBackend(buildBackendTerminalStatePath(login), {
      query: withBrokerContext(
        {
          userId: auth.user.id,
          user_id: auth.user.id,
          accountId,
          account_id: accountId,
        },
        auth.user.brokerId,
      ),
      timeoutMs: ACCOUNT_CACHE_POSITIONS_TIMEOUT_MS,
    });

    return extractTerminalStatePositions(
      {
        ok: true,
        accountId,
        account_id: accountId,
        login,
        ...(auth.user.brokerId
          ? { brokerId: auth.user.brokerId, broker_id: auth.user.brokerId }
          : {}),
        data,
      },
      {
        accountId,
        login,
        brokerId,
      },
    );
  } catch (error) {
    console.warn(
      'Account-scoped terminal-state positions cache lookup failed:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
};

const getCachedTerminalStatePositions = async (
  request: NextRequest,
  accountId: string,
): Promise<{ positions: unknown[] | null; timedOut: boolean }> => {
  const accountScopedCachePromise =
    getAccountScopedCachedTerminalStatePositions(request, accountId)
      .catch(() => null);
  const waitForAccountScopedCache = async (): Promise<unknown[] | null> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        accountScopedCachePromise,
        new Promise<null>((resolve) => {
          timeoutId = setTimeout(resolve, ACCOUNT_CACHE_POSITIONS_TIMEOUT_MS, null);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };

  const stateUrl = new URL(
    `/api/private/accounts/${encodeURIComponent(accountId)}/terminal-state`,
    request.url,
  );

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new TerminalStatePositionsTimeoutError(TERMINAL_STATE_POSITIONS_TIMEOUT_MS));
    }, TERMINAL_STATE_POSITIONS_TIMEOUT_MS);
  });

  const fetchPromise = (async () => {
    const response = await fetch(stateUrl, {
      headers: requestAuthHeaders(request),
      cache: 'no-store',
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as unknown;

    return { response, payload };
  })();

  try {
    const { response, payload } = await Promise.race([fetchPromise, timeoutPromise]);
    if (!response.ok) {
      return {
        positions: await waitForAccountScopedCache(),
        timedOut: false,
      };
    }

    const positions = extractTerminalStatePositions(
      payload,
      getTerminalStateScope(payload, accountId),
    );

    if (positions !== null) {
      return {
        positions,
        timedOut: false,
      };
    }

    return {
      positions: await waitForAccountScopedCache(),
      timedOut: false,
    };
  } catch (error) {
    if (controller.signal.aborted || isTerminalStatePositionsTimeoutError(error)) {
      return {
        positions: await waitForAccountScopedCache(),
        timedOut: true,
      };
    }

    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const buildCachedPositionsResponse = (
  accountId: string,
  positions: unknown[],
  warning: string,
) =>
  tradingApiJson({
    success: true,
    accountId,
    positions,
    data: {
      positions,
      source: 'terminal_state_snapshot',
      stale: true,
      pending: true,
    },
    degraded: true,
    stale: true,
    pending: true,
    warning,
  });

const buildCachedPositionsMissResponse = (
  accountId: string,
  error = 'Cached terminal-state positions are not available yet.',
) =>
  tradingApiJson({
    success: true,
    accountId,
    positions: [],
    data: {
      positions: [],
      source: 'terminal_state_pending',
      stale: true,
      pending: true,
      cacheMiss: true,
    },
    degraded: true,
    stale: true,
    pending: true,
    cacheMiss: true,
    warning: error,
    code: 'TERMINAL_STATE_POSITIONS_PENDING',
  });

const shouldForceLiveRefresh = (request: NextRequest): boolean => {
  const { searchParams } = new URL(request.url);
  return ['force', 'refresh', 'live', 'fresh', 'reconcile'].some((key) => {
    const value = searchParams.get(key)?.trim().toLowerCase();
    return value === '1' || value === 'true';
  });
};

const isTerminalActionRefreshInterrupted = (error: unknown): boolean => {
  if (error instanceof TerminalBridgeError) {
    const code = error.code.trim().toLowerCase();
    return [
      'TERMINAL_SESSION_TIMEOUT',
      'TERMINAL_SESSION_RESOLVE_TIMEOUT',
      'TERMINAL_SESSION_FAILED',
      'TERMINAL_WS_CLOSED',
      'TERMINAL_WS_CONNECT_FAILED',
      'TERMINAL_WS_CONNECTION_FAILED',
      'TERMINAL_WS_TIMEOUT',
      'MT5_MANAGER_LANE_BUSY',
      'MT5_MANAGER_QUERY_DEFERRED',
      'MT5_MANAGER_REQUEST_FAILED',
      'MT5_POSITIONS_SDK_CALL_STALE',
      'REQUEST_POSITIONS_SNAPSHOT_PENDING',
      'SESSION_QUERY_DEFERRED',
    ].some((candidate) => candidate.toLowerCase() === code) &&
      ![401, 403, 423].includes(error.status);
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  return /timeout|timed out|connection interrupted|connection closed|websocket closed|websocket disconnected|transport closed|terminal session.*failed|terminal session.*timeout|mt5_manager_query_deferred|mt5_positions_sdk_call_stale|mt5 manager.*busy|request_positions.*pending|request_positions.*deferred/i.test(message);
};

export async function GET(request: NextRequest) {
  try {
    const accountId = requireTradingAccountId(request);
    const forceLiveRefresh = shouldForceLiveRefresh(request);

    if (!forceLiveRefresh) {
      const cachedPositions = await getCachedTerminalStatePositions(request, accountId);
      if (cachedPositions.positions !== null) {
        return buildCachedPositionsResponse(
          accountId,
          cachedPositions.positions,
          'Returned cached terminal-state positions while a live refresh is pending.',
        );
      }

      return buildCachedPositionsMissResponse(
        accountId,
        cachedPositions.timedOut
          ? 'Terminal-state positions lookup timed out before cached positions were available.'
          : undefined,
      );
    }

    const auth = await authenticateRequest(request);
    if (!auth) {
      throw new TerminalBridgeError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const ownedLogin = await resolveOwnedMt5Login(auth.user, accountId);
    if (!ownedLogin) {
      throw new TerminalBridgeError(
        'Unable to resolve an owned MT5 login for this account.',
        404,
        'ACCOUNT_NOT_FOUND',
      );
    }
    const liveScope: TerminalStateScope = {
      accountId,
      login: ownedLogin,
      brokerId: normalizeBrokerIdentity(auth.user.brokerId),
    };

    const payload = await requestTerminalAction<{ positions?: unknown[] }>(
      request,
      accountId,
      'request_positions',
      buildLiveTradingStateRequestPayload({
        accountId: liveScope.accountId,
        login: ownedLogin,
        brokerId: liveScope.brokerId,
      }),
    );
    if (isRecord(payload) && !terminalStateBelongsToScope(payload, liveScope)) {
      throw new TerminalBridgeError(
        'request_positions returned a snapshot for a different account.',
        409,
        'POSITIONS_ACCOUNT_SCOPE_MISMATCH',
        payload,
      );
    }
    const positions = Array.isArray(payload.positions) ? payload.positions : [];
    if (hasPositionScopeMismatch(positions, liveScope)) {
      throw new TerminalBridgeError(
        'request_positions returned position rows for a different account.',
        409,
        'POSITIONS_ACCOUNT_SCOPE_MISMATCH',
        payload,
      );
    }

    return tradingApiJson({
      success: true,
      accountId,
      positions: filterPositionsForScope(positions, liveScope),
      data: payload,
    });
  } catch (error) {
    console.error('request_positions error caught:', error);
    if (isTerminalActionRefreshInterrupted(error)) {
      try {
        const accountId = requireTradingAccountId(request);
        const cachedPositions = await getCachedTerminalStatePositions(request, accountId);

        if (cachedPositions.positions !== null) {
          return buildCachedPositionsResponse(
            accountId,
            cachedPositions.positions,
            `request_positions refresh was interrupted: ${error instanceof Error ? error.message : JSON.stringify(error)}`,
          );
        }

        return buildCachedPositionsMissResponse(
          accountId,
          cachedPositions.timedOut
            ? 'request_positions refresh was interrupted and terminal-state positions lookup timed out.'
            : 'request_positions refresh was interrupted and no cached positions are available.',
        );
      } catch (fallbackError) {
        console.error('Positions fallback error:', fallbackError);
      }
    }

    console.error('Positions GET error:', error);
    return bridgeErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticket = parseInt(searchParams.get('ticket') || '', 10);
    const volume = searchParams.get('volume')
      ? parseFloat(searchParams.get('volume')!)
      : undefined;

    if (isNaN(ticket)) {
      return tradingApiJson(
        {
          success: false,
          error: 'Invalid ticket',
          code: 'INVALID_TICKET',
        },
        { status: 400 }
      );
    }

    if (volume !== undefined && (isNaN(volume) || volume <= 0)) {
      return tradingApiJson(
        {
          success: false,
          error: 'Invalid volume',
          code: 'INVALID_VOLUME',
        },
        { status: 400 }
      );
    }

    const accountId = requireTradingAccountId(request);
    const auth = await authenticateRequest(request);
    if (!auth) {
      throw new TerminalBridgeError('Unauthorized', 401, 'UNAUTHORIZED');
    }

    const ownedLogin = await resolveOwnedMt5Login(auth.user, accountId);
    if (!ownedLogin) {
      throw new TerminalBridgeError(
        'Unable to resolve an owned MT5 login for this account.',
        404,
        'ACCOUNT_NOT_FOUND',
      );
    }

    const result = await requestTerminalAction(
      request,
      accountId,
      'close_position',
      buildLiveTradingStateRequestPayload(
        {
          accountId,
          login: ownedLogin,
          brokerId: normalizeBrokerIdentity(auth.user.brokerId),
        },
        { ticket, ...(volume !== undefined ? { volume } : {}) },
      ),
    );

    return tradingApiJson({
      success: true,
      accountId,
      result,
    });
  } catch (error) {
    console.error('Positions DELETE error:', error);
    return bridgeErrorResponse(error);
  }
}
