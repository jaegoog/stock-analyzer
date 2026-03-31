import { NextRequest, NextResponse } from 'next/server'
import { readProviderManifest } from '@/providers/provider-registry'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ providerId: string }> }
) {
  const { providerId } = await params
  const manifest = readProviderManifest(providerId)
  if (!manifest) return NextResponse.json({ error: 'Manifest not found' }, { status: 404 })
  return NextResponse.json(manifest)
}
