// ─── Brick Architecture ───────────────────────────────────────────────────────

export type BrickCategory = 'calculation' | 'chart' | 'research' | 'table' | 'alert'
export type BrickAuthor = 'system' | 'ai-agent' | 'user'
export type Market = 'KR' | 'US' | 'GLOBAL'

export interface BrickManifest {
  id: string
  name: string
  description: string
  version: string
  author: BrickAuthor
  category: BrickCategory
  dataRequired: string[]
  enabled: boolean
  createdAt: string
}

export interface BrickRegistryEntry {
  id: string
  enabled: boolean
  order: number
}

export interface BrickRegistry {
  bricks: BrickRegistryEntry[]
}

export interface BrickProps {
  ticker: string
  market: Market
  data?: Record<string, unknown>
}

// ─── Stock Data ───────────────────────────────────────────────────────────────

export interface StockQuote {
  ticker: string
  name: string
  price: number
  change: number
  changePercent: number
  marketCap: number | null
  /** Yahoo 등에서 올 때만; 없으면 EPS/PBR용으로 marketCap/price로 추정 */
  sharesOutstanding: number | null
  pe: number | null
  high52: number | null
  low52: number | null
  volume: number | null
  sector: string | null
  industry: string | null
  currency: string
  exchange: string
  market: Market
}

export interface StockSearchResult {
  ticker: string
  name: string
  exchange: string
  type: string
  market: Market
}

// ─── Financial Statements ─────────────────────────────────────────────────────

export interface FinancialRow {
  field: string
  label: string
  values: (number | null)[]
  unit: 'KRW' | 'USD' | 'percent' | 'ratio'
}

export interface FinancialStatement {
  type: 'income' | 'balance' | 'cashflow'
  period: 'annual' | 'quarterly'
  years: string[]
  rows: FinancialRow[]
}

/** Open DART `/dart?fs=` — 자동은 CFS 있으면 연결, 없으면 별도 */
export type DartFsRequestMode = 'auto' | 'cfs' | 'ofs'

export interface FinancialData {
  ticker: string
  market: Market
  annual: {
    income: FinancialStatement
    balance: FinancialStatement
    cashflow: FinancialStatement
  }
  quarterly: {
    income: FinancialStatement
    balance: FinancialStatement
    cashflow: FinancialStatement
  }
  /** KR `/api/stocks/.../dart` 응답에만 포함 */
  dartFs?: {
    requested: DartFsRequestMode
    applied: 'cfs' | 'ofs'
    cfsAvailable: boolean
    ofsAvailable: boolean
  }
}

// ─── News ─────────────────────────────────────────────────────────────────────

export type Sentiment = 'positive' | 'negative' | 'neutral'

export interface NewsItem {
  id: string
  date: string
  headline: string
  source: string
  url: string
  sentiment: Sentiment
  summary?: string
}

// ─── Metrics / Calculations ───────────────────────────────────────────────────

export interface BuiltinMetric {
  id: string
  name: string
  formula: string
  description: string
  unit: string
  readonly: true
}

export interface CustomMetric {
  id: string
  name: string
  formula: string
  description: string
  unit: string
  readonly?: false
  createdAt: string
}

export type Metric = BuiltinMetric | CustomMetric

export interface MetricResult {
  metric: Metric
  value: number | null
  error?: string
}

// ─── Macro Data ───────────────────────────────────────────────────────────────

export interface MacroDataPoint {
  date: string
  value: number | null
}

export interface MacroSeries {
  seriesId: string
  name: string
  description: string
  frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual'
  units: string
  data: MacroDataPoint[]
  source: string
}

export interface MacroQueryOptions {
  startDate?: string
  endDate?: string
  limit?: number
}

// ─── Brick Event Bus ──────────────────────────────────────────────────────────

/** metrics-calculator → interactive-chart 이벤트 payload */
export interface ChartRequestEventDetail {
  /** 이벤트 발신 ticker (수신 측 필터링용) */
  ticker: string
  metricId: string
  label: string
  series: { year: string; value: number | null }[]
  unit: string
}

// ─── Financial Period Variables ───────────────────────────────────────────────

/** 단일 시점의 재무 변수 묶음 — lib/financial-metrics.ts 계산 함수의 공통 입력 */
export interface FinancialPeriodVars {
  totalRevenue: number | null
  operatingIncome: number | null
  netIncome: number | null
  /** 손익 EBITDA 행(DART 등); 없으면 null */
  ebitda: number | null
  equity: number | null
  totalAssets: number | null
  totalLiab: number | null
  operatingCashFlow: number | null
  capex: number | null
  interestExpense: number | null
  accountsReceivable: number | null
  inventory: number | null
  accountsPayable: number | null
  dividendsPaid: number | null
  currentAssets: number | null
  currentLiabilities: number | null
}

// ─── Fundamental Metrics (기업 본질 파악 지표) ────────────────────────────────

export type FundamentalCategoryId =
  | 'moat-bankruptcy'   // 구조적 해자 & 파산 위험
  | 'growth'            // 미래 성장성
  | 'cash-generation'   // 현금창출능력
  | 'dividend-capacity' // 배당 여력

