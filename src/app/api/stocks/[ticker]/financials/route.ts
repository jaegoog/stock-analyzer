import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from '@/lib/yahoo-finance'
import { detectMarket, normalizeKRTicker } from '@/lib/utils'
import type { FinancialStatement, FinancialData } from '@/types'

const INCOME_FIELDS = [
  { field: 'totalRevenue', label: '매출액' },
  { field: 'grossProfit', label: '매출총이익' },
  { field: 'operatingExpense', label: '영업비용' },
  { field: 'totalOperatingIncomeAsReported', label: '영업이익' },
  { field: 'pretaxIncome', label: '세전이익' },
  { field: 'netIncome', label: '당기순이익' },
  { field: 'ebitda', label: 'EBITDA' },
]

const BALANCE_FIELDS = [
  { field: 'totalAssets', label: '총자산' },
  { field: 'totalLiabilitiesNetMinorityInterest', label: '총부채' },
  { field: 'totalEquityGrossMinorityInterest', label: '자기자본' },
  { field: 'cashAndCashEquivalents', label: '현금및현금성자산' },
  { field: 'currentAssets', label: '유동자산' },
  { field: 'currentLiabilities', label: '유동부채' },
  { field: 'longTermDebt', label: '장기부채' },
]

const CASHFLOW_FIELDS = [
  { field: 'operatingCashFlow', label: '영업활동현금흐름' },
  { field: 'investingCashFlow', label: '투자활동현금흐름' },
  { field: 'financingCashFlow', label: '재무활동현금흐름' },
  { field: 'capitalExpenditure', label: '설비투자(CAPEX)' },
  { field: 'freeCashFlow', label: '잉여현금흐름(FCF)' },
]

type TimeSeriesRow = Record<string, unknown> & { date?: Date }

function buildStatement(
  rows: TimeSeriesRow[],
  fields: { field: string; label: string }[],
  type: 'income' | 'balance' | 'cashflow',
  period: 'annual' | 'quarterly'
): FinancialStatement {
  const sorted = [...rows].sort((a, b) => {
    const da = a.date ? new Date(a.date as Date).getTime() : 0
    const db = b.date ? new Date(b.date as Date).getTime() : 0
    return da - db
  })

  const years = sorted.map((r) =>
    r.date ? new Date(r.date as Date).getFullYear().toString() : 'N/A'
  )

  return {
    type,
    period,
    years,
    rows: fields.map(({ field, label }) => ({
      field,
      label,
      values: sorted.map((r) => {
        const v = r[field]
        if (v === null || v === undefined) return null
        const n = Number(v)
        return isNaN(n) ? null : n
      }),
      unit: 'USD' as const,
    })),
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params
  const symbol = normalizeKRTicker(decodeURIComponent(ticker))
  const market = detectMarket(symbol)

  if (market === 'KR') {
    return NextResponse.redirect(new URL(`/api/stocks/${encodeURIComponent(symbol)}/dart`, req.url))
  }

  try {
    const [annualFin, annualBal, annualCf, qFin, qBal, qCf] = await Promise.all([
      yahooFinance.fundamentalsTimeSeries(symbol, { module: 'financials', period1: '2018-01-01', type: 'annual' }, { validateResult: false }) as Promise<TimeSeriesRow[]>,
      yahooFinance.fundamentalsTimeSeries(symbol, { module: 'balance-sheet', period1: '2018-01-01', type: 'annual' }, { validateResult: false }) as Promise<TimeSeriesRow[]>,
      yahooFinance.fundamentalsTimeSeries(symbol, { module: 'cash-flow', period1: '2018-01-01', type: 'annual' }, { validateResult: false }) as Promise<TimeSeriesRow[]>,
      yahooFinance.fundamentalsTimeSeries(symbol, { module: 'financials', period1: '2022-01-01', type: 'quarterly' }, { validateResult: false }) as Promise<TimeSeriesRow[]>,
      yahooFinance.fundamentalsTimeSeries(symbol, { module: 'balance-sheet', period1: '2022-01-01', type: 'quarterly' }, { validateResult: false }) as Promise<TimeSeriesRow[]>,
      yahooFinance.fundamentalsTimeSeries(symbol, { module: 'cash-flow', period1: '2022-01-01', type: 'quarterly' }, { validateResult: false }) as Promise<TimeSeriesRow[]>,
    ])

    const result: FinancialData = {
      ticker: symbol,
      market: 'US',
      annual: {
        income: buildStatement(annualFin, INCOME_FIELDS, 'income', 'annual'),
        balance: buildStatement(annualBal, BALANCE_FIELDS, 'balance', 'annual'),
        cashflow: buildStatement(annualCf, CASHFLOW_FIELDS, 'cashflow', 'annual'),
      },
      quarterly: {
        income: buildStatement(qFin, INCOME_FIELDS, 'income', 'quarterly'),
        balance: buildStatement(qBal, BALANCE_FIELDS, 'balance', 'quarterly'),
        cashflow: buildStatement(qCf, CASHFLOW_FIELDS, 'cashflow', 'quarterly'),
      },
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[financials]', error)
    return NextResponse.json({ error: 'Failed to fetch financials' }, { status: 500 })
  }
}
