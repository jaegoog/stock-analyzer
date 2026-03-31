'use client'
import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { detectMarket, normalizeKRTicker } from '@/lib/utils'
import StockOverview from '@/components/StockOverview'
import BrickRenderer from '@/components/BrickRenderer'
import BrickManager from '@/components/BrickManager'
import AgentPrompt from '@/components/AgentPrompt'
import type { Market, ValidationAutoRunEventDetail } from '@/types'

export default function StockPage() {
  const { ticker } = useParams<{ ticker: string }>()
  const decoded = decodeURIComponent(ticker)
  const symbol = normalizeKRTicker(decoded)
  const market: Market = detectMarket(symbol)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent<ValidationAutoRunEventDetail>('brick:validation-auto-run', {
          detail: { ticker: symbol, market },
        })
      )
    }, 150)
    return () => clearTimeout(timer)
  }, [symbol, market])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <a href="/" className="text-gray-500 hover:text-gray-900 text-sm">← 홈</a>
        <span className="text-gray-300">|</span>
        <span className="font-semibold text-gray-900">{symbol}</span>
        <span className={`text-xs px-2 py-0.5 rounded ${market === 'KR' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{market}</span>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* 메인 컬럼 */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <StockOverview ticker={symbol} />
            <BrickRenderer key={refreshKey} ticker={symbol} market={market} />
          </div>

          {/* 사이드바 */}
          <div className="w-72 flex-shrink-0 flex flex-col gap-4">
            <AgentPrompt
              ticker={symbol}
              market={market}
              onBrickCreated={() => setRefreshKey((k) => k + 1)}
            />
            <BrickManager onRefresh={() => setRefreshKey((k) => k + 1)} />
          </div>
        </div>
      </div>
    </div>
  )
}
