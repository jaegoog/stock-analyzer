'use client'
import { useState, useEffect, useMemo } from 'react'
import type { BrickProps, StockQuote, FinancialData, CustomMetric, ChartRequestEventDetail } from '@/types'
import { formatNumber } from '@/lib/utils'
import {
  evalFormula,
  extractLatestVarsWithQuote,
  extractPeriodVarsArray,
  FUNDAMENTAL_METRIC_DEFS,
  calcMetricTimeSeries,
  hasFinancialPeriodData,
} from '@/lib/financial-metrics'

// ─── 내장 지표 정의 ───────────────────────────────────────────────────────────

interface BuiltinMetricDef {
  id: string
  name: string
  description: string
  unit: string
  calc: (vars: Record<string, number>) => number | null
}

const BUILTIN: BuiltinMetricDef[] = [
  { id: 'per',          name: 'PER',    description: '주가수익비율 (Price / EPS)',         unit: '배',   calc: (v) => v.price && v.eps ? v.price / v.eps : null },
  { id: 'eps',          name: 'EPS',    description: '주당순이익 (순이익 / 발행주식수)',      unit: '원/주', calc: (v) => v.netIncome && v.shares ? v.netIncome / v.shares : null },
  { id: 'pbr',          name: 'PBR',    description: '주가순자산비율 (Price / BPS)',         unit: '배',   calc: (v) => v.price && v.equity && v.shares ? v.price / (v.equity / v.shares) : null },
  { id: 'roe',          name: 'ROE',    description: '자기자본이익률 (순이익 / 자기자본)',    unit: '%',    calc: (v) => v.netIncome && v.equity ? (v.netIncome / v.equity) * 100 : null },
  { id: 'debt_ratio',   name: '부채비율', description: '총부채 / 자기자본',                  unit: '%',    calc: (v) => v.totalLiab && v.equity ? (v.totalLiab / v.equity) * 100 : null },
  { id: 'current_ratio',name: '유동비율', description: '유동자산 / 유동부채',                unit: '배',   calc: (v) => v.currentAssets && v.currentLiabilities ? v.currentAssets / v.currentLiabilities : null },
]

// ─── 차트 이벤트 발송 ─────────────────────────────────────────────────────────

