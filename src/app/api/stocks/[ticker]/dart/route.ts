import { NextRequest, NextResponse } from 'next/server'
import AdmZip from 'adm-zip'
import type { DartFsRequestMode, FinancialData, FinancialStatement } from '@/types'
import { detectMarket, normalizeKRTicker } from '@/lib/utils'
import { getPriceProvider } from '@/providers/router'

const DART_BASE = 'https://opendart.fss.or.kr/api'

/** Open DART 단일계정 금액 단위는 천 원. 시가총액(원)과 맞추기 위한 스케일. */
const DART_KRW_THOUSAND = 1000

interface DartFsPair {
  cfs: Record<string, unknown>[]
  ofs: Record<string, unknown>[]
}

/** 연결(CFS)·별도(OFS) 혼용 방지: 요청 전체에서 하나만 사용 */
type DartFsChoice = 'cfs' | 'ofs'

function chooseFsDiv(pairs: DartFsPair[]): DartFsChoice {
  const hasCfs = pairs.some((p) => p.cfs.length > 0)
  return hasCfs ? 'cfs' : 'ofs'
}

function dartFsAvailability(pairs: DartFsPair[]): { cfsAvailable: boolean; ofsAvailable: boolean } {
  return {
    cfsAvailable: pairs.some((p) => p.cfs.length > 0),
    ofsAvailable: pairs.some((p) => p.ofs.length > 0),
  }
}

function parseFsQuery(raw: string | null): DartFsRequestMode {
  const v = (raw ?? 'auto').trim().toLowerCase()
  if (v === 'ofs' || v === 'separate' || v === 'ofs_only') return 'ofs'
  if (v === 'cfs' || v === 'consolidated' || v === 'cfs_only') return 'cfs'
  return 'auto'
}

function resolveFsPref(
  pairs: DartFsPair[],
  requested: DartFsRequestMode
): DartFsChoice {
  if (requested === 'cfs') return 'cfs'
  if (requested === 'ofs') return 'ofs'
  return chooseFsDiv(pairs)
}

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
  { dartLabels: ['당기순이익', '당기순이익(손실)', '당기순손익', '연결당기순이익', '계속영업당기순이익'], field: 'netIncome',       label: '당기순이익' },
  {
    dartLabels: [
      '지배기업의소유주에게귀속되는당기순이익',
      '지배기업소유주에게귀속되는당기순이익',
      '지배기업의소유주지분',
    ],
    field: 'netIncomeCommon',
    label: '지배주주순이익',
  },
  { dartLabels: ['EBITDA', '상각전영업이익'],                              field: 'ebitda',          label: 'EBITDA' },
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
  {
    dartLabels: [
      '감가상각비및무형자산상각비',
      '감가상각비와무형자산상각비',
      '감가상각비 및 무형자산상각비',
      '감가상각비와무형자산의상각비',
    ],
    field: 'depreciationAndAmortization',
    label: '감가상각·무형자산상각비',
  },
  { dartLabels: ['감가상각비', '유형자산감가상각비'],                      field: 'depreciation',      label: '감가상각비' },
  { dartLabels: ['무형자산상각비', '상각비', '무형자산의상각비'],         field: 'amortization',      label: '무형자산상각비' },
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

async function fetchDartFinancialsDual(
  corpCode: string,
  year: string,
  reprtCode: string,
  key: string
): Promise<DartFsPair> {
  const fetchOne = async (fsDiv: 'CFS' | 'OFS'): Promise<Record<string, unknown>[]> => {
    const url = `${DART_BASE}/fnlttSinglAcntAll.json?crtfc_key=${key}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${reprtCode}&fs_div=${fsDiv}`
    try {
      const res = await fetch(url, { next: { revalidate: 3600 } })
      const json = (await res.json()) as { status: string; list?: Record<string, unknown>[] }
      if (json.status === '000' && json.list) return json.list
    } catch {
      // ignore
    }
    return []
  }
  const [cfs, ofs] = await Promise.all([fetchOne('CFS'), fetchOne('OFS')])
  return { cfs, ofs }
}

