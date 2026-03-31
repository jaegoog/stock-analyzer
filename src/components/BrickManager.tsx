'use client'
import { useEffect, useState } from 'react'
import type { BrickRegistryEntry, BrickManifest } from '@/types'

interface BrickWithMeta extends BrickRegistryEntry {
  manifest: BrickManifest | null
}

const CATEGORY_LABEL: Record<string, string> = {
  calculation: '계산',
  chart: '차트',
  research: '조사',
  table: '테이블',
  alert: '알림',
}

interface Props {
  onRefresh?: () => void
}

export default function BrickManager({ onRefresh }: Props) {
  const [bricks, setBricks] = useState<BrickWithMeta[]>([])

  const load = () => {
    fetch('/api/bricks/registry')
      .then((r) => r.json())
      .then(async (registry: { bricks: BrickRegistryEntry[] }) => {
        const withMeta = await Promise.all(
          registry.bricks
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
  }

  useEffect(() => { load() }, [])

  const toggle = async (brickId: string, enabled: boolean) => {
    await fetch('/api/bricks/registry', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brickId, enabled }),
    })
    load()
    onRefresh?.()
  }

  const deleteBrick = async (brickId: string) => {
    if (!confirm(`'${brickId}' Brick을 삭제하시겠습니까?`)) return
    await fetch('/api/agent/delete-brick', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brickId }),
    })
    load()
    onRefresh?.()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="font-semibold text-gray-900 text-sm">설치된 기능 목록</h3>
      </div>
      <ul className="divide-y divide-gray-100">
        {bricks.map((brick) => (
          <li key={brick.id} className="flex items-center gap-2 px-4 py-2.5">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium text-gray-900 truncate">
                  {brick.manifest?.name ?? brick.id}
                </span>
                {brick.manifest?.category && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex-shrink-0">
                    {CATEGORY_LABEL[brick.manifest.category] ?? brick.manifest.category}
                  </span>
                )}
                {brick.manifest?.author === 'ai-agent' && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-600 flex-shrink-0">AI</span>
                )}
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={brick.enabled}
                onChange={(e) => toggle(brick.id, e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
            </label>
            {brick.manifest?.author !== 'system' && (
              <button
                onClick={() => deleteBrick(brick.id)}
                className="flex-shrink-0 text-gray-300 hover:text-red-400 text-sm"
                title="삭제"
              >
                🗑
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
