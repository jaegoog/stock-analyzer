'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type {
  BrickProps,
  FinancialData,
  PriceHistory,
  PriceHistoryInterval,
  QuantFactor,
  QuantFactorBreakdown,
  QuantFactorType,
  QuantModel,
  QuantScoreRecord,
  StockQuote,
} from '@/types'
import { evalFormula, extractLatestVarsWithQuote, normalizeValue, pearsonCorrelation } from '@/lib/financial-metrics'
import { formatNumber } from '@/lib/utils'

// ─── 탭 정의 ──────────────────────────────────────────────────────────────────

type TabId = 'edit' | 'score' | 'analysis'

const TABS: { id: TabId; label: string }[] = [
  { id: 'edit',     label: '모델 편집' },
  { id: 'score',    label: '점수 기록' },
  { id: 'analysis', label: '분석' },
]

const PRICE_INTERVALS: { id: PriceHistoryInterval; label: string }[] = [
  { id: '1d', label: '일봉' },
  { id: '1wk', label: '주봉' },
  { id: '1mo', label: '월봉' },
]

const PRICE_PERIODS: { id: '1y' | '2y' | '5y'; label: string }[] = [
  { id: '1y', label: '1년' },
  { id: '2y', label: '2년' },
  { id: '5y', label: '5년' },
]

// ─── 팩터 팩토리 ──────────────────────────────────────────────────────────────

const makeFactor = (type: QuantFactorType): QuantFactor => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  name: '', type, formula: '', manualValue: 50,
  normalization: 'minmax', expectedMin: 0, expectedMax: 100,
  weight: 0.1,
  description: '',
})

const makeModel = (): QuantModel => ({
  id: Date.now().toString(),
  name: '새 모델', description: '', factors: [],
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
})

// ─── 점수 계산 ────────────────────────────────────────────────────────────────