// ─── FinancialStatement 빌드 ─────────────────────────────────────────────────

const normalize = (s: string) => s.replace(/[\s()（）]/g, '')
type DartSjDiv = 'IS' | 'CIS' | 'BS' | 'CF'

/** 로마숫자·번호 접두(예: Ⅶ., 3.) 제거 후 비교 — account_nm 변형 대응 */
function stripLeadingOrdinal(s: string): string {
  let t = s
  for (let i = 0; i < 6; i++) {
    const next = t
      .replace(/^제\d+기/u, '')
      .replace(/^[Ⅰ-ⅩⅪⅫⅬⅭⅮⅯ]+[.\-·:、,]*/u, '')
      .replace(/^[IVXLCDM]+[.\-·:、,]*/i, '')
      .replace(/^\d+[.\-)·:、,]*/u, '')
    if (next === t) break
    t = next
  }
  return t
}

function normalizeAccountLabel(accountNm: string): string {
  return stripLeadingOrdinal(normalize(accountNm))
}

function accountMatchesLabels(accountNm: string, dartLabels: string[]): boolean {
  const nm = normalizeAccountLabel(accountNm)
  if (!nm) return false
  for (const cand of dartLabels) {
    const c = normalizeAccountLabel(cand)
    if (!c) continue
    if (nm === c) return true
    if (c.length >= 4 && nm.endsWith(c)) return true
    if (c.length >= 5 && nm.includes(c)) return true
  }
  return false
}

function filterBySjDiv(
  data: Record<string, unknown>[],
  sjDiv: DartSjDiv | DartSjDiv[]
): Record<string, unknown>[] {
  const targets = Array.isArray(sjDiv) ? sjDiv : [sjDiv]
  const filtered = data.filter((d) => targets.includes(String(d.sj_div ?? '') as DartSjDiv))
  return filtered.length > 0 ? filtered : data
}

const parseThstrmMoney = (v: unknown): number | null => {
  const raw = String(v ?? '').replace(/,/g, '').trim()
  if (raw === '' || raw === '-') return null
  const n = parseInt(raw, 10)
  return isNaN(n) ? null : n
}

function findRowByLabels(
  pool: Record<string, unknown>[],
  dartLabels: string[]
): Record<string, unknown> | undefined {
  return pool.find((d) => accountMatchesLabels(String(d.account_nm ?? ''), dartLabels))
}

/** 단일 fs(CFS 또는 OFS) 풀에서 금액 추출 */
function extractAmountFromPool(
  data: Record<string, unknown>[],
  dartLabels: string[],
  sjDiv: DartSjDiv | DartSjDiv[] | undefined,
  mode: 'single' | 'cumulative'
): number | null {
  if (!data.length) return null
  const pool = sjDiv ? filterBySjDiv(data, sjDiv) : data
  const item = findRowByLabels(pool, dartLabels)
  if (!item) return null
  const single = parseThstrmMoney(item.thstrm_amount)
  const cumulative = parseThstrmMoney(item.thstrm_add_amount)
  return mode === 'cumulative'
    ? (cumulative ?? single)
    : (single ?? cumulative)
}

/** 선택한 fs_div 풀만 사용 (다른 쪽으로 폴백하지 않음 → 연결·별도 혼선 방지) */
function extractAmountUnified(
  pair: DartFsPair,
  dartLabels: string[],
  sjDiv: DartSjDiv | DartSjDiv[] | undefined,
  mode: 'single' | 'cumulative',
  fs: DartFsChoice
): number | null {
  const data = fs === 'cfs' ? pair.cfs : pair.ofs
  return extractAmountFromPool(data, dartLabels, sjDiv, mode)
}

/** 손익/현금흐름: 중간 결산은 누적액이 일반적이라, 분기순액 = 누적(후) − 누적(전) */
function subtractFlow(later: number | null, earlier: number | null): number | null {
  if (later === null || earlier === null) return null
  return later - earlier
}

function parsePeriodLabel(label: string): number {
  const m = label.match(/^(\d{4})\/(\d{2})$/)
  if (!m) return Number.MIN_SAFE_INTEGER
  const y = Number(m[1])
  const mm = Number(m[2])
  return y * 100 + mm
}

