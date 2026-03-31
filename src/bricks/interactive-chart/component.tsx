'use client'
import { useState, useEffect, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { BrickProps, ChartRequestEventDetail, FinancialData } from '@/types'
import { formatNumber } from '@/lib/utils'

type ChartType = 'bar' | 'line' | 'area'

// ─── 고정 기본 지표 ───────────────────────────────────────────────────────────

interface MetricDef {
  field: string
  label: string
  color: string
}

const BASE_METRICS: MetricDef[] = [
  { field: 'totalRevenue',      label: '매출액',       color: '#3b82f6' },
  { field: 'operatingIncome',   label: '영업이익',     color: '#10b981' },
  { field: 'netIncome',         label: '당기순이익',   color: '#8b5cf6' },
  { field: 'operatingCashFlow', label: '영업현금흐름', color: '#f59e0b' },
]

// 동적 추가 지표에 순서대로 할당할 색상 팔레트
const DYNAMIC_COLORS = ['#ec4899', '#6366f1', '#14b8a6', '#f97316', '#a855f7', '#0ea5e9']

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function InteractiveChartBrick({ ticker, market }: BrickProps) {
  const [financials,      setFinancials]      = useState<FinancialData | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [chartType,       setChartType]       = useState<ChartType>('bar')
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['totalRevenue', 'operatingIncome', 'netIncome'])
  /** metrics-calculator 등에서 전송받은 동적 지표 시리즈 */
  const [customSeries,    setCustomSeries]    = useState<ChartRequestEventDetail[]>([])

  // ── 재무 데이터 fetch ────────────────────────────────────────────────────
  useEffect(() => {
    const endpoint = market === 'KR'
      ? `/api/stocks/${encodeURIComponent(ticker)}/dart`
      : `/api/stocks/${encodeURIComponent(ticker)}/financials`

    setLoading(true)
    fetch(endpoint)
      .then((r) => r.json())
      .then((d: FinancialData & { error?: string }) => {
        if (!d.error && d.annual) setFinancials(d)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [ticker, market])

  // ── Brick 간 이벤트 수신 ─────────────────────────────────────────────────
  const handleChartRequest = useCallback((e: Event) => {
    const detail = (e as CustomEvent<ChartRequestEventDetail>).detail
    if (detail.ticker !== ticker) return

    setCustomSeries((prev) => {
      const exists = prev.find((s) => s.metricId === detail.metricId)
      return exists ? prev : [...prev, detail]
    })
    // 자동으로 선택 상태에 추가
    setSelectedMetrics((prev) =>
      prev.includes(detail.metricId) ? prev : [...prev, detail.metricId]
    )
  }, [ticker])

  useEffect(() => {
    window.addEventListener('brick:chart-request', handleChartRequest)
    return () => window.removeEventListener('brick:chart-request', handleChartRequest)
  }, [handleChartRequest])

  // ── 차트 데이터 빌드 ─────────────────────────────────────────────────────
  if (loading) return <div className="p-6 text-center text-gray-400">로딩 중...</div>
  if (!financials?.annual) return null

  const years    = financials.annual.income.years
  const allRows  = [...financials.annual.income.rows, ...financials.annual.cashflow.rows]

  const chartData = years.map((year, i) => {
    const point: Record<string, string | number | null> = { year }
    // 기본 지표
    for (const m of BASE_METRICS) {
      const row = allRows.find((r) => r.field === m.field)
      point[m.field] = row?.values[i] ?? null
    }
    // 동적 지표 — series 배열을 year로 매핑
    for (const s of customSeries) {
      const match = s.series.find((p) => p.year === year)
      point[s.metricId] = match?.value ?? null
    }
    return point
  })

  // ── 모든 지표 목록 (기본 + 동적) ────────────────────────────────────────
  const allMetrics: MetricDef[] = [
    ...BASE_METRICS,
    ...customSeries.map((s, idx) => ({
      field: s.metricId,
      label: s.label,
      color: DYNAMIC_COLORS[idx % DYNAMIC_COLORS.length],
    })),
  ]

  const activeMetrics = allMetrics.filter((m) => selectedMetrics.includes(m.field))
  const currency = market === 'KR' ? 'KRW' : 'USD'

  // ── 차트 렌더링 ──────────────────────────────────────────────────────────
  const commonProps = {
    data: chartData,
    margin: { top: 5, right: 20, left: 0, bottom: 5 },
  }
  const tooltip = (
    <Tooltip formatter={(val: unknown) => formatNumber(val as number, { currency, compact: true })} />
  )
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
      <XAxis dataKey="year" tick={{ fontSize: 12 }} />
      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => formatNumber(v, { currency, compact: true })} width={80} />
      {tooltip}
      <Legend />
    </>
  )

  const renderChart = () => {
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

  const removeCustomSeries = (metricId: string) => {
    setCustomSeries((prev) => prev.filter((s) => s.metricId !== metricId))
    setSelectedMetrics((prev) => prev.filter((f) => f !== metricId))
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 헤더 */}
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

      {/* 지표 선택 버튼 */}
      <div className="px-4 py-2 flex flex-wrap gap-2 border-b border-gray-100">
        {allMetrics.map((m) => (
          <div key={m.field} className="flex items-center gap-0.5">
            <button
              onClick={() =>
                setSelectedMetrics((prev) =>
                  prev.includes(m.field) ? prev.filter((f) => f !== m.field) : [...prev, m.field]
                )
              }
              className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${
                selectedMetrics.includes(m.field)
                  ? 'text-white border-transparent'
                  : 'bg-white text-gray-500 border-gray-200'
              }`}
              style={{ backgroundColor: selectedMetrics.includes(m.field) ? m.color : undefined }}
            >
              {m.label}
            </button>
            {/* 동적 지표만 제거 버튼 표시 */}
            {customSeries.some((s) => s.metricId === m.field) && (
              <button
                onClick={() => removeCustomSeries(m.field)}
                className="text-gray-300 hover:text-red-400 text-xs"
                title="지표 제거"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 차트 */}
      <div className="p-4">
        <ResponsiveContainer width="100%" height={320}>
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </div>
  )
}
