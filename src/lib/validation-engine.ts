import type {
  ValidationAlgorithm,
  ValidationOperator,
  ValidationRun,
  ValidationStepResult,
} from '@/types'
import { evalFormula } from '@/lib/financial-metrics'

/** 플랜 기본 검증 알고리즘 ID — `src/bricks/stock-validator/algorithms.json` */
export const DEFAULT_QUANTAMENTAL_ALGORITHM_ID = 'quantamental-5stage-v1'

const OPERATOR_FN: Record<ValidationOperator, (a: number, b: number) => boolean> = {
  gte: (a, b) => a >= b,
  lte: (a, b) => a <= b,
  gt:  (a, b) => a > b,
  lt:  (a, b) => a < b,
  eq:  (a, b) => Math.abs(a - b) < 1e-9,
}

/**
 * 단계별 공식 평가. manualOnly 단계는 passed=null.
 * score = (통과한 비수동 단계 수) / (비수동 단계 수)
 */
export function runValidation(
  algorithm: ValidationAlgorithm,
  vars: Record<string, number>
): ValidationRun {
  const stepResults: ValidationStepResult[] = algorithm.steps.map((step) => {
    if (step.manualOnly) {
      return { step, actualValue: null, passed: null }
    }
    const actualValue = evalFormula(step.formula, vars)
    if (actualValue === null) {
      return { step, actualValue: null, passed: false, error: '데이터 없음 또는 계산 불가' }
    }
    const passed = OPERATOR_FN[step.operator](actualValue, step.threshold)
    return { step, actualValue, passed }
  })

  const automated = stepResults.filter((r) => !r.step.manualOnly)
  const passedCount = automated.filter((r) => r.passed === true).length
  const score = automated.length > 0 ? passedCount / automated.length : 0

  return {
    algorithmId: algorithm.id,
    ticker: '',
    runAt: new Date().toISOString(),
    stepResults,
    score,
  }
}