function dispatchChartRequest(detail: ChartRequestEventDetail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('brick:chart-request', { detail }))
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function MetricsCalculatorBrick({ ticker, market }: BrickProps) {
  const [quote,         setQuote]         = useState<StockQuote | null>(null)
  const [financials,    setFinancials]    = useState<FinancialData | null>(null)
  const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>([])
  const [showForm,      setShowForm]      = useState(false)
  const [newMetric,     setNewMetric]     = useState({ name: '', formula: '', description: '', unit: '' })

  useEffect(() => {
    const endpoint = market === 'KR'
      ? `/api/stocks/${encodeURIComponent(ticker)}/dart`
      : `/api/stocks/${encodeURIComponent(ticker)}/financials`

    fetch(`/api/stocks/${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((j) => setQuote(j as StockQuote))

    fetch(endpoint)
      .then((r) => r.json())
      .then((j) => setFinancials(j as FinancialData))

    fetch('/api/bricks/metrics-calculator/custom')
      .then((r) => r.ok ? r.json() : [])
      .then((d) => Array.isArray(d) && setCustomMetrics(d))
      .catch(() => {})
  }, [ticker, market])

  // ── 최신 단일 시점 변수 (내장 지표 계산용) ────────────────────────────────
  const vars = useMemo(
    () => extractLatestVarsWithQuote(financials, quote),
    [quote, financials]
  )

  // ── 차트 전송 핸들러 ──────────────────────────────────────────────────────
  const handleSendBuiltinToChart = (def: BuiltinMetricDef) => {
    if (!financials || !hasFinancialPeriodData(financials, 'annual')) return

    // fundamental-metrics.ts에 동일 id가 있으면 시계열 계산 위임
    const fundDef = FUNDAMENTAL_METRIC_DEFS.find((d) => d.id === def.id || d.id === def.id.replace('_', '-'))
    const series = fundDef
      ? calcMetricTimeSeries(financials, 'annual', fundDef.id)
      : (() => {
          const varsArray = extractPeriodVarsArray(financials, 'annual')
          const years     = financials.annual.income.years
          return years.map((year, i) => ({
            year,
            value: def.calc(
              Object.fromEntries(
                Object.entries(extractLatestVarsWithQuote(financials, quote)).map(([k]) => [
                  k,
                  ((extractPeriodVarsArray(financials, 'annual')[i] as unknown as Record<string, number | null>)?.[k] as number) ?? 0,
                ])
              ) as Record<string, number>
            ) ?? null,
          }))
        })()

    dispatchChartRequest({ ticker, metricId: def.id, label: def.name, series, unit: def.unit })
  }

  const handleSendCustomToChart = (metric: CustomMetric) => {
    if (!financials || !hasFinancialPeriodData(financials, 'annual')) return
    const varsArray = extractPeriodVarsArray(financials, 'annual')
    const years     = financials.annual.income.years
    const series    = years.map((year, i) => ({
      year,
      value: evalFormula(metric.formula, Object.fromEntries(
        Object.entries(varsArray[i] ?? {}).map(([k, v]) => [k, (v as number | null) ?? 0])
      )),
    }))
    dispatchChartRequest({ ticker, metricId: metric.id, label: metric.name, series, unit: metric.unit })
  }

  // ── 커스텀 지표 저장 ──────────────────────────────────────────────────────
  const handleAddMetric = () => {
    if (!newMetric.name || !newMetric.formula) return
    const metric: CustomMetric = { ...newMetric, id: Date.now().toString(), createdAt: new Date().toISOString() }
    const updated = [...customMetrics, metric]
    setCustomMetrics(updated)
    fetch('/api/bricks/metrics-calculator/custom', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    setNewMetric({ name: '', formula: '', description: '', unit: '' })
    setShowForm(false)
  }

  const handleDeleteMetric = (id: string) => {
    const updated = customMetrics.filter((m) => m.id !== id)
    setCustomMetrics(updated)
    fetch('/api/bricks/metrics-calculator/custom', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
  }

  // ── 렌더링 ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">투자 지표</h2>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="text-sm px-3 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
        >
          + 공식 추가
        </button>
      </div>

      {showForm && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              placeholder="지표명 (예: 매출성장률)"
              value={newMetric.name}
              onChange={(e) => setNewMetric((p) => ({ ...p, name: e.target.value }))}
              className="border rounded px-2 py-1 text-sm"
            />
            <input
              placeholder="단위 (예: %)"
              value={newMetric.unit}
              onChange={(e) => setNewMetric((p) => ({ ...p, unit: e.target.value }))}
              className="border rounded px-2 py-1 text-sm"
            />
          </div>
          <input
            placeholder="공식 (예: operatingIncome / totalRevenue * 100)"
            value={newMetric.formula}
            onChange={(e) => setNewMetric((p) => ({ ...p, formula: e.target.value }))}
            className="border rounded px-2 py-1 text-sm w-full mb-2"
          />
          <input
            placeholder="설명 (선택)"
            value={newMetric.description}
            onChange={(e) => setNewMetric((p) => ({ ...p, description: e.target.value }))}
            className="border rounded px-2 py-1 text-sm w-full mb-2"
          />
          <p className="text-xs text-gray-500 mb-2">
            사용 가능한 변수: price, eps, shares, netIncome, totalRevenue, operatingIncome,
            equity, totalAssets, totalLiab, currentAssets, currentLiabilities,
            operatingCashFlow, capex, interestExpense
          </p>
          <div className="flex gap-2">
            <button onClick={handleAddMetric} className="px-3 py-1 bg-blue-600 text-white rounded text-sm">추가</button>
            <button onClick={() => setShowForm(false)} className="px-3 py-1 border rounded text-sm text-gray-600">취소</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {BUILTIN.map((m) => {
          const value = m.calc(vars)
          return (
            <div key={m.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-900">{m.name}</span>
                <span className="ml-2 text-xs text-gray-400">{m.description}</span>
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                <span className="font-mono text-gray-900">
                  {value !== null ? `${formatNumber(value, { decimals: 2 })} ${m.unit}` : '-'}
                </span>
                {financials && (
                  <button
                    onClick={() => handleSendBuiltinToChart(m)}
                    title="차트에서 보기"
                    className="text-gray-300 hover:text-blue-500 text-xs px-1"
                  >
                    📊
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {customMetrics.map((m) => {
          const value = evalFormula(m.formula, vars)
          return (
            <div key={m.id} className="flex items-center justify-between px-4 py-3 bg-purple-50">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 shrink-0">커스텀</span>
                <span className="font-medium text-gray-900">{m.name}</span>
                {m.description && <span className="text-xs text-gray-400">{m.description}</span>}
              </div>
              <div className="flex items-center gap-2 ml-3 shrink-0">
                <span className="font-mono text-gray-900">
                  {value !== null ? `${formatNumber(value, { decimals: 2 })} ${m.unit}` : '-'}
                </span>
                {financials && (
                  <button
                    onClick={() => handleSendCustomToChart(m)}
                    title="차트에서 보기"
                    className="text-gray-300 hover:text-blue-500 text-xs px-1"
                  >
                    📊
                  </button>
                )}
                <button
                  onClick={() => handleDeleteMetric(m.id)}
                  className="text-gray-300 hover:text-red-400 text-xs"
                >
                  ✕
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
