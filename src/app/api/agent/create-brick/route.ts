import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { getBricksDir, addBrickToRegistry } from '@/lib/brick-registry'
import type { CreateBrickRequest, CreateBrickResponse } from '@/types'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are an expert Next.js + TypeScript developer. Your job is to generate a "Brick" module for a stock analysis web app.

A Brick is a self-contained React feature module. Given a user's natural language request, you generate all the files needed.

## Brick file structure
Every Brick lives at src/bricks/{brick-id}/ and contains:

1. manifest.json
2. component.tsx
3. api.ts (optional - only if external data fetching is needed)
4. calculations.ts (optional - only if formulas/calculations are needed)
5. index.ts (barrel export)

## TypeScript interfaces available (import from '@/types'):
interface BrickProps { ticker: string; market: 'KR' | 'US'; data?: Record<string, unknown> }
interface FinancialData { ... } // financial statement data

## Rules:
- Bricks MUST NOT import from other Brick directories
- component.tsx receives BrickProps and fetches its own data (or uses api.ts)
- Use Recharts for any charts (recharts is installed)
- Use Tailwind CSS for styling
- Keep it simple and functional
- All text labels should be in Korean
- The brick-id must be kebab-case

## Output format:
Respond with a JSON object with this exact structure:
{
  "brickId": "kebab-case-id",
  "brickName": "한국어 이름",
  "files": {
    "manifest.json": "...file content...",
    "component.tsx": "...file content...",
    "api.ts": "...file content or null...",
    "calculations.ts": "...file content or null...",
    "index.ts": "...file content..."
  }
}

## manifest.json template:
{
  "id": "{brickId}",
  "name": "{Korean name}",
  "description": "{Korean description}",
  "version": "1.0.0",
  "author": "ai-agent",
  "category": "calculation|chart|research|table|alert",
  "dataRequired": [],
  "enabled": true,
  "createdAt": "{today}"
}

## component.tsx template:
'use client'
import type { BrickProps } from '@/types'
// ... component using ticker and market from props
export default function BrickName({ ticker, market }: BrickProps) { ... }

## index.ts template:
export { default } from './component'
export * from './manifest.json'
`

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CreateBrickRequest
  const { prompt, ticker, market } = body

  if (!prompt) return NextResponse.json({ error: 'prompt required' }, { status: 400 })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `User request: "${prompt}"
Current stock: ${ticker} (${market} market)
Today: ${new Date().toISOString().split('T')[0]}

Generate a complete Brick for this request. Respond with only the JSON object, no markdown code blocks.`,
        },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    // Strip markdown code blocks if present
    const jsonStr = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(jsonStr) as {
      brickId: string
      brickName: string
      files: Record<string, string | null>
    }

    const { brickId, brickName, files } = parsed
    const brickDir = path.join(getBricksDir(), brickId)
    fs.mkdirSync(brickDir, { recursive: true })

    for (const [filename, content] of Object.entries(files)) {
      if (content) {
        fs.writeFileSync(path.join(brickDir, filename), content, 'utf-8')
      }
    }

    addBrickToRegistry(brickId)

    const response: CreateBrickResponse = { success: true, brickId, brickName }
    return NextResponse.json(response)
  } catch (error) {
    console.error('[create-brick]', error)
    const response: CreateBrickResponse = {
      success: false,
      brickId: '',
      brickName: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    }
    return NextResponse.json(response, { status: 500 })
  }
}
