'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { StockSearchResult } from '@/types'
import { normalizeKRTicker } from '@/lib/utils'

export default function StockSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StockSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queryRef = useRef(query)
  queryRef.current = query

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current)
    const q = query.trim()
    if (!q) {
      setResults([])
      setSearchError(null)
      setOpen(false)
      return
    }

    debounce.current = setTimeout(async () => {
      setLoading(true)
      setSearchError(null)
      try {
        const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(q)}`)
        if (queryRef.current.trim() !== q) return

        const data = (await res.json()) as { results?: StockSearchResult[]; error?: string }
        if (!res.ok) {
          setResults([])
          setSearchError(data.error ?? '검색 요청에 실패했습니다.')
          setOpen(true)
          return
        }
        setResults(data.results ?? [])
        setOpen(true)
      } catch {
        if (queryRef.current.trim() !== q) return
        setResults([])
        setSearchError('네트워크 오류로 검색할 수 없습니다.')
        setOpen(true)
      } finally {
        if (queryRef.current.trim() === q) setLoading(false)
      }
    }, 300)
  }, [query])

  const select = (ticker: string) => {
    setOpen(false)
    setQuery('')
    setSearchError(null)
    router.push(`/stock/${encodeURIComponent(ticker)}`)
  }

  const tryDirectNavigate = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return false
    if (/^\d{6}$/.test(trimmed)) {
      select(normalizeKRTicker(trimmed))
      return true
    }
    if (/^[A-Za-z][A-Za-z0-9.-]*$/.test(trimmed)) {
      select(trimmed)
      return true
    }
    return false
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return

    if (results.length > 0) {
      const norm = normalizeKRTicker(trimmed)
      const hit = results.find(
        (r) =>
          r.ticker === trimmed ||
          r.ticker === norm ||
          r.ticker.toUpperCase() === trimmed.toUpperCase()
      )
      select(hit?.ticker ?? results[0].ticker)
      return
    }

    tryDirectNavigate(trimmed)
  }

  const showPanel = open && !loading && query.trim().length > 0
  const showEmptyHint = showPanel && results.length === 0 && !searchError
  const showResults = showPanel && results.length > 0

  return (
    <div className="relative w-full max-w-xl">
      <div className="flex items-center border border-gray-300 rounded-xl bg-white shadow-sm focus-within:ring-2 focus-within:ring-blue-300">
        <span className="pl-4 text-gray-400">🔍</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query.trim()) setOpen(true) }}
          placeholder="기업명 또는 종목코드 검색 (예: 삼성전자, AAPL, 005930)"
          className="flex-1 px-3 py-3 bg-transparent focus:outline-none text-sm"
        />
        {loading && <div className="pr-4 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
      </div>

      {showPanel && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden text-left">
          {searchError && (
            <div className="px-4 py-3 text-sm text-red-600">{searchError}</div>
          )}
          {showEmptyHint && (
            <div className="px-4 py-3 text-sm text-gray-600 space-y-2">
              <p>검색 결과가 없습니다.</p>
              <p className="text-xs text-gray-500">
                한국 종목은 <strong>6자리 코드</strong>(예: 005930) 입력 후 <strong>Enter</strong>로 이동할 수 있습니다.
                미국 종목은 티커(예: MSFT)를 입력 후 Enter로 시도해 보세요.
              </p>
            </div>
          )}
          {showResults &&
            results.map((r) => (
              <button
                key={r.ticker}
                type="button"
                onClick={() => select(r.ticker)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left border-t border-gray-100 first:border-t-0"
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
