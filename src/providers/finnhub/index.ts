import type { NewsItem } from '@/types'
import { guessSentiment } from '@/lib/utils'
import type { ProviderFactory, NewsProvider } from '../types'
import manifest from './manifest.json'

const newsProvider: NewsProvider = {
  async getNews(ticker) {
    const key = process.env.FINNHUB_API_KEY
    if (!key) return []

    const to = new Date().toISOString().split('T')[0]
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const url = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${key}`
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

    return data.slice(0, 30).map((item): NewsItem => ({
      id: String(item.id ?? item.datetime),
      date: new Date(item.datetime * 1000).toISOString().split('T')[0],
      headline: item.headline,
      source: item.source,
      url: item.url,
      sentiment: guessSentiment(item.headline + ' ' + (item.summary ?? '')),
      summary: item.summary,
    }))
  },
}

const provider: ProviderFactory = {
  manifest: manifest as ProviderFactory['manifest'],
  createNewsProvider: () => newsProvider,
}

export default provider
