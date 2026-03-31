import type { MacroSeries, MacroQueryOptions } from '@/types'
import type { ProviderFactory, MacroProvider } from '../types'
import manifest from './manifest.json'

// ECOS API: https://ecos.bok.or.kr/api/
// API 키 발급: https://ecos.bok.or.kr/#/AuthKeyApply
// 예시 시리즈: 722Y001 (기준금리), 731Y003 (원/달러 환율)

const macroProvider: MacroProvider = {
  async getMacroSeries(seriesId: string, opts?: MacroQueryOptions): Promise<MacroSeries> {
    const key = process.env.ECOS_API_KEY
    if (!key) throw new Error('ECOS_API_KEY not configured. https://ecos.bok.or.kr/#/AuthKeyApply 에서 무료 발급')

    const startDate = opts?.startDate?.replace(/-/g, '') ?? '20100101'
    const endDate = opts?.endDate?.replace(/-/g, '') ?? new Date().toISOString().split('T')[0].replace(/-/g, '')

    // ECOS StatisticSearch: /key/format/lang/startNo/endNo/statCode/cycle/startDate/endDate/itemCode
    const url = `https://ecos.bok.or.kr/api/StatisticSearch/${key}/json/kr/1/1000/${seriesId}/M/${startDate}/${endDate}`

    const res = await fetch(url, { next: { revalidate: 3600 } })
    if (!res.ok) throw new Error(`ECOS API 오류: ${seriesId}`)

    const json = await res.json() as {
      StatisticSearch?: {
        row?: Array<{ TIME: string; DATA_VALUE: string; ITEM_NAME1: string; UNIT_NAME: string }>
      }
    }

    const rows = json.StatisticSearch?.row ?? []
    const meta = rows[0]

    return {
      seriesId,
      name: meta?.ITEM_NAME1 ?? seriesId,
      description: '',
      frequency: 'monthly',
      units: meta?.UNIT_NAME ?? '',
      source: 'ECOS',
      data: rows.map((r) => ({
        date: `${r.TIME.slice(0, 4)}-${r.TIME.slice(4, 6)}-01`,
        value: r.DATA_VALUE === '' ? null : parseFloat(r.DATA_VALUE),
      })),
    }
  },
}

const provider: ProviderFactory = {
  manifest: manifest as ProviderFactory['manifest'],
  createMacroProvider: () => macroProvider,
}

export default provider
