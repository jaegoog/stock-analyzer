import { NextRequest, NextResponse } from 'next/server'
import { readManifest } from '@/lib/brick-registry'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ brickId: string }> }
) {
  const { brickId } = await params
  const manifest = readManifest(decodeURIComponent(brickId))
  if (!manifest) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(manifest)
}
