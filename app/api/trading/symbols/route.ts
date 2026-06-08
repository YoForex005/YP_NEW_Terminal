/**
 * Symbols API
 * GET /api/trading/symbols - Get available trading symbols
 */

import { NextRequest, NextResponse } from 'next/server';

import {
  TerminalBridgeError,
  requireTradingAccountId,
} from '@/lib/server/terminal-ws-bridge';
import {
  extractSymbolCatalog,
  requestSymbolCatalogWithFallback,
} from './fallback';

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
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    if (category !== null && !category.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'category cannot be empty',
          code: 'INVALID_CATEGORY',
        },
        { status: 400 }
      );
    }

    const accountId = requireTradingAccountId(request);
    const catalog = await requestSymbolCatalogWithFallback(request, accountId);
    const payload = catalog.payload;

    const symbols = extractSymbolCatalog(payload);

    return NextResponse.json({
      success: true,
      accountId,
      category: category?.trim() || undefined,
      symbols,
      data: payload,
      degraded: catalog.degraded,
      fallbackSource: catalog.fallbackSource,
      fallbackReason: catalog.fallbackReason,
      refreshScheduled: catalog.refreshScheduled,
      warnings: catalog.warnings,
    });
  } catch (error) {
    console.error('Symbols error:', error);
    return bridgeErrorResponse(error);
  }
}
