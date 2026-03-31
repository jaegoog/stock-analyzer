'use client'
import { useEffect, useState } from 'react'
import type { ProviderRegistryEntry, ProviderManifest } from '@/providers/types'

interface ProviderWithMeta extends ProviderRegistryEntry {
  manifest: ProviderManifest | null
}

const DATA_TYPE_LABEL: Record<string, string> = {
  price: '시세',
  financials: '재무제표',
  news: '뉴스',
  macro: '거시경제',
  search: '검색',
}

const MARKET_LABEL: Record<string, string> = {
  US: '미국',
  KR: '한국',
  GLOBAL: '글로벌',
}

export default function ProviderManager() {
  const [providers, setProviders] = useState<ProviderWithMeta[]>([])

  const load = () => {
    fetch('/api/providers/registry')
      .then((r) => r.json())
      .then(async (data: { providers: ProviderWithMeta[] }) => {
        setProviders(data.providers ?? [])
      })
  }

  useEffect(() => { load() }, [])

  const toggle = async (providerId: string, enabled: boolean) => {
    await fetch('/api/providers/registry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId, enabled }),
    })
    load()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm">데이터 소스</h3>
      </div>
      <ul className="divide-y divide-gray-100">
        {providers.map((p) => {
          const manifest = p.manifest
          const hasApiKey = !manifest?.requiresApiKey || !!manifest.apiKeyEnvVar
          return (
            <li key={p.id} className="flex items-center gap-2 px-4 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {manifest?.name ?? p.id}
                  </span>
                  {manifest?.dataTypes.map((dt) => (
                    <span key={dt} className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 flex-shrink-0">
                      {DATA_TYPE_LABEL[dt] ?? dt}
                    </span>
                  ))}
                  {manifest?.markets.map((m) => (
                    <span key={m} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex-shrink-0">
                      {MARKET_LABEL[m] ?? m}
                    </span>
                  ))}
                  {manifest?.requiresApiKey && !hasApiKey && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-600 flex-shrink-0">
                      API키 필요
                    </span>
                  )}
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => toggle(p.id, e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
