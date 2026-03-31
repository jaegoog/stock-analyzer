'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  AnalysisPhase,
  BrickProps,
  FinancialData,
  StockQuote,
  ValidationAlgorithm,
  ValidationAutoRunEventDetail,
  ValidationOperator,
  ValidationRun,
  ValidationStep,
} from '@/types'
import { extractLatestVarsWithQuote, hasFinancialPeriodData } from '@/lib/financial-metrics'
import {
  DEFAULT_QUANTAMENTAL_ALGORITHM_ID,
  runValidation,
} from '@/lib/validation-engine'
import { normalizeKRTicker } from '@/lib/utils'

const OPERATOR_LABEL: Record<ValidationOperator, string> = {
  gte: '≥', lte: '≤', gt: '>', lt: '<', eq: '=',
}

const PHASE_LABEL: Record<AnalysisPhase, string> = {
  Hypothesis: '가설 설정',
  PhysicalConstraint: '물리적 제약 확인',
  LogicalVerify: '논리 검증',
  FinalOutput: '최종 출력',
}

/** 상태 머신: 물리 제약(재무 존재) 후에만 논리 검증 실행 */
function executeRunWithStateMachine(
  algorithm: ValidationAlgorithm,
  financials: FinancialData | null,
  quote: StockQuote | null,
  ticker: string
): ValidationRun {
  const phaseTrace: AnalysisPhase[] = ['Hypothesis']

  if (!financials || !hasFinancialPeriodData(financials, 'annual')) {
    phaseTrace.push('PhysicalConstraint')
    return {
      algorithmId: algorithm.id,
      ticker,
      runAt: new Date().toISOString(),
      stepResults: [],
      score: 0,
      phaseTrace,
      stopReason: '연간 재무 데이터 없음 — 논리 검증 생략',
    }
  }

  phaseTrace.push('PhysicalConstraint')
  const vars = extractLatestVarsWithQuote(financials, quote)
  phaseTrace.push('LogicalVerify')
  const base = runValidation(algorithm, vars)
  phaseTrace.push('FinalOutput')
  return { ...base, ticker, phaseTrace }
}

const makeStep = (): ValidationStep => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  name: '', formula: '', threshold: 0, operator: 'gte', description: '', manualOnly: false,
})

