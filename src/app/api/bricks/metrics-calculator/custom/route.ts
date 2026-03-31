import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import type { CustomMetric } from '@/types'

const FILE = path.join(process.cwd(), 'src', 'bricks', 'metrics-calculator', 'custom-metrics.json')

export async function GET() {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as CustomMetric[]
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const metrics = (await req.json()) as CustomMetric[]
  fs.writeFileSync(FILE, JSON.stringify(metrics, null, 2), 'utf-8')
  return NextResponse.json({ success: true })
}
