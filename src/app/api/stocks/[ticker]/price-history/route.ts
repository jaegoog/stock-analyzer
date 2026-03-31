import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from '@/lib/yahoo-finance'
import type { PriceHistory, PriceHistoryPoint } from '@/types'

const PERIOD_DAYS: Record<string, number> = {
  '1y': 365,
  '2y': 730,
  '5y': 1825,
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params
  const symbol = decodeURIComponent(ticker)
  const period = (req.nextUrl.searchParams.get('period') ?? '1y') as '1y' | '2y' | '5y'

  const days = PERIOD_DAYS[period] ?? PERIOD_DAYS['1y']
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  try {
    const raw = await yahooFinance.historical(
      symbol,
      { period1: startDate, interval: '1mo' },
      { validateResult: false }
    ) as { date: Date; close: number }[]

    if (!raw || raw.length === 0) {
      return NextResponse.json({ error: '주가 데이터를 불러올 수 없습니다.' }, { status: 404 })
    }

    const sorted = [...raw].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const baseClose = sorted[0].close

    const points: PriceHistoryPoint[] = sorted.map((r) => ({
      date: new Date(r.date).toISOString().split('T')[0],
      close: r.close,
      cumulativeReturn: baseClose > 0 ? ((r.close - baseClose) / baseClose) * 100 : 0,
    }))

    const result: PriceHistory = { ticker: symbol, period, points }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[price-history]', err)
    return NextResponse.json({ error: '주가 데이터 조회 실패' }, { status: 500 })
  }
}
