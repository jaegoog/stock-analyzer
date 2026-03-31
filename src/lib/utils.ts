import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(
  value: number | null | undefined,
  options?: {
    currency?: string
    compact?: boolean
    decimals?: number
  }
): string {
  if (value === null || value === undefined) return '-'
  const { currency, compact = false, decimals = 2 } = options ?? {}

  if (compact) {
    if (currency === 'KRW') {
      if (Math.abs(value) >= 1e12) return `${(value / 1e12).toFixed(1)}조`
      if (Math.abs(value) >= 1e8) return `${(value / 1e8).toFixed(1)}억`
      if (Math.abs(value) >= 1e4) return `${(value / 1e4).toFixed(1)}만`
      return value.toLocaleString('ko-KR')
    }
    if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`
    if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: decimals })}`
  }

  if (currency === 'KRW') return value.toLocaleString('ko-KR') + '원'
  if (currency === 'USD') return '$' + value.toLocaleString('en-US', { maximumFractionDigits: decimals })
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals })
}

export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return '-'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(decimals)}%`
}

export function detectMarket(ticker: string): 'KR' | 'US' {
  // 6자리 숫자 = 한국 KRX
  if (/^\d{6}$/.test(ticker)) return 'KR'
  // .KS .KQ suffix
  if (ticker.endsWith('.KS') || ticker.endsWith('.KQ')) return 'KR'
  return 'US'
}

export function normalizeKRTicker(ticker: string): string {
  if (/^\d{6}$/.test(ticker)) return `${ticker}.KS`
  return ticker
}
