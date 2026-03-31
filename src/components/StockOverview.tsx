'use client'
import { useState, useEffect } from 'react'
import type { StockQuote } from '@/types'
import { formatNumber, formatPercent } from '@/lib/utils'

export default function StockOverview({ ticker }: { ticker: string }) {
  const [data, setData] = useState<StockQuote | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/stocks/${encodeURIComponent(ticker)}`)
      .then((r) => r.json())
      .then((d: StockQuote) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [ticker])

  if (loading) return <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-400">로딩 중...</div>
  if (!data) return null

  const isUp = data.change >= 0
  const currency = data.market === 'KR' ? 'KRW' : 'USD'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
            <span className="text-sm px-2 py-0.5 rounded bg-gray-100 text-gray-500">{data.ticker}</span>
            <span className={`text-xs px-2 py-0.5 rounded ${data.market === 'KR' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
              {data.exchange}
            </span>
          </div>
          {data.sector && <p className="text-sm text-gray-500">{data.sector} · {data.industry}</p>}
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-gray-900">{formatNumber(data.price, { currency })}</p>
          <p className={`text-lg font-medium ${isUp ? 'text-green-600' : 'text-red-600'}`}>
            {isUp ? '▲' : '▼'} {formatNumber(Math.abs(data.change), { currency })} ({formatPercent(data.changePercent)})
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: '시가총액', value: data.marketCap ? formatNumber(data.marketCap, { currency, compact: true }) : '-' },
          { label: 'P/E', value: data.pe ? data.pe.toFixed(2) : '-' },
          { label: '52주 최고', value: data.high52 ? formatNumber(data.high52, { currency }) : '-' },
          { label: '52주 최저', value: data.low52 ? formatNumber(data.low52, { currency }) : '-' },
        ].map((item) => (
          <div key={item.label} className="bg-gray-50 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className="text-sm font-semibold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
