import fs from 'fs'
import path from 'path'
import type { ProviderRegistry, ProviderManifest, ProviderRegistryEntry, DataType } from './types'
import type { Market } from '@/types'

const PROVIDERS_DIR = path.join(process.cwd(), 'src', 'providers')
const REGISTRY_PATH = path.join(PROVIDERS_DIR, 'registry.json')

export function readProviderRegistry(): ProviderRegistry {
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8')
  return JSON.parse(raw) as ProviderRegistry
}

export function writeProviderRegistry(registry: ProviderRegistry): void {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8')
}

export function readProviderManifest(providerId: string): ProviderManifest | null {
  const manifestPath = path.join(PROVIDERS_DIR, providerId, 'manifest.json')
  if (!fs.existsSync(manifestPath)) return null
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as ProviderManifest
}

export function getAllProviders(): (ProviderRegistryEntry & { manifest: ProviderManifest | null })[] {
  const registry = readProviderRegistry()
  return registry.providers.map((entry) => ({
    ...entry,
    manifest: readProviderManifest(entry.id),
  }))
}

export function updateProviderInRegistry(
  providerId: string,
  update: Partial<Pick<ProviderRegistryEntry, 'enabled' | 'priority'>>
): void {
  const registry = readProviderRegistry()
  const entry = registry.providers.find((p) => p.id === providerId)
  if (entry) {
    Object.assign(entry, update)
    writeProviderRegistry(registry)
  }
}

/**
 * market + dataType 조합에 맞는 최우선 provider ID를 반환한다.
 * priority 값이 낮을수록 우선 선택된다.
 */
export function resolveProvider(market: Market, dataType: DataType): string | null {
  const registry = readProviderRegistry()
  const key = `${market}:${dataType}`

  const candidates = registry.providers
    .filter((p) => p.enabled && p.priority[key] !== undefined)
    .sort((a, b) => (a.priority[key] ?? 999) - (b.priority[key] ?? 999))

  return candidates[0]?.id ?? null
}
