import AdmZip from 'adm-zip'
import type { FinancialData, FinancialStatement } from '@/types'
import type { ProviderFactory, FinancialsProvider } from '../types'
import manifest from './manifest.json'

const DART_BASE = 'https://opendart.fss.or.kr/api'

// ─── 계정과목 매핑 ────────────────────────────────────────────────────────────

const INCOME_FIELDS: Record<string, string> = {
  '매출액': 'totalRevenue',
  '영업이익': 'operatingIncome',
  '법인세비용차감전순이익(손실)': 'pretaxIncome',
  '당기순이익': 'netIncome',
  '지배기업의소유주에게귀속되는당기순이익': 'netIncomeCommon',
  'EBITDA': 'ebitda',
}

const BALANCE_FIELDS: Record<string, string> = {
  '자산총계': 'totalAssets',
  '부채총계': 'totalLiab',
  '자본총계': 'totalEquity',
  '유동자산': 'totalCurrentAssets',
  '유동부채': 'totalCurrentLiabilities',
  '현금및현금성자산': 'cash',
  '장기차입금': 'longTermDebt',
}

const CASHFLOW_FIELDS: Record<string, string> = {
  '영업활동현금흐름': 'operatingCashFlow',
  '투자활동현금흐름': 'investingCashFlow',
  '재무활동현금흐름': 'financingCashFlow',
  '유형자산의취득': 'capex',
}

// ─── corp_code 조회 (ZIP 파싱) ────────────────────────────────────────────────

const corpCodeCache = new Map<string, string>()
let corpCodeCacheLoaded = false

async function loadCorpCodeMap(key: string): Promise<void> {
  if (corpCodeCacheLoaded) return

  try {
    const res = await fetch(`${DART_BASE}/corpCode.xml?crtfc_key=${key}`, {
      next: { revalidate: 86400 },
    })
    if (!res.ok) return

    const buf = Buffer.from(await res.arrayBuffer())
    const zip = new AdmZip(buf)
    const xmlEntry = zip.getEntry('CORPCODE.xml')
    if (!xmlEntry) return

    const xml = xmlEntry.getData().toString('utf-8')
    const regex = /<list>[\s\S]*?<corp_code>([\d]+)<\/corp_code>[\s\S]*?<stock_code>([\d]+)<\/stock_code>[\s\S]*?<\/list>/g
    let match
    while ((match = regex.exec(xml)) !== null) {
      const corpCode = match[1].trim()
      const stockCode = match[2].trim()
      if (stockCode && stockCode !== ' ') {
        corpCodeCache.set(stockCode, corpCode)
      }
    }
    corpCodeCacheLoaded = true
  } catch (err) {
    console.error('[dart] loadCorpCodeMap error:', err)
  }
}

async function getCorpCode(ticker: string, key: string): Promise<string | null> {
  const stockCode = ticker.replace(/\.(KS|KQ)$/, '')
  await loadCorpCodeMap(key)
  return corpCodeCache.get(stockCode) ?? null
}

// ─── 재무제표 데이터 조회 ─────────────────────────────────────────────────────

async function fetchDartFinancials(
  corpCode: string,
  year: string,
  reprtCode: string,
  key: string
): Promise<Record<string, unknown>[]> {
  const url = `${DART_BASE}/fnlttSinglAcntAll.json?crtfc_key=${key}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${reprtCode}&fs_div=CFS`
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } })
    const json = (await res.json()) as { status: string; list?: Record<string, unknown>[] }
    if (json.status === '000' && json.list) return json.list
  } catch {
    // ignore
  }
  return []
}

// ─── FinancialStatement 빌드 ──────────────────────────────────────────────────

function buildStatementFromDart(
  allYears: { year: string; data: Record<string, unknown>[] }[],
  fieldMap: Record<string, string>,
  type: 'income' | 'balance' | 'cashflow',
  period: 'annual' | 'quarterly'
): FinancialStatement {
  const years = allYears.map((y) => y.year)

  const rows = Object.entries(fieldMap).map(([dartLabel, field]) => ({
    field,
    label: dartLabel,
    values: allYears.map(({ data }) => {
      const item = data.find(
        (d) => String(d.account_nm ?? '').replace(/[\s()（）]/g, '') === dartLabel.replace(/[\s()（）]/g, '')
      )
      if (!item) return null
      const raw = String(item.thstrm_amount ?? '').replace(/,/g, '').trim()
      const n = parseInt(raw, 10)
      return isNaN(n) ? null : n
    }),
    unit: 'KRW' as const,
  }))

  return { type, period, years, rows }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const financialsProvider: FinancialsProvider = {
  async getFinancials(ticker) {
    const key = process.env.DART_API_KEY
    if (!key) throw new Error('DART_API_KEY not configured')

    const corpCode = await getCorpCode(ticker, key)
    if (!corpCode) throw new Error(`종목코드 ${ticker}의 corp_code를 찾을 수 없습니다.`)

    const currentYear = new Date().getFullYear()
    const years = [currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4].map(String)

    const annualData = await Promise.all(
      years.map(async (year) => ({
        year,
        data: await fetchDartFinancials(corpCode, year, '11011', key),
      }))
    )

    const currentQ = await fetchDartFinancials(corpCode, String(currentYear - 1), '11014', key)
    const quarterlyData = [{ year: `${currentYear - 1} 반기`, data: currentQ }]

    const result: FinancialData = {
      ticker,
      market: 'KR',
      annual: {
        income: buildStatementFromDart(annualData, INCOME_FIELDS, 'income', 'annual'),
        balance: buildStatementFromDart(annualData, BALANCE_FIELDS, 'balance', 'annual'),
        cashflow: buildStatementFromDart(annualData, CASHFLOW_FIELDS, 'cashflow', 'annual'),
      },
      quarterly: {
        income: buildStatementFromDart(quarterlyData, INCOME_FIELDS, 'income', 'quarterly'),
        balance: buildStatementFromDart(quarterlyData, BALANCE_FIELDS, 'balance', 'quarterly'),
        cashflow: buildStatementFromDart(quarterlyData, CASHFLOW_FIELDS, 'cashflow', 'quarterly'),
      },
    }

    return result
  },
}

const provider: ProviderFactory = {
  manifest: manifest as ProviderFactory['manifest'],
  createFinancialsProvider: () => financialsProvider,
}

export default provider
