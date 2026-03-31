'use client'
import { useState, useEffect, useCallback } from 'react'
import type {
  BrickProps,
  FinancialData,
  StockQuote,
  ValidationAlgorithm,
  ValidationOperator,
  ValidationRun,
  ValidationStep,
  ValidationStepResult,
} from '@/types'
import { evalFormula, extractLatestVarsWithQuote } from '@/lib/financial-metrics'

// ─── 검증 실행 엔진 ───────────────────────────────────────────────────────────

const OPERATOR_FN: Record<ValidationOperator, (a: number, b: number) => boolean> = {
  gte: (a, b) => a >= b,
  lte: (a, b) => a <= b,
  gt:  (a, b) => a > b,
  lt:  (a, b) => a < b,
  eq:  (a, b) => Math.abs(a - b) < 1e-9,
}

const OPERATOR_LABEL: Record<ValidationOperator, string> = {
  gte: '≥', lte: '≤', gt: '>', lt: '<', eq: '=',
}

function runValidation(
  algorithm: ValidationAlgorithm,
  vars: Record<string, number>
): ValidationRun {
  const stepResults: ValidationStepResult[] = algorithm.steps.map((step) => {
    const actualValue = evalFormula(step.formula, vars)
    if (actualValue === null) {
      return { step, actualValue: null, passed: false, error: '데이터 없음 또는 계산 불가' }
    }
    const passed = OPERATOR_FN[step.operator](actualValue, step.threshold)
    return { step, actualValue, passed }
  })

  const passedCount = stepResults.filter((r) => r.passed).length
  return {
    algorithmId: algorithm.id,
    ticker: '',
    runAt: new Date().toISOString(),
    stepResults,
    score: algorithm.steps.length > 0 ? passedCount / algorithm.steps.length : 0,
  }
}

// ─── 빈 알고리즘/단계 팩토리 ─────────────────────────────────────────────────

const makeStep = (): ValidationStep => ({
  id: Date.now().toString() + Math.random().toString(36).slice(2),
  name: '', formula: '', threshold: 0, operator: 'gte', description: '',
})

