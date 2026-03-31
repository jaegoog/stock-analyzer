'use client'
import { useState, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { BrickProps, FinancialData } from '@/types'
import { formatNumber } from '@/lib/utils'

type ChartType = 'bar' | 'line' | 'area'

const METRICS = [
  { field: 'totalRevenue', label: '매출액', color: '#3b82f6' },
  { field: 'operatingIncome', label: '영업이익', color: '#10b981' },
  { field: 'netIncome', label: '당기순이익', color: '#8b5cf6' },
  { field: 'operatingCashFlow', label: '영업현금흐름', color: '#f59e0b' },
]

export default function InteractiveChartBrick({ ticker, market }: BrickProps) {
  const [data, setData] = useState<FinancialData | null>(null)
  const [loading, setLoading] = useState(true)
  const [chartType, setChartType] = useState<ChartType>('bar')
  const [selectedMetrics, setSelectedMetrics] = useState(['totalRevenue', 'operatingIncome', 'netIncome'])

  useEffect(() => {
    const endpoint = market === 'KR' ? `/api/stocks/${encodeURIComponent(ticker)}/dart` : `/api/stocks/${encodeURIComponent(ticker)}/financials`
    fetch(endpoint)
      .then((r) => r.json())
      .then((d: FinancialData & { error?: string }) => {
        if (!d.error && d.annual) setData(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [ticker, market])

  if (loading) return <div className="p-6 text-center text-gray-400">로딩 중...</div>
  if (!data?.annual) return null

  // Build chart data from annual income + cashflow
  const years = data.annual.income.years
  const allRows = [...data.annual.income.rows, ...data.annual.cashflow.rows]

  const chartData = years.map((year, i) => {
    const point: Record<string, string | number> = { year }
    for (const metric of METRICS) {
      const row = allRows.find((r) => r.field === metric.field)
      point[metric.field] = row?.values[i] ?? 0
    }
    return point
  })

  const activeMetrics = METRICS.filter((m) => selectedMetrics.includes(m.field))

  const currency = market === 'KR' ? 'KRW' : 'USD'

  const renderChart = () => {
    const commonProps = {
      data: chartData,
      margin: { top: 5, right: 20, left: 0, bottom: 5 },
    }
    const tooltip = <Tooltip formatter={(val: unknown) => formatNumber(val as number, { currency, compact: true })} />
    const axes = (
      <>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="year" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatNumber(v, { currency, compact: true })} width={80} />
        {tooltip}
        <Legend />
      </>
    )

    if (chartType === 'line') {
      return (
        <LineChart {...commonProps}>
          {axes}
          {activeMetrics.map((m) => (
            <Line key={m.field} type="monotone" dataKey={m.field} name={m.label} stroke={m.color} strokeWidth={2} dot={{ r: 4 }} />
          ))}
        </LineChart>
      )
    }
    if (chartType === 'area') {
      return (
        <AreaChart {...commonProps}>
          {axes}
          {activeMetrics.map((m) => (
            <Area key={m.field} type="monotone" dataKey={m.field} name={m.label} stroke={m.color} fill={m.color} fillOpacity={0.15} strokeWidth={2} />
          ))}
        </AreaChart>
      )
    }
    return (
      <BarChart {...commonProps}>
        {axes}
        {activeMetrics.map((m) => (
          <Bar key={m.field} dataKey={m.field} name={m.label} fill={m.color} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">재무 차트</h2>
        <div className="flex gap-1">
          {(['bar', 'line', 'area'] as ChartType[]).map((t) => (
            <button
              key={t}
              onClick={() => setChartType(t)}
              className={`px-3 py-1 rounded text-sm ${chartType === t ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {t === 'bar' ? '막대' : t === 'line' ? '꺾은선' : '영역'}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-gray-100">
        {METRICS.map((m) => (
          <button
            key={m.field}
            onClick={() =>
              setSelectedMetrics((prev) =>
                prev.includes(m.field) ? prev.filter((f) => f !== m.field) : [...prev, m.field]
              )
            }
            className={`px-2 py-1 rounded text-xs font-medium border ${selectedMetrics.includes(m.field) ? 'text-white border-transparent' : 'bg-white text-gray-500 border-gray-200'}`}
            style={{ backgroundColor: selectedMetrics.includes(m.field) ? m.color : undefined }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        <ResponsiveContainer width="100%" height={320}>
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
