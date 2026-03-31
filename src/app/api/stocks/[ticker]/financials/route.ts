import { NextRequest, NextResponse } from 'next/server'
import { detectMarket, normalizeKRTicker } from '@/lib/utils'
import { getFinancialsProvider } from '@/providers/router'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params
  const symbol = normalizeKRTicker(decodeURIComponent(ticker))
  const market = detectMarket(symbol)

  try {
    const provider = await getFinancialsProvider(market)
    if (!provider) return NextResponse.json({ error: 'No financials provider configured' }, { status: 503 })

    const result = await provider.getFinancials(symbol, market)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[financials]', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch financials'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
