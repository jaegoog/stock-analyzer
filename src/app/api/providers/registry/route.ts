import { NextRequest, NextResponse } from 'next/server'
import { getAllProviders, updateProviderInRegistry } from '@/providers/provider-registry'

export async function GET() {
  try {
    const providers = getAllProviders()
    return NextResponse.json({ providers })
  } catch (error) {
    console.error('[providers/registry GET]', error)
    return NextResponse.json({ error: 'Failed to read provider registry' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { providerId, enabled } = (await req.json()) as { providerId: string; enabled: boolean }
    updateProviderInRegistry(providerId, { enabled })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[providers/registry PUT]', error)
    return NextResponse.json({ error: 'Failed to update provider registry' }, { status: 500 })
  }
}