function calcScore(
  model: QuantModel,
  vars: Record<string, number>
): { breakdown: QuantFactorBreakdown[]; totalScore: number } {
  const breakdown: QuantFactorBreakdown[] = model.factors.map((f) => {
    const rawValue = f.type === 'qualitative'
      ? (f.manualValue ?? null)
      : evalFormula(f.formula ?? '', vars)

    const normalizedValue = rawValue === null ? null : normalizeValue(rawValue, f.normalization, {
      expectedMin: f.expectedMin,
      expectedMax: f.expectedMax,
    })

    const weightedScore = normalizedValue === null ? null : normalizedValue * f.weight

    return { factorId: f.id, rawValue, normalizedValue, weightedScore }
  })

  const totalWeights = model.factors.reduce((s, f) => s + f.weight, 0)
  const weightedSum  = breakdown.reduce((s, b) => s + (b.weightedScore ?? 0), 0)
  const totalScore   = totalWeights > 0 ? (weightedSum / totalWeights) : 0

  return { breakdown, totalScore }
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function QuantModelBrick({ ticker, market }: BrickProps) {
  const [quote,       setQuote]       = useState<StockQuote | null>(null)
  const [financials,  setFinancials]  = useState<FinancialData | null>(null)
  const [models,      setModels]      = useState<QuantModel[]>([])
  const [scoreHistory,setScoreHistory]= useState<QuantScoreRecord[]>([])
  const [priceHistory,setPriceHistory]= useState<PriceHistory | null>(null)
  const [priceInterval, setPriceInterval] = useState<PriceHistoryInterval>('1mo')
  const [pricePeriod, setPricePeriod] = useState<'1y' | '2y' | '5y'>('2y')
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false)
  const [priceHistoryError, setPriceHistoryError] = useState<string | null>(null)
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [editing,     setEditing]     = useState<QuantModel | null>(null)
  const [tab,         setTab]         = useState<TabId>('edit')

  // ── 데이터 fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    const endpoint = market === 'KR'
      ? `/api/stocks/${encodeURIComponent(ticker)}/dart`
      : `/api/stocks/${encodeURIComponent(ticker)}/financials`

    fetch(`/api/stocks/${encodeURIComponent(ticker)}`).then((r) => r.json()).then((j) => setQuote(j as StockQuote))
    fetch(endpoint).then((r) => r.json()).then((j) => setFinancials(j as FinancialData))
    fetch(`/api/bricks/quant-model/models`).then((r) => r.ok ? r.json() : []).then((d: QuantModel[]) => {
      setModels(d)
      if (d.length > 0) setSelectedId(d[0].id)
    })
  }, [ticker, market])

  useEffect(() => {
    if (!selectedId) return
    fetch(`/api/bricks/quant-model/scores?ticker=${encodeURIComponent(ticker)}&modelId=${selectedId}`)
      .then((r) => r.ok ? r.json() : [])
      .then((d: QuantScoreRecord[]) => setScoreHistory(d))
  }, [ticker, selectedId])

  // 분석 탭: 기간·봉 간격 바뀔 때 Yahoo 주가 시계열 재조회
  useEffect(() => {
    if (tab !== 'analysis') return
    setPriceHistoryLoading(true)
    setPriceHistoryError(null)
    const q = new URLSearchParams({ period: pricePeriod, interval: priceInterval })
    fetch(`/api/stocks/${encodeURIComponent(ticker)}/price-history?${q}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({})) as PriceHistory & { error?: string }
        if (!r.ok) {
          setPriceHistory(null)
          setPriceHistoryError(data.error ?? '주가 데이터를 불러오지 못했습니다.')
          return
        }
        setPriceHistory(data)
        setPriceHistoryError(null)
      })
      .catch(() => {
        setPriceHistory(null)
        setPriceHistoryError('주가 데이터를 불러오지 못했습니다.')
      })
      .finally(() => setPriceHistoryLoading(false))
  }, [tab, ticker, priceInterval, pricePeriod])

  const selectedModel = models.find((m) => m.id === selectedId) ?? null
  const vars = useMemo(() => extractLatestVarsWithQuote(financials, quote), [financials, quote])

  // ── 모델 저장 ────────────────────────────────────────────────────────────
  const saveModels = useCallback((updated: QuantModel[]) => {
    setModels(updated)
    fetch('/api/bricks/quant-model/models', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated),
    })
  }, [])

  const handleNewModel = () => {
    const m = makeModel()
    setEditing({ ...m })
    setSelectedId(m.id)
  }

  const handleSaveEditing = () => {
    if (!editing) return
    const now = new Date().toISOString()
    const updated = models.some((m) => m.id === editing.id)
      ? models.map((m) => m.id === editing.id ? { ...editing, updatedAt: now } : m)
      : [...models, { ...editing, updatedAt: now }]
    saveModels(updated)
    setEditing(null)
  }

  const handleDeleteModel = () => {
    if (!selectedId) return
    const updated = models.filter((m) => m.id !== selectedId)
    saveModels(updated)
    setSelectedId(updated[0]?.id ?? null)
    setEditing(null)
  }

  // ── 점수 기록 ────────────────────────────────────────────────────────────
  const handleRecordScore = () => {
    if (!selectedModel) return
    const { breakdown, totalScore } = calcScore(selectedModel, vars)
    const record: QuantScoreRecord = {
      id: Date.now().toString(),
      modelId: selectedModel.id,
      ticker,
      scoredAt: new Date().toISOString(),
      factorBreakdown: breakdown,
      totalScore,
      priceAtScoring: quote?.price ?? null,
    }
    setScoreHistory((prev) => [...prev, record])
    fetch('/api/bricks/quant-model/scores', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record),
    })
  }

  // ── 팩터 편집 헬퍼 ──────────────────────────────────────────────────────
  const updateFactor = (factorId: string, patch: Partial<QuantFactor>) => {
    if (!editing) return
    setEditing({ ...editing, factors: editing.factors.map((f) => f.id === factorId ? { ...f, ...patch } : f) })
  }
  const addFactor = (type: QuantFactorType) => {
    if (!editing) return
    setEditing({ ...editing, factors: [...editing.factors, makeFactor(type)] })
  }
  const removeFactor = (factorId: string) => {
    if (!editing) return
    setEditing({ ...editing, factors: editing.factors.filter((f) => f.id !== factorId) })
  }

  // ── 분석: 점수 기록 vs 주가 수익률 차트 데이터 ─────────────────────────
  const analysisChartData = useMemo(() => {
    if (!priceHistory || scoreHistory.length === 0) return []
    return scoreHistory.map((record) => {
      const date = record.scoredAt.split('T')[0]
      const pricePoint = priceHistory.points.find((p) => p.date >= date)
      return {
        date,
        score: record.totalScore,
        return: pricePoint?.cumulativeReturn ?? null,
      }
    })
  }, [priceHistory, scoreHistory])

  const correlation = useMemo(() => {
    const xs = analysisChartData.map((d) => d.score)
    const ys = analysisChartData.map((d) => d.return).filter((v): v is number => v !== null)
    if (xs.length !== ys.length || xs.length < 2) return null
    return pearsonCorrelation(xs, ys)
  }, [analysisChartData])

  const priceSeriesChartData = useMemo(() => {
    if (!priceHistory?.points.length) return []
    return priceHistory.points.map((p) => ({
      date: p.date,
      close: p.close,
      cumulativeReturn: p.cumulativeReturn,
    }))
  }, [priceHistory])

  // ── 점수 탭: 현재 점수 계산 ──────────────────────────────────────────────
  const currentScore = useMemo(() => {
    if (!selectedModel || selectedModel.factors.length === 0) return null
    return calcScore(selectedModel, vars)
  }, [selectedModel, vars])

  // ── 가중치 합계 경고 ────────────────────────────────────────────────────
  const totalWeight = editing?.factors.reduce((s, f) => s + f.weight, 0) ?? 0
  const weightWarning = Math.abs(totalWeight - 1) > 0.01

  // ── 렌더링 ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">퀀트 투자 모델</h2>
        <div className="flex gap-2 items-center">
          {models.length > 0 && (
            <select
              value={selectedId ?? ''}
              onChange={(e) => { setSelectedId(e.target.value); setEditing(null) }}
              className="border rounded px-2 py-1 text-sm"
            >
              {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )}
          <button onClick={handleNewModel} className="text-sm px-3 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100">+ 새 모델</button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium ${tab === t.id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 모델 편집 탭 ───────────────────────────────────────────────── */}
      {tab === 'edit' && (
        <div className="p-4">
          {!editing && !selectedModel && (
            <p className="text-center text-gray-400 text-sm py-8">모델이 없습니다. [+ 새 모델]을 눌러 시작하세요.</p>
          )}

          {!editing && selectedModel && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-medium text-gray-900">{selectedModel.name}</div>
                  <div className="text-xs text-gray-500">{selectedModel.description}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing({ ...selectedModel, factors: selectedModel.factors.map((f) => ({ ...f })) })} className="text-sm px-2 py-1 border rounded text-gray-600 hover:bg-gray-50">편집</button>
                  <button onClick={handleDeleteModel} className="text-sm px-2 py-1 border rounded text-red-400 hover:bg-red-50">삭제</button>
                </div>
              </div>
              {selectedModel.factors.length === 0 && <p className="text-sm text-gray-400">팩터가 없습니다. [편집]을 눌러 팩터를 추가하세요.</p>}
              {selectedModel.factors.map((f) => (
                <div key={f.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <span className={`text-xs px-1.5 py-0.5 rounded mr-2 ${f.type === 'quantitative' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                      {f.type === 'quantitative' ? '정량' : '정성'}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{f.name}</span>
                    {f.description && <span className="text-xs text-gray-400 ml-2">{f.description}</span>}
                  </div>
                  <span className="text-xs text-gray-500">가중치 {(f.weight * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          )}

          {editing && (
            <div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <input
                  placeholder="모델 이름" value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="border rounded px-2 py-1 text-sm col-span-2"
                />
                <input
                  placeholder="설명 (선택)" value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="border rounded px-2 py-1 text-sm col-span-2"
                />
              </div>

              {weightWarning && (
                <div className="mb-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-700">
                  ⚠ 가중치 합계: {(totalWeight * 100).toFixed(0)}% (100%가 권장됩니다)
                </div>
              )}

              <div className="space-y-2 mb-3">
                {editing.factors.map((f) => (
                  <div key={f.id} className="bg-gray-50 rounded border p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${f.type === 'quantitative' ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                        {f.type === 'quantitative' ? '정량' : '정성'}
                      </span>
                      <button onClick={() => removeFactor(f.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <input
                        placeholder="팩터 이름" value={f.name}
                        onChange={(e) => updateFactor(f.id, { name: e.target.value })}
                        className="border rounded px-2 py-1 text-xs"
                      />
                      <input
                        placeholder="설명 (선택)" value={f.description}
                        onChange={(e) => updateFactor(f.id, { description: e.target.value })}
                        className="border rounded px-2 py-1 text-xs"
                      />
                    </div>
                    {f.type === 'quantitative' ? (
                      <input
                        placeholder="공식 (예: roe / 100)" value={f.formula ?? ''}
                        onChange={(e) => updateFactor(f.id, { formula: e.target.value })}
                        className="border rounded px-2 py-1 text-xs w-full mb-2"
                      />
                    ) : (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-gray-500">점수 (0–100):</span>
                        <input
                          type="number" min={0} max={100} value={f.manualValue ?? 50}
                          onChange={(e) => updateFactor(f.id, { manualValue: Number(e.target.value) })}
                          className="border rounded px-2 py-1 text-xs w-20"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-2">
                      <select
                        value={f.normalization}
                        onChange={(e) => updateFactor(f.id, { normalization: e.target.value as QuantFactor['normalization'] })}
                        className="border rounded px-2 py-1 text-xs col-span-1"
                      >
                        <option value="minmax">MinMax</option>
                        <option value="zscore">Z-Score</option>
                        <option value="raw">Raw</option>
                      </select>
                      {f.normalization === 'minmax' && (
                        <>
                          <input
                            type="number" placeholder="최솟값" value={f.expectedMin ?? 0}
                            onChange={(e) => updateFactor(f.id, { expectedMin: Number(e.target.value) })}
                            className="border rounded px-2 py-1 text-xs"
                          />
                          <input
                            type="number" placeholder="최댓값" value={f.expectedMax ?? 100}
                            onChange={(e) => updateFactor(f.id, { expectedMax: Number(e.target.value) })}
                            className="border rounded px-2 py-1 text-xs"
                          />
                        </>
                      )}
                      <div className="flex items-center gap-1 col-span-1">
                        <span className="text-xs text-gray-500">가중:</span>
                        <input
                          type="number" min={0} max={1} step={0.05} value={f.weight}
                          onChange={(e) => updateFactor(f.id, { weight: Number(e.target.value) })}
                          className="border rounded px-2 py-1 text-xs w-16"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 flex-wrap mb-3">
                <button onClick={() => addFactor('quantitative')} className="text-xs px-2 py-1 border rounded text-blue-600 hover:bg-blue-50">+ 정량 팩터</button>
                <button onClick={() => addFactor('qualitative')} className="text-xs px-2 py-1 border rounded text-orange-600 hover:bg-orange-50">+ 정성 팩터</button>
              </div>

              <p className="text-xs text-gray-400 mb-3">
                정량 팩터 변수: price, eps, netIncome, totalRevenue, operatingIncome, equity,
                totalAssets, totalLiab, operatingCashFlow, capex, interestExpense
              </p>

              <div className="flex gap-2">
                <button onClick={handleSaveEditing} className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">저장</button>
                <button onClick={() => setEditing(null)} className="text-sm px-3 py-1 border rounded text-gray-600">취소</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 점수 기록 탭 ────────────────────────────────────────────────── */}
      {tab === 'score' && (
        <div className="p-4">
          {!selectedModel || selectedModel.factors.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">모델을 먼저 생성하고 팩터를 추가하세요.</p>
          ) : (
            <>
              {currentScore && (
                <>
                  {/* 종합 점수 게이지 */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>종합 점수</span>
                        <span>{currentScore.totalScore.toFixed(1)}점</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-3">
                        <div
                          className="h-3 rounded-full transition-all"
                          style={{
                            width: `${currentScore.totalScore}%`,
                            backgroundColor: currentScore.totalScore >= 70 ? '#10b981' : currentScore.totalScore >= 40 ? '#f59e0b' : '#ef4444',
                          }}
                        />
                      </div>
                    </div>
                    <div
                      className="text-3xl font-bold w-16 text-right"
                      style={{ color: currentScore.totalScore >= 70 ? '#10b981' : currentScore.totalScore >= 40 ? '#f59e0b' : '#ef4444' }}
                    >
                      {currentScore.totalScore.toFixed(0)}
                    </div>
                  </div>

                  {/* 팩터별 기여도 */}
                  <div className="space-y-2 mb-4">
                    {selectedModel.factors.map((f) => {
                      const b = currentScore.breakdown.find((bd) => bd.factorId === f.id)
                      return (
                        <div key={f.id} className="flex items-center gap-3">
                          <div className="w-24 text-xs text-gray-600 truncate">{f.name}</div>
                          <div className="flex-1 bg-gray-100 rounded-full h-2">
                            <div
                              className="h-2 rounded-full bg-blue-400"
                              style={{ width: `${b?.normalizedValue ?? 0}%` }}
                            />
                          </div>
                          <div className="w-12 text-right text-xs font-mono text-gray-700">
                            {b?.normalizedValue !== null ? `${(b?.normalizedValue ?? 0).toFixed(0)}` : '-'}
                          </div>
                          <div className="w-16 text-right text-xs text-gray-400">
                            raw: {b?.rawValue !== null ? formatNumber(b?.rawValue ?? 0, { decimals: 2 }) : '-'}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <button
                    onClick={handleRecordScore}
                    className="w-full py-2 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                  >
                    📌 오늘 점수 기록 ({new Date().toLocaleDateString('ko-KR')})
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* ── 분석 탭 ─────────────────────────────────────────────────────── */}
      {tab === 'analysis' && (
        <div className="p-4 space-y-6">
          <div>
            <h3 className="text-sm font-medium text-gray-800 mb-2">장기 시세 (Yahoo)</h3>
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="text-xs text-gray-500 self-center mr-1">봉:</span>
              {PRICE_INTERVALS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPriceInterval(id)}
                  className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                    priceInterval === id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
              <span className="text-xs text-gray-500 self-center ml-3 mr-1">기간:</span>
              {PRICE_PERIODS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPricePeriod(id)}
                  className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                    pricePeriod === id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {priceHistoryLoading && (
              <p className="text-xs text-gray-400 py-4">주가 데이터 로딩 중…</p>
            )}
            {priceHistoryError && !priceHistoryLoading && (
              <p className="text-sm text-red-600 py-2">{priceHistoryError}</p>
            )}
            {!priceHistoryLoading && !priceHistoryError && priceSeriesChartData.length > 0 && (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={priceSeriesChartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={32} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => formatNumber(v, { decimals: v >= 1000 ? 0 : 2, compact: true })}
                  />
                  <Tooltip
                    formatter={(val: unknown) => [
                      formatNumber(val as number, { decimals: 2, currency: quote?.currency }),
                      '종가',
                    ]}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="close" name="종가" stroke="#0d9488" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {scoreHistory.length < 2 ? (
            <p className="text-center text-gray-400 text-sm py-4 border-t border-gray-100">
              점수를 2회 이상 기록하면 점수·주가 수익률 상관 분석 차트를 볼 수 있습니다.
            </p>
          ) : (
            <>
              {correlation !== null && (
                <div className="px-3 py-2 bg-gray-50 rounded border text-sm">
                  피어슨 상관계수 (점수 ↔ 주가 수익률):{' '}
                  <span className={`font-bold ${Math.abs(correlation) > 0.5 ? 'text-green-600' : 'text-gray-500'}`}>
                    r = {correlation.toFixed(3)}
                  </span>
                  {Math.abs(correlation) > 0.7 && <span className="ml-2 text-xs text-green-600">강한 상관관계</span>}
                </div>
              )}

              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={analysisChartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="score" domain={[0, 100]} tick={{ fontSize: 11 }} label={{ value: '점수', angle: -90, position: 'insideLeft', fontSize: 11 }} />
                  <YAxis yAxisId="return" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v.toFixed(0)}%`} label={{ value: '수익률', angle: 90, position: 'insideRight', fontSize: 11 }} />
                  <Tooltip
                    formatter={(val: unknown, name: unknown) => [
                        name === 'score' ? `${(val as number).toFixed(1)}점` : `${(val as number).toFixed(1)}%`,
                        name === 'score' ? '종합 점수' : '누적 수익률',
                    ] as [string, string]}
                  />
                  <Legend />
                  <Line yAxisId="score"  type="monotone" dataKey="score"  name="종합 점수"    stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
                  <Line yAxisId="return" type="monotone" dataKey="return" name="주가 수익률(%)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 4 }} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      )}
    </div>
  )
}
