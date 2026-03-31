// ─── Brick Architecture ───────────────────────────────────────────────────────

export type BrickCategory = 'calculation' | 'chart' | 'research' | 'table' | 'alert'
export type BrickAuthor = 'system' | 'ai-agent' | 'user'
export type Market = 'KR' | 'US'

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
