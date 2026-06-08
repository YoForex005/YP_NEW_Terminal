/**
 * Trade History API
 * GET /api/trading/history - Get trade history
 */

import { NextRequest } from 'next/server';

import {
  TerminalBridgeError,
  requestTerminalAction,
  requireTradingAccountId,
} from '@/lib/server/terminal-ws-bridge';
import {
  buildLiveTradingStateRequestPayload,
  extractPayloadArray,
  hasTradingScopeRowMismatch,
  payloadBelongsToTradingScope,
  resolveTradingRouteAccountScope,
  tradingApiJson,
} from '@/lib/server/trading-api-route';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'nodejs';

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limitParam = searchParams.get('limit') ?? searchParams.get('maxRows');

    if (from && Number.isNaN(Date.parse(from))) {
      return tradingApiJson(
        {
          success: false,
          error: 'Invalid from date parameter',
          code: 'INVALID_FROM_DATE',
        },
        { status: 400 }
      );
    }

    if (to && Number.isNaN(Date.parse(to))) {
      return tradingApiJson(
        {
          success: false,
          error: 'Invalid to date parameter',
          code: 'INVALID_TO_DATE',
        },
        { status: 400 }
      );
    }

    if (from && to && Date.parse(from) > Date.parse(to)) {
      return tradingApiJson(
        {
          success: false,
          error: 'from date must be earlier than or equal to to date',
          code: 'INVALID_DATE_RANGE',
        },
        { status: 400 }
      );
    }

    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
      return tradingApiJson(
        {
          success: false,
          error: 'limit/maxRows must be a positive integer when provided',
          code: 'INVALID_LIMIT',
        },
        { status: 400 }
      );
    }

    const accountId = requireTradingAccountId(request);
    const scope = await resolveTradingRouteAccountScope(request, accountId);
    const now = Date.now();
    const fromUnixMs = from ? Date.parse(from) : now - 30 * 24 * 60 * 60 * 1000;
    const toUnixMs = to ? Date.parse(to) : now;
    const payload = await requestTerminalAction<{ history?: unknown[] }>(
      request,
      accountId,
      'request_history',
      buildLiveTradingStateRequestPayload(scope, {
        fromUnixMs,
        toUnixMs,
        ...(limit !== undefined ? { limit, maxRows: limit } : {}),
      }),
    );
    if (!payloadBelongsToTradingScope(payload, scope)) {
      throw new TerminalBridgeError(
        'request_history returned a snapshot for a different account.',
        409,
        'HISTORY_ACCOUNT_SCOPE_MISMATCH',
        payload,
      );
    }
    const history = extractPayloadArray(payload, ['history', 'deals', 'trades']);
    if (hasTradingScopeRowMismatch(history, scope)) {
      throw new TerminalBridgeError(
        'request_history returned deal rows for a different account.',
        409,
        'HISTORY_ACCOUNT_SCOPE_MISMATCH',
        payload,
      );
    }
    
    // Dump for debugging
    try {
      require('fs').writeFileSync('C:/Users/aitra/Desktop/CRM-BACKEND-C++/Forex-CRM/history-dump.json', JSON.stringify(history, null, 2));
    } catch(e) {}

    return tradingApiJson({
      success: true,
      accountId,
      fromUnixMs,
      toUnixMs,
      ...(limit !== undefined ? { limit } : {}),
      history,
      data: payload,
    });
  } catch (error) {
    console.error('History error:', error);
    return bridgeErrorResponse(error);
  }
}