/**
 * 사업연도 Y 기준 분기표(시간순) : (Y-1)/12, Y/03, Y/06, Y/09, Y/12
 * 손익/현금흐름은 누적 차감으로 분기순액 계산, BS는 각 시점 잔액을 사용.
 */
function buildQuarterlyBlockLikeDartUI(
  displayYear: string,
  rawPrevAnnual: DartFsPair,
  rawPrevQ3: DartFsPair,
  rawQ1: DartFsPair,
  rawH1: DartFsPair,
  rawQ3: DartFsPair,
  rawAnnual: DartFsPair,
  fs: DartFsChoice
): { income: FinancialStatement; balance: FinancialStatement; cashflow: FinancialStatement } {
  const y = displayYear
  const yPrev = String(Number(displayYear) - 1)
  const colYears = [`${yPrev}/12`, `${y}/03`, `${y}/06`, `${y}/09`, `${y}/12`]

  const ex = (
    pair: DartFsPair,
    labels: string[],
    sj: DartSjDiv | DartSjDiv[],
    mode: 'single' | 'cumulative'
  ) => extractAmountUnified(pair, labels, sj, mode, fs)

  const buildFlow = (
    aliases: FieldAlias[],
    stype: 'income' | 'cashflow',
    sj: DartSjDiv | DartSjDiv[]
  ): FinancialStatement => ({
    type: stype,
    period: 'quarterly',
    years: colYears,
    rows: aliases.map(({ dartLabels, field, label }) => {
      const pvA = ex(rawPrevAnnual, dartLabels, sj, 'cumulative')
      const pv9 = ex(rawPrevQ3, dartLabels, sj, 'cumulative')
      const c1 = ex(rawQ1, dartLabels, sj, 'cumulative')
      const c6 = ex(rawH1, dartLabels, sj, 'cumulative')
      const c9 = ex(rawQ3, dartLabels, sj, 'cumulative')
      const c12 = ex(rawAnnual, dartLabels, sj, 'cumulative')
      return {
        field,
        label,
        values: [
          subtractFlow(pvA, pv9),
          c1,
          subtractFlow(c6, c1),
          subtractFlow(c9, c6),
          subtractFlow(c12, c9),
        ],
        unit: 'KRW' as const,
      }
    }),
  })

  const buildBalance = (): FinancialStatement => ({
    type: 'balance',
    period: 'quarterly',
    years: colYears,
    rows: BALANCE_FIELD_ALIASES.map(({ dartLabels, field, label }) => ({
      field,
      label,
      values: [
        ex(rawPrevAnnual, dartLabels, 'BS', 'single'),
        ex(rawQ1, dartLabels, 'BS', 'single'),
        ex(rawH1, dartLabels, 'BS', 'single'),
        ex(rawQ3, dartLabels, 'BS', 'single'),
        ex(rawAnnual, dartLabels, 'BS', 'single'),
      ],
      unit: 'KRW' as const,
    })),
  })

  return {
    income: buildFlow(INCOME_FIELD_ALIASES, 'income', ['IS', 'CIS']),
    balance: buildBalance(),
    cashflow: buildFlow(CASHFLOW_FIELD_ALIASES, 'cashflow', 'CF'),
  }
}

function mergeQuarterlyStatements(statList: FinancialStatement[]): FinancialStatement {
  if (statList.length === 0) {
    return { type: 'income', period: 'quarterly', years: [], rows: [] }
  }
  const yearsAll = statList.flatMap((s) => s.years)
  const uniqueYears = Array.from(new Set(yearsAll))
  uniqueYears.sort((a, b) => parsePeriodLabel(b) - parsePeriodLabel(a))
  const yearIndex = new Map<string, number>(uniqueYears.map((y, i) => [y, i]))

  const rows = statList[0].rows.map((r0, ri) => {
    const values: (number | null)[] = Array.from({ length: uniqueYears.length }, () => null)
    statList.forEach((s) => {
      s.years.forEach((y, yi) => {
        const idx = yearIndex.get(y)
        if (idx === undefined) return
        if (values[idx] === null) values[idx] = s.rows[ri].values[yi] ?? null
      })
    })
    return {
      field: r0.field,
      label: r0.label,
      unit: r0.unit,
      values,
    }
  })
  const { type, period } = statList[0]
  return { type, period, years: uniqueYears, rows }
}