export interface FundamentalMetricDef {
  id: string
  name: string
  description: string
  category: FundamentalCategoryId
  unit: 'percent' | 'ratio' | 'days' | 'currency'
  /** FinancialPeriodVars를 받아 단일 값 반환하는 순수 계산 함수 */
  calc: (vars: FinancialPeriodVars) => number | null
}

export interface FundamentalMetricResult {
  id: string
  name: string
  description: string
  category: FundamentalCategoryId
  unit: 'percent' | 'ratio' | 'days' | 'currency'
  annualValue: number | null
  quarterlyValue: number | null
  /** 연간 YoY 변화율 (%) */
  annualYoY: number | null
  /** 분기 QoQ 변화율 (%) */
  quarterlyQoQ: number | null
  /** 분기 전년 동기 대비 YoY (%) */
  quarterlyYoY: number | null
}

// ─── Stock Validator (주식 검증 알고리즘) ─────────────────────────────────────

export type ValidationOperator = 'gte' | 'lte' | 'gt' | 'lt' | 'eq'

export interface ValidationStep {
  id: string
  name: string
  /** evalFormula에 전달되는 공식 (FinancialPeriodVars + price/shares/eps/pe/ebitda 변수 사용 가능) */
  formula: string
  threshold: number
  operator: ValidationOperator
  description: string
  /** true면 수식 미평가·점수 분모 제외(플랜 T2~T5 수동 절차) */
  manualOnly?: boolean
}

/** 분석 상태 머신 (가설 → 물리적 제약 → 논리 검증 → 최종 출력) */
export type AnalysisPhase = 'Hypothesis' | 'PhysicalConstraint' | 'LogicalVerify' | 'FinalOutput'

/** 종목 진입 시 검증 자동 실행 ([stock]/page 등) */
export interface ValidationAutoRunEventDetail {
  ticker: string
  market: Market
  /** 미지정 시 기본 알고리즘 ID 사용 */
  algorithmId?: string
}

export interface ValidationAlgorithm {
  id: string
  name: string
  description: string
  steps: ValidationStep[]
  createdAt: string
  updatedAt: string
}

export interface ValidationStepResult {
  step: ValidationStep
  actualValue: number | null
  /** manualOnly 단계는 null */
  passed: boolean | null
  error?: string
}

export interface ValidationRun {
  algorithmId: string
  ticker: string
  runAt: string
  stepResults: ValidationStepResult[]
  /** 통과 단계 수 / 전체 단계 수 (0~1); manualOnly 제외 */
  score: number
  /** 성공 시 전 구간 기록; 물리 제약 실패 시 중간까지 */
  phaseTrace?: AnalysisPhase[]
  /** PhysicalConstraint 등에서 중단 시 사유 */
  stopReason?: string
}

// ─── Quant Model (퀀트 투자 알고리즘) ────────────────────────────────────────

export type QuantFactorType = 'quantitative' | 'qualitative'
export type NormalizationMethod = 'minmax' | 'zscore' | 'raw'

export interface QuantFactor {
  id: string
  name: string
  type: QuantFactorType
  /** type === 'quantitative': FinancialPeriodVars 기반 공식 */
  formula?: string
  /** type === 'qualitative': 수동 입력값 (0–100) */
  manualValue?: number
  normalization: NormalizationMethod
  /** minmax 정규화용 예상 최솟값 */
  expectedMin?: number
  /** minmax 정규화용 예상 최댓값 */
  expectedMax?: number
  /** 가중치 (0–1, 모든 팩터 합계 = 1) */
  weight: number
  description: string
}

export interface QuantModel {
  id: string
  name: string
  description: string
  factors: QuantFactor[]
  createdAt: string
  updatedAt: string
}

export interface QuantFactorBreakdown {
  factorId: string
  rawValue: number | null
  normalizedValue: number | null
  weightedScore: number | null
}

export interface QuantScoreRecord {
  id: string
  modelId: string
  ticker: string
  scoredAt: string
  factorBreakdown: QuantFactorBreakdown[]
  /** 종합 점수 (0–100) */
  totalScore: number
  priceAtScoring: number | null
  /** 기록 이후 주가 수익률 (%) — 후행 계산 */
  priceReturnSince?: number | null
}

// ─── Price History ────────────────────────────────────────────────────────────

/** yahoo-finance2 `historical()` — 일·주·월 봉만 지원 */
export type PriceHistoryInterval = '1d' | '1wk' | '1mo'

export interface PriceHistoryPoint {
  date: string
  close: number
  /** 첫 데이터 포인트 대비 누적 수익률 (%) */
  cumulativeReturn: number
}

export interface PriceHistory {
  ticker: string
  period: '1y' | '2y' | '5y'
  interval: PriceHistoryInterval
  points: PriceHistoryPoint[]
}

// ─── Agent ────────────────────────────────────────────────────────────────────

export interface CreateBrickRequest {
  prompt: string
  ticker: string
  market: Market
}

export interface CreateBrickResponse {
  success: boolean
  brickId: string
  brickName: string
  error?: string
}

export interface DeleteBrickRequest {
  brickId: string
}

export interface UpdateRegistryRequest {
  brickId: string
  enabled?: boolean
  order?: number
}
