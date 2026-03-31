import { NextRequest, NextResponse } from 'next/server'
import { readRegistry, updateBrickInRegistry } from '@/lib/brick-registry'
import type { UpdateRegistryRequest } from '@/types'

export async function GET() {
  const registry = readRegistry()
  return NextResponse.json(registry)
}

export async function PUT(req: NextRequest) {
  const body = (await req.json()) as UpdateRegistryRequest
  const { brickId, enabled, order } = body
  if (!brickId) return NextResponse.json({ error: 'brickId required' }, { status: 400 })

  updateBrickInRegistry(brickId, { ...(enabled !== undefined && { enabled }), ...(order !== undefined && { order }) })
  return NextResponse.json({ success: true })
}
