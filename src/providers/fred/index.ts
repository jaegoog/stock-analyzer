import type { MacroSeries, MacroQueryOptions } from '@/types'
import type { ProviderFactory, MacroProvider } from '../types'
import manifest from './manifest.json'

// FRED API: https://fred.stlouisfed.org/docs/api/fred/
// API 키 발급: https://fred.stlouisfed.org/docs/api/api_key.html
// 예시 시리즈: FEDFUNDS (연방기금금리), GDP, CPIAUCSL (소비자물가지수)

const macroProvider: MacroProvider = {
  async getMacroSeries(seriesId: string, opts?: MacroQueryOptions): Promise<MacroSeries> {
    const key = process.env.FRED_API_KEY
    if (!key) throw new Error('FRED_API_KEY not configured. https://fred.stlouisfed.org/docs/api/api_key.html 에서 무료 발급')

    const params = new URLSearchParams({
      series_id: seriesId,
      api_key: key,
      file_type: 'json',
      sort_order: 'desc',
    })
    if (opts?.startDate) params.set('observation_start', opts.startDate)
    if (opts?.endDate) params.set('observation_end', opts.endDate)
    if (opts?.limit) params.set('limit', String(opts.limit))

    const [seriesRes, obsRes] = await Promise.all([
      fetch(`https://api.stlouisfed.org/fred/series?${new URLSearchParams({ series_id: seriesId, api_key: key, file_type: 'json' })}`),
      fetch(`https://api.stlouisfed.org/fred/series/observations?${params}`),
    ])

    if (!seriesRes.ok || !obsRes.ok) throw new Error(`FRED API 오류: ${seriesId}`)

    const seriesData = await seriesRes.json() as { seriess?: Array<{ title: string; notes: string; frequency_short: string; units: string }> }
    const obsData = await obsRes.json() as { observations?: Array<{ date: string; value: string }> }

    const meta = seriesData.seriess?.[0]
    const observations = obsData.observations ?? []

    return {
      seriesId,
      name: meta?.title ?? seriesId,
      description: meta?.notes ?? '',
      frequency: (meta?.frequency_short?.toLowerCase() ?? 'monthly') as MacroSeries['frequency'],
      units: meta?.units ?? '',
      source: 'FRED',
      data: observations.map((o) => ({
        date: o.date,
        value: o.value === '.' ? null : parseFloat(o.value),
      })),
    }
  },
}

const provider: ProviderFactory = {
  manifest: manifest as ProviderFactory['manifest'],
  createMacroProvider: () => macroProvider,
}

export default provider
