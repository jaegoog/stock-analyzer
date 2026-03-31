import { NextRequest, NextResponse } from 'next/server'
import AdmZip from 'adm-zip'
import type { FinancialData, FinancialStatement } from '@/types'

const DART_BASE = 'https://opendart.fss.or.kr/api'

// ─── 계정과목 매핑 (aliases 방식: 기업마다 다른 계정과목명 대응) ──────────────

interface FieldAlias {
  /** DART account_nm에 매칭할 후보 문자열 목록 (공백/괄호 제거 후 비교) */
  dartLabels: string[]
  /** FinancialRow.field 값 */
  field: string
  /** UI 표시 라벨 */
  label: string
}

const INCOME_FIELD_ALIASES: FieldAlias[] = [
  { dartLabels: ['매출액', '수익(매출액)'],                              field: 'totalRevenue',    label: '매출액' },
  { dartLabels: ['영업이익', '영업이익(손실)'],                           field: 'operatingIncome', label: '영업이익' },
  { dartLabels: ['이자비용', '금융원가', '이자비용(수익)'],                field: 'interestExpense', label: '이자비용' },
  { dartLabels: ['법인세비용차감전순이익(손실)', '법인세차감전순이익'],      field: 'pretaxIncome',    label: '세전순이익' },
  { dartLabels: ['당기순이익', '당기순이익(손실)'],                        field: 'netIncome',       label: '당기순이익' },
  { dartLabels: ['지배기업의소유주에게귀속되는당기순이익'],                 field: 'netIncomeCommon', label: '지배주주순이익' },
  { dartLabels: ['EBITDA'],                                              field: 'ebitda',          label: 'EBITDA' },
]

const BALANCE_FIELD_ALIASES: FieldAlias[] = [
  { dartLabels: ['자산총계'],                                            field: 'totalAssets',             label: '자산총계' },
  { dartLabels: ['부채총계'],                                            field: 'totalLiab',               label: '부채총계' },
  { dartLabels: ['자본총계'],                                            field: 'totalEquity',             label: '자본총계' },
  { dartLabels: ['유동자산'],                                            field: 'totalCurrentAssets',      label: '유동자산' },
  { dartLabels: ['유동부채'],                                            field: 'totalCurrentLiabilities', label: '유동부채' },
  { dartLabels: ['현금및현금성자산'],                                     field: 'cash',                    label: '현금' },
  { dartLabels: ['장기차입금'],                                          field: 'longTermDebt',            label: '장기차입금' },
  { dartLabels: ['매출채권', '매출채권및기타채권', '매출채권및기타유동채권'], field: 'accountsReceivable',      label: '매출채권' },
  { dartLabels: ['재고자산'],                                            field: 'inventory',               label: '재고자산' },
  { dartLabels: ['매입채무', '매입채무및기타채무', '매입채무및기타유동채무'], field: 'accountsPayable',         label: '매입채무' },
]

const CASHFLOW_FIELD_ALIASES: FieldAlias[] = [
  { dartLabels: ['영업활동현금흐름', '영업활동으로인한현금흐름'],           field: 'operatingCashFlow',  label: '영업활동현금흐름' },
  { dartLabels: ['투자활동현금흐름', '투자활동으로인한현금흐름'],           field: 'investingCashFlow',  label: '투자활동현금흐름' },
  { dartLabels: ['재무활동현금흐름', '재무활동으로인한현금흐름'],           field: 'financingCashFlow',  label: '재무활동현금흐름' },
  { dartLabels: ['유형자산의취득', '유형자산취득'],                        field: 'capex',              label: '설비투자(CAPEX)' },
  { dartLabels: ['배당금지급', '배당금의지급', '현금배당금지급'],           field: 'dividendsPaid',      label: '배당금지급' },
]

// ─── corp_code 조회 (ZIP 파싱) ────────────────────────────────────────────────

// 메모리 캐시 (서버 재시작 전까지 유지)
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

    // Parse <list> entries: extract stock_code and corp_code
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

// ─── FinancialStatement 빌드 ─────────────────────────────────────────────────

const normalize = (s: string) => s.replace(/[\s()（）]/g, '')

function buildStatementFromDart(
  allYears: { year: string; data: Record<string, unknown>[] }[],
  aliases: FieldAlias[],
  type: 'income' | 'balance' | 'cashflow',
  period: 'annual' | 'quarterly'
): FinancialStatement {
  const years = allYears.map((y) => y.year)

  const rows = aliases.map(({ dartLabels, field, label }) => ({
    field,
    label,
    values: allYears.map(({ data }) => {
      const item = data.find((d) => {
        const nm = normalize(String(d.account_nm ?? ''))
        return dartLabels.some((candidate) => nm === normalize(candidate))
      })
      if (!item) return null
      const raw = String(item.thstrm_amount ?? '').replace(/,/g, '').trim()
      const n = parseInt(raw, 10)
      return isNaN(n) ? null : n
    }),
    unit: 'KRW' as const,
  }))

  return { type, period, years, rows }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params
  const symbol = decodeURIComponent(ticker)
  const key = process.env.DART_API_KEY

  if (!key) {
    return NextResponse.json(
      { error: 'DART_API_KEY not configured. 무료 발급: https://opendart.fss.or.kr' },
      { status: 503 }
    )
  }

  const corpCode = await getCorpCode(symbol, key)
  if (!corpCode) {
    return NextResponse.json(
      { error: `종목코드 ${symbol}의 corp_code를 찾을 수 없습니다.` },
      { status: 404 }
    )
  }

  const currentYear = new Date().getFullYear()
  // 최근 4개년 (사업보고서 기준)
  const years = [currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4].map(String)

  // 11011 = 사업보고서
  const annualData = await Promise.all(
    years.map(async (year) => ({
      year,
      data: await fetchDartFinancials(corpCode, year, '11011', key),
    }))
  )

  // 분기 (11014 = 반기보고서, 11013 = 1분기, 11012 = 3분기)
  const currentQ = await fetchDartFinancials(corpCode, String(currentYear - 1), '11014', key)
  const quarterlyData = [{ year: `${currentYear - 1} 반기`, data: currentQ }]

  const result: FinancialData = {
    ticker: symbol,
    market: 'KR',
    annual: {
      income: buildStatementFromDart(annualData, INCOME_FIELD_ALIASES, 'income', 'annual'),
      balance: buildStatementFromDart(annualData, BALANCE_FIELD_ALIASES, 'balance', 'annual'),
      cashflow: buildStatementFromDart(annualData, CASHFLOW_FIELD_ALIASES, 'cashflow', 'annual'),
    },
    quarterly: {
      income: buildStatementFromDart(quarterlyData, INCOME_FIELD_ALIASES, 'income', 'quarterly'),
      balance: buildStatementFromDart(quarterlyData, BALANCE_FIELD_ALIASES, 'balance', 'quarterly'),
      cashflow: buildStatementFromDart(quarterlyData, CASHFLOW_FIELD_ALIASES, 'cashflow', 'quarterly'),
    },
  }

  return NextResponse.json(result)
}
