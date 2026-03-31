import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import type { QuantModel } from '@/types'

const FILE = path.join(process.cwd(), 'src', 'bricks', 'quant-model', 'models.json')

function readFile(): { models: QuantModel[]; scoreHistory: unknown[] } {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'))
  } catch {
    return { models: [], scoreHistory: [] }
  }
}

export async function GET() {
  return NextResponse.json(readFile().models)
}

export async function PUT(req: NextRequest) {
  const models = (await req.json()) as QuantModel[]
  const existing = readFile()
  fs.writeFileSync(FILE, JSON.stringify({ ...existing, models }, null, 2), 'utf-8')
  return NextResponse.json({ success: true })
}
