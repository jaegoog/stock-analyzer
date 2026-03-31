import { NextRequest, NextResponse } from 'next/server'
import { detectMarket, normalizeKRTicker } from '@/lib/utils'
import type { NewsItem, Sentiment } from '@/types'

const POSITIVE_WORDS = ['상승', '급등', '호실적', '성장', '매수', 'beat', 'surge', 'record', 'growth', 'profit']
const NEGATIVE_WORDS = ['하락', '급락', '손실', '감소', '매도', 'miss', 'decline', 'loss', 'cut', 'warning']

function guessSentiment(text: string): Sentiment {
  const lower = text.toLowerCase()
  const pos = POSITIVE_WORDS.filter((w) => lower.includes(w)).length
  const neg = NEGATIVE_WORDS.filter((w) => lower.includes(w)).length
  if (pos > neg) return 'positive'
  if (neg > pos) return 'negative'
  return 'neutral'
}

async function fetchFinnhubNews(symbol: string): Promise<NewsItem[]> {
  const key = process.env.FINNHUB_API_KEY
  if (!key) return []

  const to = new Date().toISOString().split('T')[0]
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${to}&token=${key}`
  const res = await fetch(url, { next: { revalidate: 300 } })
  if (!res.ok) return []

  const data = (await res.json()) as Array<{
    id?: number
    datetime: number
    headline: string
    source: string
    url: string
    summary?: string
  }>

  return data.slice(0, 30).map((item) => ({
    id: String(item.id ?? item.datetime),
    date: new Date(item.datetime * 1000).toISOString().split('T')[0],
    headline: item.headline,
    source: item.source,
    url: item.url,
    sentiment: guessSentiment(item.headline + ' ' + (item.summary ?? '')),
    summary: item.summary,
  }))
}

async function fetchNaverNews(ticker: string): Promise<NewsItem[]> {
  // 6자리 종목코드에서 회사명 추출은 야후에서 가져오거나 ticker 그대로 사용
  const code = ticker.replace(/\.(KS|KQ)$/, '')
  const url = `https://finance.naver.com/item/news_news.naver?code=${code}&page=1&sm=title_entity_id.basic&clusterId=`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko-KR,ko;q=0.9' },
      next: { revalidate: 300 },
    })
    if (!res.ok) return []

    const html = await res.text()
    // Parse news items from Naver Finance HTML table
    const { load } = await import('cheerio')
    const $ = load(html)
    const items: NewsItem[] = []

    $('table.type5 tbody tr').each((_, row) => {
      const titleEl = $(row).find('td.title a')
      const dateEl = $(row).find('td.date')
      const sourceEl = $(row).find('td.info')

      const headline = titleEl.text().trim()
      const href = titleEl.attr('href') ?? ''
      const date = dateEl.text().trim().split(' ')[0] ?? ''
      const source = sourceEl.text().trim()

      if (headline && href) {
        const fullUrl = href.startsWith('http') ? href : `https://finance.naver.com${href}`
        items.push({
          id: fullUrl,
          date: date.replace(/\./g, '-'),
          headline,
          source,
          url: fullUrl,
          sentiment: guessSentiment(headline),
        })
      }
    })

    return items.slice(0, 30)
  } catch {
    return []
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params
  const symbol = normalizeKRTicker(decodeURIComponent(ticker))
  const market = detectMarket(symbol)

  try {
    const news = market === 'KR'
      ? await fetchNaverNews(symbol)
      : await fetchFinnhubNews(symbol)

    return NextResponse.json({ news })
  } catch (error) {
    console.error('[news]', error)
    return NextResponse.json({ news: [], error: 'Failed to fetch news' }, { status: 500 })
  }
}
