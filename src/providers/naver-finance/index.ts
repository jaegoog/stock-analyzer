import type { NewsItem } from '@/types'
import { guessSentiment } from '@/lib/utils'
import type { ProviderFactory, NewsProvider } from '../types'
import manifest from './manifest.json'

const newsProvider: NewsProvider = {
  async getNews(ticker) {
    const code = ticker.replace(/\.(KS|KQ)$/, '')
    const url = `https://finance.naver.com/item/news_news.naver?code=${code}&page=1&sm=title_entity_id.basic&clusterId=`

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ko-KR,ko;q=0.9' },
        next: { revalidate: 300 },
      })
      if (!res.ok) return []

      const html = await res.text()
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
  },
}

const provider: ProviderFactory = {
  manifest: manifest as ProviderFactory['manifest'],
  createNewsProvider: () => newsProvider,
}

export default provider