function getRowValues(statement: FinancialStatement, field: string): (number | null)[] {
  return statement.rows.find((r) => r.field === field)?.values ?? []
}

/**
 * EBITDA: DART 매핑값(손익 EBITDA)이 있으면 우선, 없으면 DART 매핑(영업이익 + 감가·무형 / CF 합계) 보완.
 */
function applyEbitdaFromDartMapped(
  income: FinancialStatement,
  cashflow: FinancialStatement
): FinancialStatement {
  const ebitdaIdx = income.rows.findIndex((r) => r.field === 'ebitda')
  if (ebitdaIdx < 0) return income

  const dartEbitda = income.rows[ebitdaIdx].values
  const opIncome = getRowValues(income, 'operatingIncome')
  const daCombo = getRowValues(cashflow, 'depreciationAndAmortization')
  const dep = getRowValues(cashflow, 'depreciation')
  const amort = getRowValues(cashflow, 'amortization')

  const computed = opIncome.map((op, i) => {
    if (op === null) return null
    const d = dep[i]
    const a = amort[i]
    if (d !== null || a !== null) {
      return op + (d ?? 0) + (a ?? 0)
    }
    const combo = daCombo[i]
    if (combo !== null) return op + combo
    return null
  })

  const nextEbitda = dartEbitda.map((fromDart, i) => fromDart ?? computed[i] ?? null)

  const rows = income.rows.map((r, i) =>
    i === ebitdaIdx ? { ...r, label: 'EBITDA', values: nextEbitda } : r
  )
  return { ...income, rows }
}

/** EV/EBITDA — EV(천원) = 시가총액(원)/1000 + 부채(천원) − 현금(천원), 분모 EBITDA(천원) */
function applyEvEbitdaRow(
  income: FinancialStatement,
  balance: FinancialStatement,
  marketCap: number | null
): FinancialStatement {
  const ebitdaVals = getRowValues(income, 'ebitda')
  const liab = getRowValues(balance, 'totalLiab')
  const cash = getRowValues(balance, 'cash')

  const marketCapKrwThousand =
    marketCap !== null && Number.isFinite(marketCap) ? marketCap / DART_KRW_THOUSAND : null

  const ratios = ebitdaVals.map((ebitda, i) => {
    if (marketCapKrwThousand === null || ebitda === null || ebitda === 0) return null
    const ev =
      marketCapKrwThousand + (liab[i] ?? 0) - (cash[i] ?? 0)
    return ev / ebitda
  })

  const idx = income.rows.findIndex((r) => r.field === 'evEbitda')
  const evRow = {
    field: 'evEbitda',
    label: 'EV/EBITDA',
    unit: 'ratio' as const,
    values: ratios,
  }
  const rows =
    idx >= 0
      ? income.rows.map((r, i) => (i === idx ? evRow : r))
      : [...income.rows, evRow]
  return { ...income, rows }
}

