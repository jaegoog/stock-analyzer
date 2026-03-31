import StockSearch from '@/components/StockSearch'

const QUICK_PICKS = [
  { ticker: '005930.KS', name: '삼성전자', market: 'KR' },
  { ticker: '000660.KS', name: 'SK하이닉스', market: 'KR' },
  { ticker: 'AAPL', name: 'Apple', market: 'US' },
  { ticker: 'NVDA', name: 'NVIDIA', market: 'US' },
  { ticker: 'TSLA', name: 'Tesla', market: 'US' },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl text-center mb-10">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">📈 주식 분석 도구</h1>
        <p className="text-gray-500">재무제표 · 차트 · 지표 · AI 기능 생성</p>
      </div>
      <div className="w-full max-w-2xl">
        <StockSearch />
      </div>
      <div className="mt-8">
        <p className="text-xs text-gray-400 text-center mb-3">빠른 검색</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {QUICK_PICKS.map((p) => (
            <a
              key={p.ticker}
              href={`/stock/${encodeURIComponent(p.ticker)}`}
              className={`px-3 py-1.5 rounded-full text-sm border ${p.market === 'KR' ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-blue-200 text-blue-700 hover:bg-blue-50'}`}
            >
              {p.name}
            </a>
          ))}
        </div>
      </div>
    </main>
  )
}
