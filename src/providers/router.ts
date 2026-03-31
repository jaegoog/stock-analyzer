import { resolveProvider } from './provider-registry'
import type { ProviderFactory, PriceProvider, FinancialsProvider, NewsProvider, MacroProvider } from './types'
import type { Market } from '@/types'

type DataType = 'price' | 'financials' | 'news' | 'macro'

async function loadProvider(providerId: string): Promise<ProviderFactory> {
  // Next.js 서버 사이드 동적 import
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import(`./${providerId}/index`) as { default: ProviderFactory }
  return mod.default
}

export async function getPriceProvider(market: Market): Promise<PriceProvider | null> {
  const id = resolveProvider(market, 'price' as DataType)
  if (!id) return null
  const factory = await loadProvider(id)
  return factory.createPriceProvider?.() ?? null
}

export async function getFinancialsProvider(market: Market): Promise<FinancialsProvider | null> {
  const id = resolveProvider(market, 'financials' as DataType)
  if (!id) return null
  const factory = await loadProvider(id)
  return factory.createFinancialsProvider?.() ?? null
}

export async function getNewsProvider(market: Market): Promise<NewsProvider | null> {
  const id = resolveProvider(market, 'news' as DataType)
  if (!id) return null
  const factory = await loadProvider(id)
  return factory.createNewsProvider?.() ?? null
}

export async function getMacroProvider(market: Market): Promise<MacroProvider | null> {
  const id = resolveProvider(market, 'macro' as DataType)
  if (!id) return null
  const factory = await loadProvider(id)
  return factory.createMacroProvider?.() ?? null
}
