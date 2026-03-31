import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from '@/lib/yahoo-finance'
import { detectMarket, normalizeKRTicker } from '@/lib/utils'
import type { StockQuote } from '@/types'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params
  const symbol = normalizeKRTicker(decodeURIComponent(ticker))

  try {
    const quote = await yahooFinance.quote(symbol, {}, { validateResult: false }) as Record<string, unknown>

    const result: StockQuote = {
      ticker: symbol,
      name: (quote.longName ?? quote.shortName ?? symbol) as string,
      price: (quote.regularMarketPrice as number) ?? 0,
      change: (quote.regularMarketChange as number) ?? 0,
      changePercent: (quote.regularMarketChangePercent as number) ?? 0,
      marketCap: (quote.marketCap as number) ?? null,
      pe: (quote.trailingPE as number) ?? null,
      high52: (quote.fiftyTwoWeekHigh as number) ?? null,
      low52: (quote.fiftyTwoWeekLow as number) ?? null,
      volume: (quote.regularMarketVolume as number) ?? null,
      sector: (quote.sector as string) ?? null,
      industry: (quote.industry as string) ?? null,
      currency: (quote.currency as string) ?? 'USD',
      exchange: (quote.fullExchangeName as string) ?? (quote.exchange as string) ?? '',
      market: detectMarket(symbol),
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[quote]', error)
    return NextResponse.json({ error: 'Failed to fetch quote' }, { status: 500 })
  }
}