const makeAlgorithm = (): ValidationAlgorithm => ({
  id: Date.now().toString(),
  name: '새 알고리즘',
  description: '',
  steps: [makeStep()],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

export default function StockValidatorBrick({ ticker, market }: BrickProps) {
  const [quote, setQuote] = useState<StockQuote | null>(null)
  const [financials, setFinancials] = useState<FinancialData | null>(null)
  const [algorithms, setAlgorithms] = useState<ValidationAlgorithm[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ValidationAlgorithm | null>(null)
  const [runResult, setRunResult] = useState<ValidationRun | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [pendingAutoRun, setPendingAutoRun] = useState(false)
  const pendingAlgoIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    setRunResult(null)
  }, [ticker])

  useEffect(() => {
    const endpoint = market === 'KR'
      ? `/api/stocks/${encodeURIComponent(ticker)}/dart`
      : `/api/stocks/${encodeURIComponent(ticker)}/financials`

    fetch(`/api/stocks/${encodeURIComponent(ticker)}`).then((r) => r.json()).then((j) => setQuote(j as StockQuote))
    fetch(endpoint).then((r) => r.json()).then((j) => setFinancials(j as FinancialData))
    fetch('/api/bricks/stock-validator/algorithms')
      .then((r) => (r.ok ? r.json() : []))
      .then((d: ValidationAlgorithm[]) => {
        setAlgorithms(d)
        if (d.length === 0) {
          setSelectedId(null)
          return
        }
        setSelectedId((prev) => {
          if (prev && d.some((a) => a.id === prev)) return prev
          const pref = d.find((a) => a.id === DEFAULT_QUANTAMENTAL_ALGORITHM_ID)
          return pref?.id ?? d[0].id
        })
      })
      .catch(() => {})
  }, [ticker, market])

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<ValidationAutoRunEventDetail>).detail
      if (d.ticker !== ticker || d.market !== market) return
      pendingAlgoIdRef.current = d.algorithmId
      setPendingAutoRun(true)
    }
    window.addEventListener('brick:validation-auto-run', handler)
    return () => window.removeEventListener('brick:validation-auto-run', handler)
  }, [ticker, market])

  useEffect(() => {
    if (!pendingAutoRun || !financials || algorithms.length === 0 || !quote) return
    if (normalizeKRTicker(financials.ticker) !== normalizeKRTicker(ticker)) return
    if (normalizeKRTicker(quote.ticker) !== normalizeKRTicker(ticker)) return

    const wantId = pendingAlgoIdRef.current ?? DEFAULT_QUANTAMENTAL_ALGORITHM_ID
    pendingAlgoIdRef.current = undefined
    const alg = algorithms.find((a) => a.id === wantId) ?? algorithms[0]
    if (!alg) {
      setPendingAutoRun(false)
      return
    }
    setSelectedId(alg.id)
    setRunResult(executeRunWithStateMachine(alg, financials, quote, ticker))
    setPendingAutoRun(false)
  }, [pendingAutoRun, financials, algorithms, quote, ticker])

  const selectedAlgorithm = algorithms.find((a) => a.id === selectedId) ?? null

  const saveAlgorithms = useCallback((updated: ValidationAlgorithm[]) => {
    setAlgorithms(updated)
    fetch('/api/bricks/stock-validator/algorithms', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
  }, [])

  const handleNewAlgorithm = () => {
    const a = makeAlgorithm()
    setEditing({ ...a })
    setIsEditorOpen(true)
  }

  const handleEditAlgorithm = () => {
    if (!selectedAlgorithm) return
    setEditing({ ...selectedAlgorithm, steps: selectedAlgorithm.steps.map((s) => ({ ...s })) })
    setIsEditorOpen(true)
  }

  const handleDeleteAlgorithm = () => {
    if (!selectedId) return
    const updated = algorithms.filter((a) => a.id !== selectedId)
    saveAlgorithms(updated)
    setSelectedId(updated[0]?.id ?? null)
    setRunResult(null)
  }

  const handleSaveEditing = () => {
    if (!editing || !editing.name.trim()) return
    const now = new Date().toISOString()
    const updated = editing.id && algorithms.some((a) => a.id === editing.id)
      ? algorithms.map((a) => (a.id === editing.id ? { ...editing, updatedAt: now } : a))
      : [...algorithms, { ...editing, updatedAt: now }]
    saveAlgorithms(updated)
    setSelectedId(editing.id)
    setIsEditorOpen(false)
    setEditing(null)
    setRunResult(null)
  }

  const handleRun = () => {
    if (!selectedAlgorithm || !financials) return
    setRunResult(executeRunWithStateMachine(selectedAlgorithm, financials, quote, ticker))
  }

  const updateStep = (stepId: string, patch: Partial<ValidationStep>) => {
    if (!editing) return
    setEditing({ ...editing, steps: editing.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)) })
  }

  const addStep = () => {
    if (!editing) return
    setEditing({ ...editing, steps: [...editing.steps, makeStep()] })
  }

  const removeStep = (stepId: string) => {
    if (!editing) return
    setEditing({ ...editing, steps: editing.steps.filter((s) => s.id !== stepId) })
  }

  const automatedCount = runResult
    ? runResult.stepResults.filter((r) => !r.step.manualOnly).length
    : 0
  const automatedPassed = runResult
    ? runResult.stepResults.filter((r) => !r.step.manualOnly && r.passed === true).length
    : 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">주식 검증 알고리즘</h2>
        <button
          type="button"
          onClick={handleNewAlgorithm}
          className="text-sm px-3 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
        >
          + 새 알고리즘
        </button>
      </div>

      {algorithms.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100 flex gap-2 items-center flex-wrap">
          <select
            value={selectedId ?? ''}
            onChange={(e) => {
              setSelectedId(e.target.value)
              setRunResult(null)
            }}
            className="border rounded px-2 py-1 text-sm flex-1 min-w-0"
          >
            {algorithms.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button type="button" onClick={handleEditAlgorithm} className="text-sm px-2 py-1 border rounded text-gray-600 hover:bg-gray-50">편집</button>
          <button type="button" onClick={handleDeleteAlgorithm} className="text-sm px-2 py-1 border rounded text-red-400 hover:bg-red-50">삭제</button>
          <button
            type="button"
            onClick={handleRun}
            disabled={!financials}
            className="text-sm px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-40"
          >
            ▶ 검증 실행
          </button>
        </div>
      )}

      {algorithms.length === 0 && !isEditorOpen && (
        <div className="px-4 py-8 text-center text-gray-400 text-sm">
          알고리즘이 없습니다. [+ 새 알고리즘]을 눌러 첫 번째 알고리즘을 만들어보세요.
        </div>
      )}

      {isEditorOpen && editing && (
        <div className="px-4 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <input
              placeholder="알고리즘 이름"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              className="border rounded px-2 py-1 text-sm col-span-2"
            />
            <input
              placeholder="설명 (선택)"
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              className="border rounded px-2 py-1 text-sm col-span-2"
            />
          </div>

          <div className="space-y-2 mb-3">
            {editing.steps.map((step, idx) => (
              <div key={step.id} className="bg-white rounded border border-gray-200 p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-500">단계 {idx + 1}</span>
                  <button type="button" onClick={() => removeStep(step.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                </div>
                <label className="flex items-center gap-2 text-xs text-gray-600 mb-2">
                  <input
                    type="checkbox"
                    checked={!!step.manualOnly}
                    onChange={(e) => updateStep(step.id, { manualOnly: e.target.checked })}
                  />
                  수동 절차만(점수 제외)
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <input
                    placeholder="단계 이름"
                    value={step.name}
                    onChange={(e) => updateStep(step.id, { name: e.target.value })}
                    className="border rounded px-2 py-1 text-xs"
                  />
                  <input
                    placeholder="설명 (선택)"
                    value={step.description}
                    onChange={(e) => updateStep(step.id, { description: e.target.value })}
                    className="border rounded px-2 py-1 text-xs"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    placeholder="공식"
                    value={step.formula}
                    onChange={(e) => updateStep(step.id, { formula: e.target.value })}
                    className="border rounded px-2 py-1 text-xs col-span-1"
                  />
                  <select
                    value={step.operator}
                    onChange={(e) => updateStep(step.id, { operator: e.target.value as ValidationOperator })}
                    className="border rounded px-2 py-1 text-xs"
                  >
                    {(Object.keys(OPERATOR_LABEL) as ValidationOperator[]).map((op) => (
                      <option key={op} value={op}>{OPERATOR_LABEL[op]}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="기준값"
                    value={step.threshold}
                    onChange={(e) => updateStep(step.id, { threshold: Number(e.target.value) })}
                    className="border rounded px-2 py-1 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400 mb-3">
            변수: price, eps, shares, pe, ebitda, netIncome, totalRevenue, operatingIncome, equity,
            totalAssets, totalLiab, operatingCashFlow, capex, interestExpense,
            accountsReceivable, inventory, accountsPayable, dividendsPaid, currentAssets, currentLiabilities
          </p>

          <div className="flex gap-2">
            <button type="button" onClick={addStep} className="text-sm px-3 py-1 border rounded text-blue-600 hover:bg-blue-50">+ 단계 추가</button>
            <button type="button" onClick={handleSaveEditing} className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">저장</button>
            <button type="button" onClick={() => { setIsEditorOpen(false); setEditing(null) }} className="text-sm px-3 py-1 border rounded text-gray-600">취소</button>
          </div>
        </div>
      )}

      {runResult && (
        <div className="p-4">
          {runResult.phaseTrace && runResult.phaseTrace.length > 0 && (
            <div className="mb-4 p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs text-slate-700">
              <div className="font-medium text-slate-800 mb-2">분석 상태 머신</div>
              <ol className="flex flex-wrap gap-2 list-none p-0 m-0">
                {runResult.phaseTrace.map((ph, i) => (
                  <li key={`${ph}-${i}`} className="flex items-center gap-1">
                    {i > 0 && <span className="text-slate-400">→</span>}
                    <span className="px-2 py-0.5 rounded bg-white border border-slate-200">{PHASE_LABEL[ph]}</span>
                  </li>
                ))}
              </ol>
              {runResult.stopReason && (
                <p className="mt-2 text-amber-700">{runResult.stopReason}</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-700 mb-1">
                자동 검증: {automatedPassed} / {automatedCount} 통과
                {runResult.stepResults.some((r) => r.step.manualOnly) && (
                  <span className="text-gray-400 font-normal ml-2">(수동 단계는 점수 제외)</span>
                )}
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${runResult.score * 100}%`,
                    backgroundColor: runResult.score >= 0.8 ? '#10b981' : runResult.score >= 0.5 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
            </div>
            <div
              className="text-2xl font-bold"
              style={{ color: runResult.score >= 0.8 ? '#10b981' : runResult.score >= 0.5 ? '#f59e0b' : '#ef4444' }}
            >
              {automatedCount > 0 ? Math.round(runResult.score * 100) : '—'}점
            </div>
          </div>

          <div className="space-y-2">
            {runResult.stepResults.map((r, idx) => {
              const manual = r.step.manualOnly
              const ok = r.passed === true
              const rowCls = manual
                ? 'bg-slate-50 border border-slate-100'
                : ok
                  ? 'bg-green-50 border border-green-100'
                  : 'bg-red-50 border border-red-100'
              return (
                <div key={r.step.id} className={`flex items-start gap-3 p-3 rounded-lg ${rowCls}`}>
                  <span className="text-lg shrink-0 pt-0.5">
                    {manual ? '📋' : ok ? '✅' : '❌'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">
                      {idx + 1}. {r.step.name || r.step.formula}
                    </div>
                    {!manual && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        조건: {r.step.formula} {OPERATOR_LABEL[r.step.operator]} {r.step.threshold}
                      </div>
                    )}
                    {r.step.description && (
                      <div className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{r.step.description}</div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-sm font-medium text-gray-900">
                      {r.actualValue !== null ? r.actualValue.toFixed(2) : manual ? '—' : '-'}
                    </div>
                    {r.error && <div className="text-xs text-red-400">{r.error}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
