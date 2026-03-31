import type {
  Market,
  StockQuote,
  StockSearchResult,
  FinancialData,
  NewsItem,
  MacroSeries,
  MacroQueryOptions,
} from '@/types'

export type DataType = 'price' | 'financials' | 'news' | 'macro' | 'search'
export type ProviderAuthor = 'system' | 'user' | 'community'

// ─── manifest.json 스키마 ────────────────────────────────────────────────────

export interface ProviderManifest {
  id: string
  name: string
  description: string
  version: string
  author: ProviderAuthor
  markets: Market[]
  dataTypes: DataType[]
  requiresApiKey: boolean
  apiKeyEnvVar?: string
  enabled: boolean
  createdAt: string
  homepage?: string
}

// ─── registry.json 스키마 ────────────────────────────────────────────────────

export interface ProviderRegistryEntry {
  id: string
  enabled: boolean
  /** key: "US:financials" — 낮은 숫자가 우선 선택됨 */
  priority: Record<string, number>
}

export interface ProviderRegistry {
  providers: ProviderRegistryEntry[]
}

// ─── 데이터타입별 Provider 인터페이스 ────────────────────────────────────────

export interface PriceProvider {
  getQuote(ticker: string, market: Market): Promise<StockQuote>
  search?(query: string): Promise<StockSearchResult[]>
}

export interface FinancialsProvider {
  getFinancials(ticker: string, market: Market): Promise<FinancialData>
}

export interface NewsProvider {
  getNews(ticker: string, market: Market): Promise<NewsItem[]>
}

export interface MacroProvider {
  getMacroSeries(seriesId: string, opts?: MacroQueryOptions): Promise<MacroSeries>
}

// ─── Provider 팩토리 — 각 provider/index.ts의 default export ─────────────────

export interface ProviderFactory {
  manifest: ProviderManifest
  createPriceProvider?(): PriceProvider
  createFinancialsProvider?(): FinancialsProvider
  createNewsProvider?(): NewsProvider
  createMacroProvider?(): MacroProvider
}
