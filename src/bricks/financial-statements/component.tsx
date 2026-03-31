'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import type {
  BrickProps,
  DartFsRequestMode,
  FinancialData,
  FinancialStatement,
  StockQuote,
} from '@/types'
import { formatNumber } from '@/lib/utils'

const DEFAULT_FIELDS = {
  income: ['totalRevenue', 'operatingIncome', 'ebitda', 'evEbitda', 'netIncome'],
  balance: ['totalAssets', 'totalLiab', 'totalEquity', 'cash', 'totalCurrentAssets', 'totalCurrentLiabilities'],
  cashflow: ['operatingCashFlow', 'investingCashFlow', 'financingCashFlow', 'capex'],
}

type TabType = 'income' | 'balance' | 'cashflow'
type PeriodType = 'annual' | 'quarterly'

const FS_MODE_OPTIONS: { mode: DartFsRequestMode; label: string }[] = [
  { mode: 'auto', label: '자동' },
  { mode: 'cfs', label: '연결' },
  { mode: 'ofs', label: '별도' },
]

const TAB_LABELS: Record<TabType, string> = {
  income: '손익계산서',
  balance: '재무상태표',
  cashflow: '현금흐름표',
}

function StatementTable({ statement, visibleFields, onToggleField }: {
  statement: FinancialStatement
  visibleFields: string[]
  onToggleField: (field: string) => void
}) {
  const defaultUnit = statement.rows[0]?.unit ?? 'USD'
  const rows = statement.rows.filter((r) => visibleFields.includes(r.field))
  const hiddenRows = statement.rows.filter((r) => !visibleFields.includes(r.field))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 px-3 font-medium text-gray-600 min-w-[160px]">항목</th>
            {statement.years.map((y) => (
              <th key={y} className="text-right py-2 px-3 font-medium text-gray-600 min-w-[100px]">{y}</th>
            ))}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.field} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 px-3 text-gray-700">{row.label}</td>
              {row.values.map((val, i) => (
                <td key={i} className={`py-2 px-3 text-right font-mono ${val !== null && val < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {val !== null
                    ? (row.unit === 'ratio' || row.unit === 'percent'
                      ? formatNumber(val, { decimals: 2 })
                      : formatNumber(val, { currency: row.unit ?? defaultUnit, compact: true }))
                    : '-'}
                </td>
              ))}
              <td className="py-2 px-1">
                <button onClick={() => onToggleField(row.field)} className="text-gray-300 hover:text-red-400 text-xs" title="숨기기">✕</button>
              </td>
            </tr>
          ))}
          {hiddenRows.length > 0 && (
            <tr>
              <td colSpan={statement.years.length + 2} className="py-2 px-3">
                <div className="flex flex-wrap gap-1 mt-1">
                  {hiddenRows.map((row) => (
                    <button
                      key={row.field}
                      onClick={() => onToggleField(row.field)}
                      className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-500 hover:bg-blue-100 hover:text-blue-600"
                    >
                      + {row.label}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function FinancialStatementsBrick({ ticker, market }: BrickProps) {
  const [data, setData] = useState<FinancialData | null>(null)
  const [quote, setQuote] = useState<StockQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabType>('income')
  const [period, setPeriod] = useState<PeriodType>('annual')
  const [visibleFields, setVisibleFields] = useState(DEFAULT_FIELDS)
  const [fsMode, setFsMode] = useState<DartFsRequestMode>('auto')

  useEffect(() => {
    const base =
      market === 'KR'
        ? `/api/stocks/${encodeURIComponent(ticker)}/dart`
        : `/api/stocks/${encodeURIComponent(ticker)}/financials`
    const endpoint = market === 'KR' ? `${base}?fs=${encodeURIComponent(fsMode)}` : base
    setLoading(true)
    fetch(endpoint)
      .then((r) => r.json())
      .then((d: FinancialData & { error?: string }) => {
        if (d.error || !d.annual) {
          setError(d.error ?? '재무 데이터를 불러올 수 없습니다.')
        } else {
          setData(d)
        }
        setLoading(false)
      })
      .catch(() => { setError('데이터를 불러올 수 없습니다.'); setLoading(false) })

    fetch(`/api/stocks/${encodeURIComponent(ticker)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((q) => q && setQuote(q as StockQuote))
      .catch(() => { /* ignore quote errors */ })
  }, [ticker, market, fsMode])

  const toggleField = useCallback((tabKey: TabType, field: string) => {
    setVisibleFields((prev) => {
      const current = prev[tabKey]
      const next = current.includes(field) ? current.filter((f) => f !== field) : [...current, field]
      return { ...prev, [tabKey]: next }
    })
  }, [])

  const statements = data?.annual ? (data[period] ?? data.annual) : null
  const statement = statements ? statements[tab] : null

  const displayStatement = useMemo(() => {
    if (!statement) return null
    if (tab !== 'income') return statement

    /* KR: /dart API가 EV/EBITDA 행을 이미 채움 */
    if (market === 'KR' && statement.rows.some((r) => r.field === 'evEbitda')) {
      return statement
    }

    const ebitdaRow = statement.rows.find((r) => r.field === 'ebitda')
    if (!ebitdaRow) return statement

    /** EV = 시가총액 + 부채총계 − 현금 (비 KR / fallback) */
    const liab = statements?.balance.rows.find((r) => r.field === 'totalLiab')?.values ?? []
    const cash = statements?.balance.rows.find((r) => r.field === 'cash')?.values ?? []
    const marketCap = quote?.marketCap
      ?? (quote?.sharesOutstanding != null && quote.price > 0
        ? quote.sharesOutstanding * quote.price
        : null)

    const evEbitdaValues = ebitdaRow.values.map((ebitda, i) => {
      if (marketCap === null || ebitda === null || ebitda === 0) return null
      const debtVal = liab[i] ?? 0
      const cashVal = cash[i] ?? 0
      const ev = marketCap + debtVal - cashVal
      return ev / ebitda
    })

    const hasEvEbitda = statement.rows.some((r) => r.field === 'evEbitda')
    const rows = hasEvEbitda
      ? statement.rows.map((r) =>
        r.field === 'evEbitda'
          ? { ...r, label: 'EV/EBITDA', unit: 'ratio' as const, values: evEbitdaValues }
          : r
      )
      : [
        ...statement.rows,
        { field: 'evEbitda', label: 'EV/EBITDA', unit: 'ratio' as const, values: evEbitdaValues },
      ]
    return { ...statement, rows }
  }, [statement, statements, tab, market, quote?.marketCap, quote?.sharesOutstanding, quote?.price])

  if (loading) return <div className="p-6 text-center text-gray-400">로딩 중...</div>
  if (error) return <div className="p-6 text-center text-red-400">{error}</div>
  if (!data?.annual) return null
  if (!displayStatement) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex flex-col gap-1">
          <h2 className="font-semibold text-gray-900">재무제표</h2>
          {market === 'KR' && data.dartFs && (
            <p className="text-xs text-gray-500">
              기준: {data.dartFs.applied === 'cfs' ? '연결재무제표' : '별도재무제표'}
              {data.dartFs.requested === 'auto' && ' (자동 선택)'}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {market === 'KR' && data.dartFs && (
            <div className="flex rounded-lg border border-gray-200 p-0.5 bg-gray-50 mr-1">
              {FS_MODE_OPTIONS.map(({ mode, label }) => {
                const disabled =
                  (mode === 'cfs' && !data.dartFs!.cfsAvailable) ||
                  (mode === 'ofs' && !data.dartFs!.ofsAvailable)
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={disabled}
                    title={
                      disabled
                        ? mode === 'cfs'
                          ? '연결 재무제표 공시가 없습니다'
                          : '별도 재무제표 공시가 없습니다'
                        : undefined
                    }
                    onClick={() => setFsMode(mode)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      fsMode === mode
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex gap-1">
            {(['annual', 'quarterly'] as PeriodType[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded text-sm ${period === p ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                {p === 'annual' ? '연간' : '분기'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="flex border-b border-gray-200">
        {(Object.keys(TAB_LABELS) as TabType[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium ${tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>
      <div className="p-2">
        <StatementTable
          statement={displayStatement}
          visibleFields={visibleFields[tab]}
          onToggleField={(field) => toggleField(tab, field)}
        />
      </div>
    </div>
  )
}
