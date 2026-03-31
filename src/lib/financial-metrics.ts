/**
 * financial-metrics.ts
 *
 * 재무 지표 계산 순수 함수 모음.
 * UI 의존성 없음 — 모든 함수는 입력 → 출력 변환만 수행한다.
 * 모든 Brick(fundamental-metrics, metrics-calculator, stock-validator, quant-model)이
 * 이 파일을 공유 계산 레이어로 사용한다.
 */

import type {
  FinancialData,
  FinancialPeriodVars,
  FinancialStatement,
  FundamentalCategoryId,
  FundamentalMetricDef,
  FundamentalMetricResult,
  NormalizationMethod,
  StockQuote,
} from '@/types'

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const DAYS_IN_YEAR = 365
const PCT = 100

// ─── 변화율 계산 ──────────────────────────────────────────────────────────────

/** 전기 대비 변화율 (%). 분모가 0이거나 null이면 null 반환 */
export function calcYoY(
  current: number | null,
  previous: number | null
): number | null {
  if (current === null || previous === null || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * PCT
}

export function calcQoQ(
  current: number | null,
  previous: number | null
): number | null {
  return calcYoY(current, previous)
}

// ─── 공식 평가 엔진 ───────────────────────────────────────────────────────────

/**
 * 문자열 수식을 평가하여 숫자를 반환한다.
 * stock-validator, quant-model, metrics-calculator에서 공통 사용.
 * 결과가 유한한 숫자가 아니면 null 반환.
 */
export function evalFormula(
  formula: string,
  vars: Record<string, number>
): number | null {
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

// ─── FinancialData → FinancialPeriodVars 변환 ─────────────────────────────────

/** FinancialStatement 행에서 특정 field의 i번째 값을 추출 */
function rowVal(
  statement: FinancialStatement | undefined,
  ...fieldCandidates: string[]
): (i: number) => number | null {
  if (!statement) return () => null
  const row = statement.rows.find((r) => fieldCandidates.includes(r.field))
  return (i: number) => row?.values[i] ?? null
}

/**
 * FinancialData의 특정 기간·인덱스에서 FinancialPeriodVars를 추출한다.
 * @param financials 재무 데이터
 * @param period     'annual' | 'quarterly'
 * @param index      0 = 최신, 1 = 이전 기간
 */
export function extractPeriodVars(
  financials: FinancialData,
  period: 'annual' | 'quarterly',
  index: number
): FinancialPeriodVars {
  const statements = financials[period]
  const income = statements.income
  const balance = statements.balance
  const cashflow = statements.cashflow

  const I = (stmt: FinancialStatement, ...fields: string[]) =>
    rowVal(stmt, ...fields)(index)

  return {
    totalRevenue:       I(income,   'totalRevenue'),
    operatingIncome:    I(income,   'operatingIncome', 'totalOperatingIncomeAsReported'),
    netIncome:          I(income,   'netIncome'),
    interestExpense:    I(income,   'interestExpense'),
    equity:             I(balance,  'totalEquity', 'totalEquityGrossMinorityInterest', 'totalStockholderEquity'),
    totalAssets:        I(balance,  'totalAssets'),
    totalLiab:          I(balance,  'totalLiab', 'totalLiabilitiesNetMinorityInterest'),
    accountsReceivable: I(balance,  'accountsReceivable'),
    inventory:          I(balance,  'inventory'),
    accountsPayable:    I(balance,  'accountsPayable'),
    operatingCashFlow:  I(cashflow, 'operatingCashFlow'),
    capex:              I(cashflow, 'capex', 'capitalExpenditure'),
    dividendsPaid:      I(cashflow, 'dividendsPaid', 'commonStockDividendPaid'),
  }
}

/**
 * 특정 기간의 모든 인덱스에 대한 FinancialPeriodVars 배열을 반환한다.
 * index 0 = 최신 기간부터 시작.
 */
export function extractPeriodVarsArray(
  financials: FinancialData,
  period: 'annual' | 'quarterly'
): FinancialPeriodVars[] {
  const length = financials[period].income.years.length
  return Array.from({ length }, (_, i) => extractPeriodVars(financials, period, i))
}

/**
 * 단일 최신 시점 vars + 주가/주식수/EPS를 포함하는 확장 vars.
 * metrics-calculator와 stock-validator에서 사용.
 */
export function extractLatestVarsWithQuote(
  financials: FinancialData | null,
  quote: StockQuote | null
): Record<string, number> {
  const base = financials
    ? extractPeriodVars(financials, 'annual', 0)
    : ({} as FinancialPeriodVars)

  const price = quote?.price ?? 0
  const pe    = quote?.pe ?? null
  const eps   = pe && price ? price / pe : 0
  const shares = (() => {
    if (!quote) return 0
    const direct = quote.sharesOutstanding
    if (direct != null && direct > 0 && Number.isFinite(direct)) return direct
    const cap = quote.marketCap
    if (cap != null && cap > 0 && price > 0) return cap / price
    return 0
  })()

  // null → 0 으로 변환 (evalFormula가 Record<string, number>를 요구)
  const toNum = (v: number | null) => v ?? 0

  return {
    price,
    eps,
    shares,
    totalRevenue:       toNum(base.totalRevenue),
    operatingIncome:    toNum(base.operatingIncome),
    netIncome:          toNum(base.netIncome),
    equity:             toNum(base.equity),
    totalAssets:        toNum(base.totalAssets),
    totalLiab:          toNum(base.totalLiab),
    operatingCashFlow:  toNum(base.operatingCashFlow),
    capex:              toNum(base.capex),
    interestExpense:    toNum(base.interestExpense),
    accountsReceivable: toNum(base.accountsReceivable),
    inventory:          toNum(base.inventory),
    accountsPayable:    toNum(base.accountsPayable),
    dividendsPaid:      toNum(base.dividendsPaid),
    currentAssets:      toNum(extractPeriodVars(financials ?? ({} as FinancialData), 'annual', 0).accountsReceivable), // fallback
    currentLiabilities: 0,
  }
}

// ─── 10개 본질 지표 정의 ──────────────────────────────────────────────────────

const safe = (a: number | null, b: number | null): [number, number] | null =>
  a !== null && b !== null && b !== 0 ? [a, b] : null

export const FUNDAMENTAL_METRIC_DEFS: FundamentalMetricDef[] = [
  // ── 구조적 해자 & 파산 위험 ─────────────────────────────────────────────────
  {
    id: 'roe',
    name: 'ROE',
    description: '자기자본이익률 — 자본 대비 순이익 창출 능력',
    category: 'moat-bankruptcy',
    unit: 'percent',
    calc: ({ netIncome, equity }) => {
      const p = safe(netIncome, equity)
      return p ? (p[0] / p[1]) * PCT : null
    },
  },
  {
    id: 'operating-margin',
    name: '영업이익률',
    description: '매출 대비 영업이익 비율 — 핵심 사업 수익성',
    category: 'moat-bankruptcy',
    unit: 'percent',
    calc: ({ operatingIncome, totalRevenue }) => {
      const p = safe(operatingIncome, totalRevenue)
      return p ? (p[0] / p[1]) * PCT : null
    },
  },
  {
    id: 'interest-coverage',
    name: '이자보상배율',
    description: '영업이익 ÷ 이자비용 — 파산 위험 핵심 지표 (1 미만 위험)',
    category: 'moat-bankruptcy',
    unit: 'ratio',
    calc: ({ operatingIncome, interestExpense }) => {
      const p = safe(operatingIncome, interestExpense)
      return p ? p[0] / p[1] : null
    },
  },
  {
    id: 'debt-ratio',
    name: '부채비율',
    description: '총부채 ÷ 자기자본 × 100 — 재무 레버리지',
    category: 'moat-bankruptcy',
    unit: 'percent',
    calc: ({ totalLiab, equity }) => {
      const p = safe(totalLiab, equity)
      return p ? (p[0] / p[1]) * PCT : null
    },
  },

  // ── 미래 성장성 ──────────────────────────────────────────────────────────────
  {
    id: 'operating-income-growth',
    name: '영업이익증가율',
    description: '전년 대비 영업이익 성장률 (YoY)',
    category: 'growth',
    unit: 'percent',
    /** 단일 기간 vars로는 계산 불가 — calcFundamentalMetrics에서 직접 처리 */
    calc: () => null,
  },
  {
    id: 'revenue-growth',
    name: '매출액증가율',
    description: '전년 대비 매출 성장률 (YoY)',
    category: 'growth',
    unit: 'percent',
    calc: () => null,
  },

  // ── 현금창출능력 ─────────────────────────────────────────────────────────────
  {
    id: 'fcf',
    name: 'FCF',
    description: '잉여현금흐름 = 영업현금흐름 − CAPEX',
    category: 'cash-generation',
    unit: 'currency',
    calc: ({ operatingCashFlow, capex }) => {
      if (operatingCashFlow === null) return null
      return operatingCashFlow - (capex ?? 0)
    },
  },
  {
    id: 'cash-conversion-cycle',
    name: '현금순환주기',
    description: '(매출채권 + 재고) ÷ 매출 × 365 − 매입채무 ÷ 매출 × 365',
    category: 'cash-generation',
    unit: 'days',
    calc: ({ accountsReceivable, inventory, accountsPayable, totalRevenue }) => {
      if (totalRevenue === null || totalRevenue === 0) return null
      const ar  = accountsReceivable ?? 0
      const inv = inventory          ?? 0
      const ap  = accountsPayable    ?? 0
      return ((ar + inv - ap) / totalRevenue) * DAYS_IN_YEAR
    },
  },

  // ── 배당 여력 ────────────────────────────────────────────────────────────────
  {
    id: 'retention-ratio',
    name: '유보율',
    description: '(순이익 − 배당금) ÷ 순이익 × 100 — 재투자 여력',
    category: 'dividend-capacity',
    unit: 'percent',
    calc: ({ netIncome, dividendsPaid }) => {
      if (netIncome === null || netIncome === 0) return null
      const div = Math.abs(dividendsPaid ?? 0)
      return ((netIncome - div) / Math.abs(netIncome)) * PCT
    },
  },
  {
    id: 'asset-turnover',
    name: '총자산회전율',
    description: '매출 ÷ 총자산 — 자산 활용 효율성',
    category: 'dividend-capacity',
    unit: 'ratio',
    calc: ({ totalRevenue, totalAssets }) => {
      const p = safe(totalRevenue, totalAssets)
      return p ? p[0] / p[1] : null
    },
  },
]

// ─── FundamentalMetricResult 계산 ─────────────────────────────────────────────

/**
 * FinancialData로부터 10개 본질 지표의 현재값, YoY, QoQ를 계산한다.
 */
export function calcFundamentalMetrics(
  financials: FinancialData
): FundamentalMetricResult[] {
  const annualVars     = extractPeriodVarsArray(financials, 'annual')
  const quarterlyVars  = extractPeriodVarsArray(financials, 'quarterly')

  return FUNDAMENTAL_METRIC_DEFS.map((def) => {
    // 성장률 지표는 단일 vars 계산 대신 YoY를 직접 사용
    const isGrowthMetric =
      def.id === 'operating-income-growth' || def.id === 'revenue-growth'

    const fieldKey: Record<string, keyof FinancialPeriodVars> = {
      'operating-income-growth': 'operatingIncome',
      'revenue-growth':          'totalRevenue',
    }

    let annualValue: number | null = null
    let annualYoY:   number | null = null

    if (isGrowthMetric) {
      const key = fieldKey[def.id]
      const v0  = annualVars[0]?.[key] ?? null
      const v1  = annualVars[1]?.[key] ?? null
      annualYoY  = calcYoY(v0 as number | null, v1 as number | null)
      annualValue = annualYoY  // 성장률 지표의 "현재값" = YoY 자체
    } else {
      annualValue = annualVars[0] ? def.calc(annualVars[0]) : null
      const prevAnnual = annualVars[1] ? def.calc(annualVars[1]) : null
      annualYoY = calcYoY(annualValue, prevAnnual)
    }

    let quarterlyValue: number | null = null
    let quarterlyQoQ:   number | null = null
    let quarterlyYoY:   number | null = null

    if (quarterlyVars.length > 0) {
      if (isGrowthMetric) {
        const key = fieldKey[def.id]
        const q0  = quarterlyVars[0]?.[key] ?? null
        const q1  = quarterlyVars[1]?.[key] ?? null
        const q4  = quarterlyVars[4]?.[key] ?? null
        quarterlyValue = calcYoY(q0 as number | null, q4 as number | null)
        quarterlyQoQ   = calcYoY(q0 as number | null, q1 as number | null)
        quarterlyYoY   = quarterlyValue
      } else {
        quarterlyValue = quarterlyVars[0] ? def.calc(quarterlyVars[0]) : null
        const prevQ    = quarterlyVars[1] ? def.calc(quarterlyVars[1]) : null
        const sameQLastYear = quarterlyVars[4] ? def.calc(quarterlyVars[4]) : null
        quarterlyQoQ = calcYoY(quarterlyValue, prevQ)
        quarterlyYoY = calcYoY(quarterlyValue, sameQLastYear)
      }
    }

    return {
      id:             def.id,
      name:           def.name,
      description:    def.description,
      category:       def.category as FundamentalCategoryId,
      unit:           def.unit,
      annualValue,
      quarterlyValue,
      annualYoY,
      quarterlyQoQ,
      quarterlyYoY,
    }
  })
}

// ─── 차트용 시계열 추출 ───────────────────────────────────────────────────────

/**
 * 특정 본질 지표의 연도별 시계열 데이터를 반환한다.
 * interactive-chart로 전송하는 ChartRequestEventDetail.series에 사용.
 */
export function calcMetricTimeSeries(
  financials: FinancialData,
  period: 'annual' | 'quarterly',
  metricId: string
): { year: string; value: number | null }[] {
  const def = FUNDAMENTAL_METRIC_DEFS.find((d) => d.id === metricId)
  if (!def) return []

  const statements = financials[period]
  const years      = statements.income.years
  const varsArray  = extractPeriodVarsArray(financials, period)

  return years.map((year, i) => ({
    year,
    value: varsArray[i] ? def.calc(varsArray[i]) : null,
  }))
}

// ─── 퀀트 모델 — 정규화 & 통계 ───────────────────────────────────────────────

/** 값을 [0, 100] 범위로 min-max 정규화 */
function normalizeMinMax(
  value: number,
  min: number,
  max: number
): number {
  if (max === min) return 50
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * PCT))
}

