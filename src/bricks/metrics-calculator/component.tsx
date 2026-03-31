'use client'
import { useState, useEffect } from 'react'
import type { BrickProps, StockQuote, FinancialData, CustomMetric } from '@/types'
import { formatNumber } from '@/lib/utils'

interface BuiltinMetricDef {
  id: string
  name: string
  description: string
  unit: string
  calc: (vars: Record<string, number>) => number | null
}

const BUILTIN: BuiltinMetricDef[] = [
  { id: 'per', name: 'PER', description: '주가수익비율 (Price / EPS)', unit: '배', calc: (v) => v.price && v.eps ? v.price / v.eps : null },
  { id: 'eps', name: 'EPS', description: '주당순이익 (순이익 / 발행주식수)', unit: '원/주', calc: (v) => v.netIncome && v.shares ? v.netIncome / v.shares : null },
  { id: 'pbr', name: 'PBR', description: '주가순자산비율 (Price / BPS)', unit: '배', calc: (v) => v.price && v.equity && v.shares ? v.price / (v.equity / v.shares) : null },
  { id: 'roe', name: 'ROE', description: '자기자본이익률 (순이익 / 자기자본)', unit: '%', calc: (v) => v.netIncome && v.equity ? (v.netIncome / v.equity) * 100 : null },
  { id: 'debt_ratio', name: '부채비율', description: '총부채 / 총자산', unit: '%', calc: (v) => v.totalLiab && v.totalAssets ? (v.totalLiab / v.totalAssets) * 100 : null },
  { id: 'current_ratio', name: '유동비율', description: '유동자산 / 유동부채', unit: '배', calc: (v) => v.currentAssets && v.currentLiabilities ? v.currentAssets / v.currentLiabilities : null },
]

function evalFormula(formula: string, vars: Record<string, number>): number | null {
  try {
    const keys = Object.keys(vars)
    const vals = keys.map((k) => vars[k])
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `return ${formula}`)
    const result = fn(...vals)
    return typeof result === 'number' && isFinite(result) ? result : null
  } catch {
    return null
  }
}

export default function MetricsCalculatorBrick({ ticker, market }: BrickProps) {
  const [quote, setQuote] = useState<StockQuote | null>(null)
  const [financials, setFinancials] = useState<FinancialData | null>(null)
  const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>([])
  const [showForm, setShowForm] = useState(false)
  const [newMetric, setNewMetric] = useState({ name: '', formula: '', description: '', unit: '' })

  useEffect(() => {
    fetch(`/api/stocks/${encodeURIComponent(ticker)}`).then((r) => r.json()).then(setQuote)
    const endpoint = market === 'KR' ? `/api/stocks/${encodeURIComponent(ticker)}/dart` : `/api/stocks/${encodeURIComponent(ticker)}/financials`
    fetch(endpoint).then((r) => r.json()).then(setFinancials)
    fetch(`/api/bricks/metrics-calculator/custom`).then((r) => r.ok ? r.json() : []).then((d) => Array.isArray(d) && setCustomMetrics(d)).catch(() => {})
  }, [ticker, market])

  const rows = financials?.annual
  const latestIncome = rows?.income.rows
  const latestBalance = rows?.balance.rows

  const vars: Record<string, number> = {
    price: quote?.price ?? 0,
    eps: quote?.pe && quote?.price ? quote.price / quote.pe : 0,
    shares: 0,
    netIncome: latestIncome?.find((r) => r.field === 'netIncome')?.values[0] ?? 0,
    totalRevenue: latestIncome?.find((r) => r.field === 'totalRevenue')?.values[0] ?? 0,
    operatingIncome: latestIncome?.find((r) => r.field === 'operatingIncome')?.values[0] ?? 0,
    equity: latestBalance?.find((r) => r.field === 'totalEquity' || r.field === 'totalStockholderEquity')?.values[0] ?? 0,
    totalAssets: latestBalance?.find((r) => r.field === 'totalAssets')?.values[0] ?? 0,
    totalLiab: latestBalance?.find((r) => r.field === 'totalLiab')?.values[0] ?? 0,
    currentAssets: latestBalance?.find((r) => r.field === 'totalCurrentAssets')?.values[0] ?? 0,
    currentLiabilities: latestBalance?.find((r) => r.field === 'totalCurrentLiabilities')?.values[0] ?? 0,
  }

  const handleAddMetric = () => {
    if (!newMetric.name || !newMetric.formula) return
    const metric: CustomMetric = { ...newMetric, id: Date.now().toString(), createdAt: new Date().toISOString() }
    const updated = [...customMetrics, metric]
    setCustomMetrics(updated)
    fetch('/api/bricks/metrics-calculator/custom', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
    setNewMetric({ name: '', formula: '', description: '', unit: '' })
    setShowForm(false)
  }

  const handleDeleteMetric = (id: string) => {
    const updated = customMetrics.filter((m) => m.id !== id)
    setCustomMetrics(updated)
    fetch('/api/bricks/metrics-calculator/custom', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">투자 지표</h2>
        <button onClick={() => setShowForm((v) => !v)} className="text-sm px-3 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100">
          + 공식 추가
        </button>
      </div>

      {showForm && (
        <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input placeholder="지표명 (예: 매출성장률)" value={newMetric.name} onChange={(e) => setNewMetric((p) => ({ ...p, name: e.target.value }))} className="border rounded px-2 py-1 text-sm" />
            <input placeholder="단위 (예: %)" value={newMetric.unit} onChange={(e) => setNewMetric((p) => ({ ...p, unit: e.target.value }))} className="border rounded px-2 py-1 text-sm" />
          </div>
          <input placeholder="공식 (예: operatingIncome / totalRevenue * 100)" value={newMetric.formula} onChange={(e) => setNewMetric((p) => ({ ...p, formula: e.target.value }))} className="border rounded px-2 py-1 text-sm w-full mb-2" />
          <input placeholder="설명 (선택)" value={newMetric.description} onChange={(e) => setNewMetric((p) => ({ ...p, description: e.target.value }))} className="border rounded px-2 py-1 text-sm w-full mb-2" />
          <p className="text-xs text-gray-500 mb-2">사용 가능한 변수: price, eps, netIncome, totalRevenue, operatingIncome, equity, totalAssets, totalLiab, currentAssets, currentLiabilities</p>
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
              <div>
                <span className="font-medium text-gray-900">{m.name}</span>
                <span className="ml-2 text-xs text-gray-400">{m.description}</span>
              </div>
              <span className="font-mono text-gray-900">
                {value !== null ? `${formatNumber(value, { decimals: 2 })} ${m.unit}` : '-'}
              </span>
            </div>
          )
        })}
        {customMetrics.map((m) => {
          const value = evalFormula(m.formula, vars)
          return (
            <div key={m.id} className="flex items-center justify-between px-4 py-3 bg-purple-50">
              <div className="flex items-center gap-2">
                <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-600">커스텀</span>
                <span className="font-medium text-gray-900">{m.name}</span>
                {m.description && <span className="text-xs text-gray-400">{m.description}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-gray-900">
                  {value !== null ? `${formatNumber(value, { decimals: 2 })} ${m.unit}` : '-'}
                </span>
                <button onClick={() => handleDeleteMetric(m.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
