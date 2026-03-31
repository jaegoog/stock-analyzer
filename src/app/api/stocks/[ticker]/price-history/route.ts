import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from '@/lib/yahoo-finance'
import { normalizeKRTicker } from '@/lib/utils'
import type { PriceHistory, PriceHistoryInterval, PriceHistoryPoint } from '@/types'

const PERIOD_DAYS: Record<string, number> = {
  '1y': 365,
  '2y': 730,
  '5y': 1825,
}

const ALLOWED_INTERVALS: PriceHistoryInterval[] = ['1d', '1wk', '1mo']

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params
  const symbol = normalizeKRTicker(decodeURIComponent(ticker))
  const period = (req.nextUrl.searchParams.get('period') ?? '1y') as '1y' | '2y' | '5y'
  const intervalParam = req.nextUrl.searchParams.get('interval') ?? '1mo'
  const interval = ALLOWED_INTERVALS.includes(intervalParam as PriceHistoryInterval)
    ? (intervalParam as PriceHistoryInterval)
    : null

  if (!interval) {
    return NextResponse.json(
      { error: 'interval은 1d, 1wk, 1mo 중 하나여야 합니다.' },
      { status: 400 }
    )
  }

  const days = PERIOD_DAYS[period] ?? PERIOD_DAYS['1y']
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const endDate = new Date()

  try {
    // historical()는 장중 등 일부 필드만 null인 행에서 라이브러리가 예외를 던짐.
    // chart() + 유효 종가만 사용해 동일 구간·간격을 맞춘다.
    const chartResult = await yahooFinance.chart(
      symbol,
      { period1: startDate, period2: endDate, interval },
      { validateResult: false }
    )
    const quotes = (chartResult as { quotes?: { date: Date; close: number | null }[] }).quotes ?? []
    const raw = quotes.filter(
      (q): q is { date: Date; close: number } =>
        q.close != null && Number.isFinite(q.close)
    )

    if (raw.length === 0) {
      return NextResponse.json({ error: '주가 데이터를 불러올 수 없습니다.' }, { status: 404 })
    }

    const sorted = [...raw].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const baseClose = sorted[0].close

    const points: PriceHistoryPoint[] = sorted.map((r) => ({
      date: new Date(r.date).toISOString().split('T')[0],
      close: r.close,
      cumulativeReturn: baseClose > 0 ? ((r.close - baseClose) / baseClose) * 100 : 0,
    }))

    const result: PriceHistory = { ticker: symbol, period, interval, points }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[price-history]', err)
    return NextResponse.json({ error: '주가 데이터 조회 실패' }, { status: 500 })
  }
}
