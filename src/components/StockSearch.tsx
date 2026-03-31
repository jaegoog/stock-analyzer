'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { StockSearchResult } from '@/types'

export default function StockSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    if (!query.trim()) { setResults([]); return }

    debounce.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`)
        const data = (await res.json()) as { results: StockSearchResult[] }
        setResults(data.results ?? [])
        setOpen(true)
      } finally {
        setLoading(false)
      }
    }, 300)
  }, [query])

  const select = (ticker: string) => {
    setOpen(false)
    setQuery('')
    router.push(`/stock/${encodeURIComponent(ticker)}`)
  }

  return (
    <div className="relative w-full max-w-xl">
      <div className="flex items-center border border-gray-300 rounded-xl bg-white shadow-sm focus-within:ring-2 focus-within:ring-blue-300">
        <span className="pl-4 text-gray-400">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="기업명 또는 종목코드 검색 (예: 삼성전자, AAPL, 005930)"
          className="flex-1 px-3 py-3 bg-transparent focus:outline-none text-sm"
        />
        {loading && <div className="pr-4 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
          {results.map((r) => (
            <button
              key={r.ticker}
              onClick={() => select(r.ticker)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 truncate">{r.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex-shrink-0">{r.ticker}</span>
                </div>
                <div className="text-xs text-gray-400">{r.exchange} · {r.market === 'KR' ? '한국' : '미국'}</div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${r.market === 'KR' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                {r.market}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
