/**
 * Orders API
 * GET /api/trading/orders - Get pending orders
 * POST /api/trading/orders - Place new order
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
    const accountId = requireTradingAccountId(request);
    const scope = await resolveTradingRouteAccountScope(request, accountId);
    const payload = await requestTerminalAction<{ orders?: unknown[] }>(
      request,
      accountId,
      'request_orders',
      buildLiveTradingStateRequestPayload(scope),
    );
    if (!payloadBelongsToTradingScope(payload, scope)) {
      throw new TerminalBridgeError(
        'request_orders returned a snapshot for a different account.',
        409,
        'ORDERS_ACCOUNT_SCOPE_MISMATCH',
        payload,
      );
    }
    const orders = extractPayloadArray(payload, ['orders']);
    if (hasTradingScopeRowMismatch(orders, scope)) {
      throw new TerminalBridgeError(
        'request_orders returned order rows for a different account.',
        409,
        'ORDERS_ACCOUNT_SCOPE_MISMATCH',
        payload,
      );
    }

    return tradingApiJson({
      success: true,
      accountId,
      orders,
      data: payload,
    });
  } catch (error) {
    console.error('Orders GET error:', error);
    return bridgeErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return tradingApiJson(
        {
          success: false,
          error: 'Invalid JSON request body',
          code: 'INVALID_REQUEST_BODY',
        },
        { status: 400 }
      );
    }

    const {
      symbol,
      type,
      volume,
      price,
      sl,
      tp,
      deviation,
      fillingMode,
      comment,
      magic,
      expiration,
      typeTime,
    } = body;

    // Validate required fields
    if (!symbol || !type || !volume) {
      return tradingApiJson(
        {
          success: false,
          error: 'Missing required fields',
          code: 'MISSING_REQUIRED_FIELDS',
        },
        { status: 400 }
      );
    }

    if (typeof volume !== 'number' || volume <= 0) {
      return tradingApiJson(
        {
          success: false,
          error: 'Volume must be a positive number',
          code: 'INVALID_VOLUME',
        },
        { status: 400 }
      );
    }

    if (price !== undefined && (typeof price !== 'number' || price <= 0)) {
      return tradingApiJson(
        {
          success: false,
          error: 'Price must be a positive number when provided',
          code: 'INVALID_PRICE',
        },
        { status: 400 }
      );
    }

    if (sl !== undefined && typeof sl !== 'number') {
      return tradingApiJson(
        {
          success: false,
          error: 'sl must be a number when provided',
          code: 'INVALID_SL',
        },
        { status: 400 }
      );
    }

    if (tp !== undefined && typeof tp !== 'number') {
      return tradingApiJson(
        {
          success: false,
          error: 'tp must be a number when provided',
          code: 'INVALID_TP',
        },
        { status: 400 }
      );
    }

    const accountId = requireTradingAccountId(request);
    const scope = await resolveTradingRouteAccountScope(request, accountId);
    const isMarketOrder = type === 'buy' || type === 'sell';
    const result = await requestTerminalAction(
      request,
      accountId,
      'place_order',
      buildLiveTradingStateRequestPayload(scope, {
        symbol,
        type,
        volume,
        ...(price !== undefined && !isMarketOrder ? { price } : {}),
        ...(sl !== undefined ? { sl } : {}),
        ...(tp !== undefined ? { tp } : {}),
        ...(deviation !== undefined ? { deviation } : {}),
        ...(fillingMode !== undefined ? { fillingMode } : {}),
        ...(comment !== undefined ? { comment } : {}),
        ...(magic !== undefined ? { magic } : {}),
        ...(expiration !== undefined ? { expiration } : {}),
        ...(typeTime !== undefined ? { typeTime } : {}),
      }),
    );

    return tradingApiJson({
      success: true,
      accountId,
      result,
    });
  } catch (error) {
    console.error('Orders POST error:', error);
    return bridgeErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return tradingApiJson(
        {
          success: false,
          error: 'Invalid JSON request body',
          code: 'INVALID_REQUEST_BODY',
        },
        { status: 400 }
      );
    }

    const { ticket, price, sl, tp } = body;
    if (typeof ticket !== 'number') {
      return tradingApiJson(
        {
          success: false,
          error: 'ticket must be a number',
          code: 'INVALID_TICKET',
        },
        { status: 400 }
      );
    }

    if (price !== undefined && (typeof price !== 'number' || price <= 0)) {
      return tradingApiJson(
        {
          success: false,
          error: 'Price must be a positive number when provided',
          code: 'INVALID_PRICE',
        },
        { status: 400 }
      );
    }

    if (sl !== undefined && typeof sl !== 'number') {
      return tradingApiJson(
        {
          success: false,
          error: 'sl must be a number when provided',
          code: 'INVALID_SL',
        },
        { status: 400 }
      );
    }

    if (tp !== undefined && typeof tp !== 'number') {
      return tradingApiJson(
        {
          success: false,
          error: 'tp must be a number when provided',
          code: 'INVALID_TP',
        },
        { status: 400 }
      );
    }

    if (price === undefined && sl === undefined && tp === undefined) {
      return tradingApiJson(
        {
          success: false,
          error: 'At least one of price, sl, or tp must be provided',
          code: 'MISSING_UPDATE_FIELDS',
        },
        { status: 400 }
      );
    }

    const accountId = requireTradingAccountId(request);
    const scope = await resolveTradingRouteAccountScope(request, accountId);
    const result = await requestTerminalAction(
      request,
      accountId,
      'modify_order',
      buildLiveTradingStateRequestPayload(scope, {
        ticket,
        ...(price !== undefined ? { price } : {}),
        ...(sl !== undefined ? { sl } : {}),
        ...(tp !== undefined ? { tp } : {}),
      }),
    );

    return tradingApiJson({
      success: true,
      accountId,
      result,
    });
  } catch (error) {
    console.error('Orders PATCH error:', error);
    return bridgeErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticket = parseInt(searchParams.get('ticket') || '', 10);

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

    const accountId = requireTradingAccountId(request);
    const scope = await resolveTradingRouteAccountScope(request, accountId);
    const result = await requestTerminalAction(
      request,
      accountId,
      'cancel_order',
      buildLiveTradingStateRequestPayload(scope, { ticket }),
    );

    return tradingApiJson({
      success: true,
      accountId,
      result,
    });
  } catch (error) {
    console.error('Orders DELETE error:', error);
    return bridgeErrorResponse(error);
  }
}
