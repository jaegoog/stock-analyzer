import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { getBrickDir, readManifest, removeBrickFromRegistry, brickDirExists } from '@/lib/brick-registry'
import type { DeleteBrickRequest } from '@/types'

export async function DELETE(req: NextRequest) {
  const body = (await req.json()) as DeleteBrickRequest
  const { brickId } = body

  if (!brickId) return NextResponse.json({ error: 'brickId required' }, { status: 400 })

  const manifest = readManifest(brickId)
  if (manifest?.author === 'system') {
    return NextResponse.json({ error: 'System bricks cannot be deleted' }, { status: 403 })
  }

  if (brickDirExists(brickId)) {
    fs.rmSync(getBrickDir(brickId), { recursive: true, force: true })
  }

  removeBrickFromRegistry(brickId)
  return NextResponse.json({ success: true })
}
