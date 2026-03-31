'use client'
import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import React from 'react'
import type { BrickRegistryEntry, BrickManifest, Market } from '@/types'

interface BrickWithMeta extends BrickRegistryEntry {
  manifest: BrickManifest | null
}

interface Props {
  ticker: string
  market: Market
}

export default function BrickRenderer({ ticker, market }: Props) {
  const [bricks, setBricks] = useState<BrickWithMeta[]>([])

  useEffect(() => {
    fetch('/api/bricks/registry')
      .then((r) => r.json())
      .then(async (registry: { bricks: BrickRegistryEntry[] }) => {
        const withMeta: BrickWithMeta[] = await Promise.all(
          registry.bricks
            .filter((b) => b.enabled)
            .sort((a, b) => a.order - b.order)
            .map(async (entry) => {
              try {
                const res = await fetch(`/api/bricks/${entry.id}/manifest`)
                const manifest = res.ok ? ((await res.json()) as BrickManifest) : null
                return { ...entry, manifest }
              } catch {
                return { ...entry, manifest: null }
              }
            })
        )
        setBricks(withMeta)
      })
  }, [ticker])

  return (
    <div className="flex flex-col gap-4">
      {bricks.map((brick) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const BrickComponent = dynamic<{ ticker: string; market: Market }>(
          () => import(`@/bricks/${brick.id}/component`).catch(() => ({ default: () => <div className="p-4 text-red-400">Brick 로드 실패: {brick.id}</div> })) as Promise<{ default: React.ComponentType<{ ticker: string; market: Market }> }>,
          { loading: () => <div className="p-6 bg-white rounded-xl border border-gray-200 text-center text-gray-400">로딩 중...</div>, ssr: false }
        )
        return (
          <div key={brick.id} className="relative">
            <BrickComponent ticker={ticker} market={market} />
          </div>
        )
      })}
    </div>
  )
}