/** 값을 z-score 기반으로 [0, 100] 범위로 변환 (평균=50, 표준편차±2 → 0/100) */
function normalizeZScore(value: number, mean: number, std: number): number {
  if (std === 0) return 50
  const z = (value - mean) / std
  return Math.min(100, Math.max(0, (z / 4 + 0.5) * PCT))
}

/**
 * 팩터 값을 지정된 방법으로 0–100 스케일로 정규화한다.
 * @param allValues 동일 팩터의 모든 과거 값 (zscore 계산용)
 */
export function normalizeValue(
  value: number,
  method: NormalizationMethod,
  options?: {
    expectedMin?: number
    expectedMax?: number
    allValues?: number[]
  }
): number {
  switch (method) {
    case 'minmax': {
      const min = options?.expectedMin ?? 0
      const max = options?.expectedMax ?? 100
      return normalizeMinMax(value, min, max)
    }
    case 'zscore': {
      const vals = options?.allValues ?? [value]
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length
      const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length
      return normalizeZScore(value, mean, Math.sqrt(variance))
    }
    case 'raw':
    default:
      return Math.min(100, Math.max(0, value))
  }
}

/**
 * 피어슨 상관계수를 계산한다.
 * 데이터가 2개 미만이거나 분모가 0이면 null 반환.
 */
export function pearsonCorrelation(
  xs: number[],
  ys: number[]
): number | null {
  const n = xs.length
  if (n < 2 || n !== ys.length) return null

  const meanX = xs.reduce((s, x) => s + x, 0) / n
  const meanY = ys.reduce((s, y) => s + y, 0) / n

  let numerator = 0
  let denomX    = 0
  let denomY    = 0

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    numerator += dx * dy
    denomX    += dx * dx
    denomY    += dy * dy
  }

  const denom = Math.sqrt(denomX * denomY)
  return denom === 0 ? null : numerator / denom
}