function buildStatementFromDart(
  allYears: { year: string; cfs: Record<string, unknown>[]; ofs: Record<string, unknown>[] }[],
  aliases: FieldAlias[],
  type: 'income' | 'balance' | 'cashflow',
  period: 'annual' | 'quarterly',
  fs: DartFsChoice
): FinancialStatement {
  const years = allYears.map((y) => y.year)
  const sj: DartSjDiv | DartSjDiv[] =
    type === 'income' ? ['IS', 'CIS'] : type === 'balance' ? 'BS' : 'CF'

  const rows = aliases.map(({ dartLabels, field, label }) => ({
    field,
    label,
    values: allYears.map((pair) =>
      extractAmountUnified(
        { cfs: pair.cfs, ofs: pair.ofs },
        dartLabels,
        sj,
        'single',
        fs
      )
    ),
    unit: 'KRW' as const,
  }))

  return { type, period, years, rows }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params
  const fsRequested = parseFsQuery(req.nextUrl.searchParams.get('fs'))
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
      ...(await fetchDartFinancialsDual(corpCode, year, '11011', key)),
    }))
  )

  const annualPairs = annualData.map(({ cfs, ofs }) => ({ cfs, ofs }))
  const { cfsAvailable, ofsAvailable } = dartFsAvailability(annualPairs)
  const fsPref = resolveFsPref(annualPairs, fsRequested)

  const fyQuarterlyYears = [currentYear - 1, currentYear - 2, currentYear - 3].map(String)
  const quarterlyBlocks = await Promise.all(
    fyQuarterlyYears.map(async (ys) => {
      const yPrev = String(Number(ys) - 1)
      const [rawPrevAnnual, rawPrevQ3, rawQ1, rawH1, rawQ3, rawAnnual] = await Promise.all([
        fetchDartFinancialsDual(corpCode, yPrev, '11011', key),
        fetchDartFinancialsDual(corpCode, yPrev, '11014', key),
        fetchDartFinancialsDual(corpCode, ys, '11013', key),
        fetchDartFinancialsDual(corpCode, ys, '11012', key),
        fetchDartFinancialsDual(corpCode, ys, '11014', key),
        fetchDartFinancialsDual(corpCode, ys, '11011', key),
      ])
      return buildQuarterlyBlockLikeDartUI(
        ys,
        rawPrevAnnual,
        rawPrevQ3,
        rawQ1,
        rawH1,
        rawQ3,
        rawAnnual,
        fsPref
      )
    })
  )

  const mergedQuarterly = {
    income: mergeQuarterlyStatements(quarterlyBlocks.map((b) => b.income)),
    balance: mergeQuarterlyStatements(quarterlyBlocks.map((b) => b.balance)),
    cashflow: mergeQuarterlyStatements(quarterlyBlocks.map((b) => b.cashflow)),
  }

  const annualBalance = buildStatementFromDart(
    annualData,
    BALANCE_FIELD_ALIASES,
    'balance',
    'annual',
    fsPref
  )
  const annualCashflow = buildStatementFromDart(
    annualData,
    CASHFLOW_FIELD_ALIASES,
    'cashflow',
    'annual',
    fsPref
  )
  const annualIncomeBase = buildStatementFromDart(
    annualData,
    INCOME_FIELD_ALIASES,
    'income',
    'annual',
    fsPref
  )
  const annualIncomeEbitda = applyEbitdaFromDartMapped(annualIncomeBase, annualCashflow)

  const quarterlyIncomeEbitda = applyEbitdaFromDartMapped(
    mergedQuarterly.income,
    mergedQuarterly.cashflow
  )

  const symbolNorm = normalizeKRTicker(symbol)
  const mkt = detectMarket(symbolNorm)
  let marketCap: number | null = null
  try {
    const priceProvider = await getPriceProvider(mkt)
    if (priceProvider) {
      const q = await priceProvider.getQuote(symbolNorm, mkt)
      marketCap =
        q.marketCap ??
        (q.sharesOutstanding != null && q.price > 0
          ? q.sharesOutstanding * q.price
          : null) ??
        null
    }
  } catch {
    /* 시총 없으면 EV/EBITDA는 null */
  }

  const annualIncome = applyEvEbitdaRow(annualIncomeEbitda, annualBalance, marketCap)
  const quarterlyIncome = applyEvEbitdaRow(
    quarterlyIncomeEbitda,
    mergedQuarterly.balance,
    marketCap
  )

  const result: FinancialData = {
    ticker: symbol,
    market: 'KR',
    dartFs: {
      requested: fsRequested,
      applied: fsPref,
      cfsAvailable,
      ofsAvailable,
    },
    annual: {
      income: annualIncome,
      balance: annualBalance,
      cashflow: annualCashflow,
    },
    quarterly: {
      ...mergedQuarterly,
      income: quarterlyIncome,
    },
  }

  return NextResponse.json(result)
}
