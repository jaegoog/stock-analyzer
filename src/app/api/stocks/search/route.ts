import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from '@/lib/yahoo-finance'
import { detectMarket } from '@/lib/utils'
import type { StockSearchResult } from '@/types'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q || q.trim().length < 1) {
    return NextResponse.json({ results: [] })
  }

  try {
    const raw = await yahooFinance.search(q.trim(), {}, { validateResult: false }) as Record<string, unknown>
    const results: StockSearchResult[] = ((raw.quotes as Record<string, unknown>[] | undefined) ?? [])
      .filter((item: Record<string, unknown>) => item.symbol && (item.quoteType === 'EQUITY' || item.quoteType === 'ETF'))
      .slice(0, 10)
      .map((item: Record<string, unknown>) => {
        const ticker = String(item.symbol ?? '')
        return {
          ticker,
          name: String(item.shortname ?? item.longname ?? ticker),
          exchange: String(item.exchange ?? ''),
          type: String(item.quoteType ?? 'EQUITY'),
          market: detectMarket(ticker),
        }
      })

    return NextResponse.json({ results })
  } catch (error) {
    console.error('[search]', error)
    return NextResponse.json({ results: [], error: 'Search failed' }, { status: 500 })
  }
}
