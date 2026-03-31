import yahooFinance from '@/lib/yahoo-finance'
import type { FinancialStatement, FinancialData, StockQuote, StockSearchResult } from '@/types'
import type { ProviderFactory, PriceProvider, FinancialsProvider } from '../types'
import manifest from './manifest.json'

// ─── 재무제표 필드 정의 ───────────────────────────────────────────────────────

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

// ─── Price Provider ───────────────────────────────────────────────────────────

const priceProvider: PriceProvider = {
  async getQuote(ticker) {
    const quote = await yahooFinance.quote(ticker, {}, { validateResult: false }) as Record<string, unknown>
    return {
      ticker,
      name: (quote.longName ?? quote.shortName ?? ticker) as string,
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
      market: ticker.match(/\.(KS|KQ)$/) ? 'KR' : 'US',
    } as StockQuote
  },

  async search(query) {
    const results = await yahooFinance.search(query, {}, { validateResult: false }) as { quotes?: Record<string, unknown>[] }
    const quotes = results.quotes ?? []
    return quotes
      .filter((q) => q.quoteType === 'EQUITY')
      .slice(0, 10)
      .map((q) => {
        const ticker = String(q.symbol ?? '')
        return {
          ticker,
          name: String(q.longname ?? q.shortname ?? ticker),
          exchange: String(q.exchange ?? ''),
          type: String(q.quoteType ?? 'EQUITY'),
          market: ticker.match(/\.(KS|KQ)$/) ? 'KR' : 'US',
        } as StockSearchResult
      })
  },
}

// ─── Financials Provider ──────────────────────────────────────────────────────

const financialsProvider: FinancialsProvider = {
  async getFinancials(ticker) {
    const [annualFin, annualBal, annualCf, qFin, qBal, qCf] = await Promise.all([
      yahooFinance.fundamentalsTimeSeries(ticker, { module: 'financials', period1: '2018-01-01', type: 'annual' }, { validateResult: false }) as Promise<TimeSeriesRow[]>,
      yahooFinance.fundamentalsTimeSeries(ticker, { module: 'balance-sheet', period1: '2018-01-01', type: 'annual' }, { validateResult: false }) as Promise<TimeSeriesRow[]>,
      yahooFinance.fundamentalsTimeSeries(ticker, { module: 'cash-flow', period1: '2018-01-01', type: 'annual' }, { validateResult: false }) as Promise<TimeSeriesRow[]>,
      yahooFinance.fundamentalsTimeSeries(ticker, { module: 'financials', period1: '2022-01-01', type: 'quarterly' }, { validateResult: false }) as Promise<TimeSeriesRow[]>,
      yahooFinance.fundamentalsTimeSeries(ticker, { module: 'balance-sheet', period1: '2022-01-01', type: 'quarterly' }, { validateResult: false }) as Promise<TimeSeriesRow[]>,
      yahooFinance.fundamentalsTimeSeries(ticker, { module: 'cash-flow', period1: '2022-01-01', type: 'quarterly' }, { validateResult: false }) as Promise<TimeSeriesRow[]>,
    ])

    const result: FinancialData = {
      ticker,
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

    return result
  },
}

// ─── Provider Factory ─────────────────────────────────────────────────────────

const provider: ProviderFactory = {
  manifest: manifest as ProviderFactory['manifest'],
  createPriceProvider: () => priceProvider,
  createFinancialsProvider: () => financialsProvider,
}

export default provider
