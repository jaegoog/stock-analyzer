'use client'
import { useState, useEffect } from 'react'
import type { BrickProps, NewsItem, Sentiment } from '@/types'

const SENTIMENT_STYLE: Record<Sentiment, string> = {
  positive: 'bg-green-100 text-green-700',
  negative: 'bg-red-100 text-red-700',
  neutral: 'bg-gray-100 text-gray-600',
}
const SENTIMENT_LABEL: Record<Sentiment, string> = {
  positive: '긍정',
  negative: '부정',
  neutral: '중립',
}

export default function NewsBrick({ ticker, market }: BrickProps) {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | Sentiment>('all')
  const [page, setPage] = useState(1)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/stocks/${encodeURIComponent(ticker)}/news`)
      .then((r) => r.json())
      .then((d: { news: NewsItem[] }) => { setNews(d.news ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [ticker])

  const filtered = filter === 'all' ? news : news.filter((n) => n.sentiment === filter)
  const pageSize = 10
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)
  const totalPages = Math.ceil(filtered.length / pageSize)

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">관련 뉴스</h2>
        <span className="text-xs text-gray-400">{market === 'KR' ? '네이버 금융' : 'Finnhub'}</span>
      </div>
      <div className="flex gap-1 px-4 py-2 border-b border-gray-100">
        {(['all', 'positive', 'negative', 'neutral'] as const).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1) }}
            className={`px-2 py-0.5 rounded text-xs ${filter === f ? 'bg-gray-800 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            {f === 'all' ? '전체' : SENTIMENT_LABEL[f]}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="p-6 text-center text-gray-400">로딩 중...</div>
      ) : paged.length === 0 ? (
        <div className="p-6 text-center text-gray-400">뉴스가 없습니다.</div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {paged.map((item) => (
            <li key={item.id} className="px-4 py-3 hover:bg-gray-50">
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 flex-shrink-0 text-xs px-1.5 py-0.5 rounded ${SENTIMENT_STYLE[item.sentiment]}`}>
                    {SENTIMENT_LABEL[item.sentiment]}
                  </span>
                  <span className="text-sm text-gray-900 hover:text-blue-600 leading-snug">{item.headline}</span>
                </div>
                <div className="mt-1 text-xs text-gray-400 flex gap-2 ml-10">
                  <span>{item.date}</span>
                  <span>·</span>
                  <span>{item.source}</span>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
      {totalPages > 1 && (
        <div className="flex justify-center gap-1 px-4 py-3 border-t border-gray-100">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-7 h-7 rounded text-sm ${page === p ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