const makeAlgorithm = (): ValidationAlgorithm => ({
  id: Date.now().toString(),
  name: '새 알고리즘',
  description: '',
  steps: [makeStep()],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
})

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function StockValidatorBrick({ ticker, market }: BrickProps) {
  const [quote,       setQuote]       = useState<StockQuote | null>(null)
  const [financials,  setFinancials]  = useState<FinancialData | null>(null)
  const [algorithms,  setAlgorithms]  = useState<ValidationAlgorithm[]>([])
  const [selectedId,  setSelectedId]  = useState<string | null>(null)
  const [editing,     setEditing]     = useState<ValidationAlgorithm | null>(null)
  const [runResult,   setRunResult]   = useState<ValidationRun | null>(null)
  const [isEditorOpen, setIsEditorOpen] = useState(false)

  // ── 데이터 fetch ────────────────────────────────────────────────────────
  useEffect(() => {
    const endpoint = market === 'KR'
      ? `/api/stocks/${encodeURIComponent(ticker)}/dart`
      : `/api/stocks/${encodeURIComponent(ticker)}/financials`

    fetch(`/api/stocks/${encodeURIComponent(ticker)}`).then((r) => r.json()).then((j) => setQuote(j as StockQuote))
    fetch(endpoint).then((r) => r.json()).then((j) => setFinancials(j as FinancialData))
    fetch('/api/bricks/stock-validator/algorithms')
      .then((r) => r.ok ? r.json() : [])
      .then((d: ValidationAlgorithm[]) => {
        setAlgorithms(d)
        if (d.length > 0 && !selectedId) setSelectedId(d[0].id)
      })
      .catch(() => {})
  }, [ticker, market])

  const selectedAlgorithm = algorithms.find((a) => a.id === selectedId) ?? null

  // ── 알고리즘 저장 ────────────────────────────────────────────────────────
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
      ? algorithms.map((a) => a.id === editing.id ? { ...editing, updatedAt: now } : a)
      : [...algorithms, { ...editing, updatedAt: now }]
    saveAlgorithms(updated)
    setSelectedId(editing.id)
    setIsEditorOpen(false)
    setEditing(null)
    setRunResult(null)
  }

  // ── 검증 실행 ────────────────────────────────────────────────────────────
  const handleRun = () => {
    if (!selectedAlgorithm || !financials) return
    const vars = extractLatestVarsWithQuote(financials, quote)
    const result = runValidation(selectedAlgorithm, vars)
    setRunResult({ ...result, ticker })
  }

  // ── 단계 편집 헬퍼 ──────────────────────────────────────────────────────
  const updateStep = (stepId: string, patch: Partial<ValidationStep>) => {
    if (!editing) return
    setEditing({ ...editing, steps: editing.steps.map((s) => s.id === stepId ? { ...s, ...patch } : s) })
  }

  const addStep = () => {
    if (!editing) return
    setEditing({ ...editing, steps: [...editing.steps, makeStep()] })
  }

  const removeStep = (stepId: string) => {
    if (!editing) return
    setEditing({ ...editing, steps: editing.steps.filter((s) => s.id !== stepId) })
  }

  // ── 렌더링 ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">주식 검증 알고리즘</h2>
        <button onClick={handleNewAlgorithm} className="text-sm px-3 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100">
          + 새 알고리즘
        </button>
      </div>

      {/* 알고리즘 선택 및 실행 */}
      {algorithms.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-100 flex gap-2 items-center flex-wrap">
          <select
            value={selectedId ?? ''}
            onChange={(e) => { setSelectedId(e.target.value); setRunResult(null) }}
            className="border rounded px-2 py-1 text-sm flex-1 min-w-0"
          >
            {algorithms.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
          <button onClick={handleEditAlgorithm} className="text-sm px-2 py-1 border rounded text-gray-600 hover:bg-gray-50">편집</button>
          <button onClick={handleDeleteAlgorithm} className="text-sm px-2 py-1 border rounded text-red-400 hover:bg-red-50">삭제</button>
          <button
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

      {/* 알고리즘 편집기 */}
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
                  <button onClick={() => removeStep(step.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                </div>
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
                    placeholder="공식 (예: roe)"
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
            사용 가능한 변수: price, eps, shares, netIncome, totalRevenue, operatingIncome,
            equity, totalAssets, totalLiab, operatingCashFlow, capex, interestExpense
          </p>

          <div className="flex gap-2">
            <button onClick={addStep} className="text-sm px-3 py-1 border rounded text-blue-600 hover:bg-blue-50">+ 단계 추가</button>
            <button onClick={handleSaveEditing} className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">저장</button>
            <button onClick={() => { setIsEditorOpen(false); setEditing(null) }} className="text-sm px-3 py-1 border rounded text-gray-600">취소</button>
          </div>
        </div>
      )}

      {/* 검증 결과 */}
      {runResult && (
        <div className="p-4">
          {/* 종합 점수 */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-700 mb-1">
                종합 점수: {runResult.stepResults.filter((r) => r.passed).length} / {runResult.stepResults.length} 통과
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
              {Math.round(runResult.score * 100)}점
            </div>
          </div>

          {/* 단계별 결과 */}
          <div className="space-y-2">
            {runResult.stepResults.map((r, idx) => (
              <div key={r.step.id} className={`flex items-center gap-3 p-3 rounded-lg ${r.passed ? 'bg-green-50 border border-green-100' : 'bg-red-50 border border-red-100'}`}>
                <span className="text-lg shrink-0">{r.passed ? '✅' : '❌'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900">
                    {idx + 1}. {r.step.name || r.step.formula}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    조건: {r.step.formula} {OPERATOR_LABEL[r.step.operator]} {r.step.threshold}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-sm font-medium text-gray-900">
                    {r.actualValue !== null ? r.actualValue.toFixed(2) : '-'}
                  </div>
                  {r.error && <div className="text-xs text-red-400">{r.error}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
