import { NextRequest, NextResponse } from 'next/server'
import { detectMarket, normalizeKRTicker } from '@/lib/utils'
import { getNewsProvider } from '@/providers/router'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params
  const symbol = normalizeKRTicker(decodeURIComponent(ticker))
  const market = detectMarket(symbol)

  try {
    const provider = await getNewsProvider(market)
    if (!provider) return NextResponse.json({ news: [] }, { status: 200 })

    const news = await provider.getNews(symbol, market)
    return NextResponse.json({ news })
  } catch (error) {
    console.error('[news]', error)
    return NextResponse.json({ news: [], error: 'Failed to fetch news' }, { status: 500 })
  }
}
