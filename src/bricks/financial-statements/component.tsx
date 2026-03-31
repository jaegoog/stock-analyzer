'use client'
import { useState, useEffect, useCallback } from 'react'
import type { BrickProps, FinancialData, FinancialStatement } from '@/types'
import { formatNumber } from '@/lib/utils'

const DEFAULT_FIELDS = {
  income: ['totalRevenue', 'grossProfit', 'operatingIncome', 'ebitda', 'netIncome'],
  balance: ['totalAssets', 'totalLiab', 'totalEquity', 'cash', 'totalCurrentAssets', 'totalCurrentLiabilities'],
  cashflow: ['operatingCashFlow', 'investingCashFlow', 'financingCashFlow', 'capex'],
}

type TabType = 'income' | 'balance' | 'cashflow'
type PeriodType = 'annual' | 'quarterly'

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
  const currency = statement.rows[0]?.unit ?? 'USD'
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
                  {val !== null ? formatNumber(val, { currency, compact: true }) : '-'}
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<TabType>('income')
  const [period, setPeriod] = useState<PeriodType>('annual')
  const [visibleFields, setVisibleFields] = useState(DEFAULT_FIELDS)

  useEffect(() => {
    const endpoint = market === 'KR' ? `/api/stocks/${encodeURIComponent(ticker)}/dart` : `/api/stocks/${encodeURIComponent(ticker)}/financials`
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
  }, [ticker, market])

  const toggleField = useCallback((tabKey: TabType, field: string) => {
    setVisibleFields((prev) => {
      const current = prev[tabKey]
      const next = current.includes(field) ? current.filter((f) => f !== field) : [...current, field]
      return { ...prev, [tabKey]: next }
    })
  }, [])

  if (loading) return <div className="p-6 text-center text-gray-400">로딩 중...</div>
  if (error) return <div className="p-6 text-center text-red-400">{error}</div>
  if (!data?.annual) return null

  const statements = data[period] ?? data.annual
  const statement = statements[tab]
  if (!statement) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">재무제표</h2>
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
          statement={statement}
          visibleFields={visibleFields[tab]}
          onToggleField={(field) => toggleField(tab, field)}
        />
      </div>
    </div>
  )
}
