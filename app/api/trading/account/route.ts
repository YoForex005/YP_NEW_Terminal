/**
 * Account Info API
 * GET /api/trading/account - Get trading account information
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  TerminalBridgeError,
  requestTerminalAction,
  requireTradingAccountId,
} from '@/lib/server/terminal-ws-bridge';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const bridgeErrorResponse = (error: unknown) => {
  if (error instanceof TerminalBridgeError) {
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        code: error.code,
        details: error.details,
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
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
    const account = await requestTerminalAction(
      request,
      accountId,
      'request_account_info',
      {},
    );

    return NextResponse.json({
      success: true,
      accountId,
      account,
    });
  } catch (error) {
    console.error('Trading account GET error:', error);
    return bridgeErrorResponse(error);
  }
}
