import fs from 'fs'
import path from 'path'
import type { BrickRegistry, BrickManifest, BrickRegistryEntry } from '@/types'

const BRICKS_DIR = path.join(process.cwd(), 'src', 'bricks')
const REGISTRY_PATH = path.join(BRICKS_DIR, 'registry.json')

export function readRegistry(): BrickRegistry {
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf-8')
  return JSON.parse(raw) as BrickRegistry
}

export function writeRegistry(registry: BrickRegistry): void {
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf-8')
}

export function readManifest(brickId: string): BrickManifest | null {
  const manifestPath = path.join(BRICKS_DIR, brickId, 'manifest.json')
  if (!fs.existsSync(manifestPath)) return null
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as BrickManifest
}

export function getEnabledBricks(): BrickRegistryEntry[] {
  const registry = readRegistry()
  return registry.bricks
    .filter((b) => b.enabled)
    .sort((a, b) => a.order - b.order)
}

export function getAllBricks(): (BrickRegistryEntry & { manifest: BrickManifest | null })[] {
  const registry = readRegistry()
  return registry.bricks
    .sort((a, b) => a.order - b.order)
    .map((entry) => ({ ...entry, manifest: readManifest(entry.id) }))
}

export function addBrickToRegistry(brickId: string): void {
  const registry = readRegistry()
  const exists = registry.bricks.find((b) => b.id === brickId)
  if (!exists) {
    const maxOrder = registry.bricks.reduce((m, b) => Math.max(m, b.order), -1)
    registry.bricks.push({ id: brickId, enabled: true, order: maxOrder + 1 })
    writeRegistry(registry)
  }
}

export function removeBrickFromRegistry(brickId: string): void {
  const registry = readRegistry()
  registry.bricks = registry.bricks.filter((b) => b.id !== brickId)
  writeRegistry(registry)
}

export function updateBrickInRegistry(
  brickId: string,
  update: Partial<Pick<BrickRegistryEntry, 'enabled' | 'order'>>
): void {
  const registry = readRegistry()
  const entry = registry.bricks.find((b) => b.id === brickId)
  if (entry) {
    Object.assign(entry, update)
    writeRegistry(registry)
  }
}

export function brickDirExists(brickId: string): boolean {
  return fs.existsSync(path.join(BRICKS_DIR, brickId))
}

export function getBrickDir(brickId: string): string {
  return path.join(BRICKS_DIR, brickId)
}

export function getBricksDir(): string {
  return BRICKS_DIR
}
