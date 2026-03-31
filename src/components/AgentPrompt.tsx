'use client'
import { useState } from 'react'
import type { Market, CreateBrickResponse } from '@/types'

interface Props {
  ticker: string
  market: Market
  onBrickCreated?: () => void
}

export default function AgentPrompt({ ticker, market, onBrickCreated }: Props) {
  const [prompt, setPrompt] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleSubmit = async () => {
    if (!prompt.trim()) return
    setStatus('loading')
    setMessage('')

    try {
      const res = await fetch('/api/agent/create-brick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ticker, market }),
      })
      const data = (await res.json()) as CreateBrickResponse

      if (data.success) {
        setStatus('success')
        setMessage(`"${data.brickName}" 기능이 추가되었습니다!`)
        setPrompt('')
        setTimeout(() => { setStatus('idle'); onBrickCreated?.() }, 2000)
      } else {
        setStatus('error')
        setMessage(data.error ?? '기능 생성에 실패했습니다.')
      }
    } catch {
      setStatus('error')
      setMessage('서버 오류가 발생했습니다.')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
        <span className="text-base">🤖</span>
        <h3 className="font-semibold text-gray-900 text-sm">AI 기능 추가</h3>
      </div>
      <div className="p-4">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="새로운 분석 기능을 설명해주세요&#10;예) 현금흐름지수를 계산해줘&#10;예) 비즈니스 모델을 찾아줘"
          rows={4}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
          disabled={status === 'loading'}
        />

        {status === 'loading' && (
          <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            AI가 기능을 만들고 있어요...
          </div>
        )}
        {status === 'success' && (
          <div className="mt-2 text-sm text-green-600">✓ {message}</div>
        )}
        {status === 'error' && (
          <div className="mt-2 text-sm text-red-500">✕ {message}</div>
        )}

        <button
          onClick={handleSubmit}
          disabled={status === 'loading' || !prompt.trim()}
          className="mt-3 w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          기능 생성
        </button>
      </div>
    </div>
  )
}
