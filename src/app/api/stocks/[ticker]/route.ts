import { NextRequest, NextResponse } from 'next/server'
import { detectMarket, normalizeKRTicker } from '@/lib/utils'
import { getPriceProvider } from '@/providers/router'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params
  const symbol = normalizeKRTicker(decodeURIComponent(ticker))
  const market = detectMarket(symbol)

  try {
    const provider = await getPriceProvider(market)
    if (!provider) return NextResponse.json({ error: 'No price provider configured' }, { status: 503 })

    const result = await provider.getQuote(symbol, market)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[quote]', error)
    return NextResponse.json({ error: 'Failed to fetch quote' }, { status: 500 })
  }
}
