import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import type { ValidationAlgorithm } from '@/types'

const FILE = path.join(process.cwd(), 'src', 'bricks', 'stock-validator', 'algorithms.json')

export async function GET() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as ValidationAlgorithm[]
    return NextResponse.json(data)
  } catch {
    return NextResponse.json([])
  }
}

export async function PUT(req: NextRequest) {
  const algorithms = (await req.json()) as ValidationAlgorithm[]
  fs.writeFileSync(FILE, JSON.stringify(algorithms, null, 2), 'utf-8')
  return NextResponse.json({ success: true })
}
