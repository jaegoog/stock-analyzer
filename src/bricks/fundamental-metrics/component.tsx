'use client'
import { useState, useEffect, useMemo } from 'react'
import type {
  BrickProps,
  FinancialData,
  FundamentalCategoryId,
  FundamentalMetricResult,
  ChartRequestEventDetail,
} from '@/types'
import { formatNumber, formatPercent } from '@/lib/utils'
import { calcFundamentalMetrics, calcMetricTimeSeries } from '@/lib/financial-metrics'

// ─── 카테고리 메타데이터 ──────────────────────────────────────────────────────

interface CategoryMeta {
  id: FundamentalCategoryId
  label: string
  description: string
  borderColor: string
  bgColor: string
}

const CATEGORIES: CategoryMeta[] = [
  {
    id: 'moat-bankruptcy',
    label: '🏰 구조적 해자 & 파산 위험',
    description: '기업의 경쟁 우위와 재무 건전성 — 투자 전 최우선 확인',
    borderColor: 'border-blue-500',
    bgColor: 'bg-blue-50',
  },
  {
    id: 'growth',
    label: '🚀 미래 성장성',
    description: '매출·이익의 성장 궤도 — 기업 가치 확대 가능성',
    borderColor: 'border-green-500',
    bgColor: 'bg-green-50',
  },
  {
    id: 'cash-generation',
    label: '💰 현금창출능력',
    description: '실제 현금 창출력 — 이익의 질(Quality of Earnings) 판단',
    borderColor: 'border-amber-500',
    bgColor: 'bg-amber-50',
  },
  {
    id: 'dividend-capacity',
    label: '📦 배당 여력',
    description: '주주 환원 및 자본 효율성 — 장기 투자 매력도',
    borderColor: 'border-purple-500',
    bgColor: 'bg-purple-50',
  },
]

// ─── 변화율 배지 ──────────────────────────────────────────────────────────────

function ChangeBadge({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null
  const positive = value >= 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded font-medium ${
        positive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {positive ? '▲' : '▼'} {Math.abs(value).toFixed(1)}% <span className="text-[10px] opacity-70">{label}</span>
    </span>
  )
}

// ─── 단일 지표 행 ─────────────────────────────────────────────────────────────

function MetricRow({
  metric,
  period,
  onSendToChart,
}: {
  metric: FundamentalMetricResult
  period: 'annual' | 'quarterly'
  onSendToChart: (metricId: string) => void
}) {
  const value   = period === 'annual' ? metric.annualValue   : metric.quarterlyValue
  const yoy     = period === 'annual' ? metric.annualYoY     : metric.quarterlyYoY
  const qoq     = period === 'quarterly' ? metric.quarterlyQoQ : null

  const formatValue = (v: number | null) => {
    if (v === null) return '-'
    switch (metric.unit) {
      case 'percent': return `${formatNumber(v, { decimals: 1 })}%`
      case 'ratio':   return formatNumber(v, { decimals: 2 })
      case 'days':    return `${formatNumber(v, { decimals: 1 })}일`
      case 'currency': return formatNumber(v, { compact: true })
      default: return formatNumber(v, { decimals: 2 })
    }
  }

  return (
    <div className="flex items-start justify-between py-3 px-4 gap-3">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 text-sm">{metric.name}</div>
        <div className="text-xs text-gray-400 mt-0.5 leading-relaxed">{metric.description}</div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-base font-semibold text-gray-900">{formatValue(value)}</span>
          <button
            onClick={() => onSendToChart(metric.id)}
            title="차트에서 보기"
            className="text-gray-300 hover:text-blue-500 text-xs"
          >
            📊
          </button>
        </div>
        <div className="flex gap-1 flex-wrap justify-end">
          <ChangeBadge value={yoy} label="YoY" />
          {period === 'quarterly' && <ChangeBadge value={qoq} label="QoQ" />}
        </div>
      </div>
    </div>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function FundamentalMetricsBrick({ ticker, market }: BrickProps) {
  const [financials, setFinancials] = useState<FinancialData | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [period,     setPeriod]     = useState<'annual' | 'quarterly'>('annual')

  useEffect(() => {
    const endpoint = market === 'KR'
      ? `/api/stocks/${encodeURIComponent(ticker)}/dart`
      : `/api/stocks/${encodeURIComponent(ticker)}/financials`

    setLoading(true)
    fetch(endpoint)
      .then((r) => r.json())
      .then((d: FinancialData & { error?: string }) => {
        if (d.error || !d.annual) {
          setError(d.error ?? '재무 데이터를 불러올 수 없습니다.')
        } else {
          setFinancials(d)
        }
        setLoading(false)
      })
      .catch(() => { setError('데이터를 불러올 수 없습니다.'); setLoading(false) })
  }, [ticker, market])

  const metrics = useMemo(
    () => (financials ? calcFundamentalMetrics(financials) : []),
    [financials]
  )

  const handleSendToChart = (metricId: string) => {
    if (!financials || typeof window === 'undefined') return
    const series = calcMetricTimeSeries(financials, 'annual', metricId)
    const def = metrics.find((m) => m.id === metricId)
    if (!def || series.length === 0) return

    const detail: ChartRequestEventDetail = {
      ticker,
      metricId,
      label: def.name,
      series,
      unit: def.unit,
    }
    window.dispatchEvent(new CustomEvent('brick:chart-request', { detail }))
  }

  if (loading) return <div className="p-6 text-center text-gray-400">로딩 중...</div>
  if (error)   return <div className="p-6 text-center text-red-400">{error}</div>
  if (!financials) return null

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">기업 본질 지표</h2>
        <div className="flex gap-1">
          {(['annual', 'quarterly'] as const).map((p) => (
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

      {/* 카테고리별 섹션 */}
      <div className="divide-y divide-gray-100">
        {CATEGORIES.map((cat) => {
          const catMetrics = metrics.filter((m) => m.category === cat.id)
          return (
            <div key={cat.id}>
              {/* 카테고리 헤더 */}
              <div className={`px-4 py-2 ${cat.bgColor} border-l-4 ${cat.borderColor}`}>
                <div className="font-medium text-sm text-gray-800">{cat.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{cat.description}</div>
              </div>
              {/* 지표 행 */}
              <div className="divide-y divide-gray-50">
                {catMetrics.map((m) => (
                  <MetricRow
                    key={m.id}
                    metric={m}
                    period={period}
                    onSendToChart={handleSendToChart}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
