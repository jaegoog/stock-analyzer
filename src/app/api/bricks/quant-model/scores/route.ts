import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import type { QuantScoreRecord } from '@/types'

const FILE = path.join(process.cwd(), 'src', 'bricks', 'quant-model', 'models.json')

function readFile(): { models: unknown[]; scoreHistory: QuantScoreRecord[] } {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'))
  } catch {
    return { models: [], scoreHistory: [] }
  }
}

export async function GET(req: NextRequest) {
  const ticker  = req.nextUrl.searchParams.get('ticker')
  const modelId = req.nextUrl.searchParams.get('modelId')

  let records = readFile().scoreHistory
  if (ticker)  records = records.filter((r) => r.ticker  === ticker)
  if (modelId) records = records.filter((r) => r.modelId === modelId)

  return NextResponse.json(records)
}

export async function POST(req: NextRequest) {
  const record = (await req.json()) as QuantScoreRecord
  const data = readFile()
  const updated = [...data.scoreHistory, record]
  fs.writeFileSync(FILE, JSON.stringify({ ...data, scoreHistory: updated }, null, 2), 'utf-8')
  return NextResponse.json({ success: true })
}
