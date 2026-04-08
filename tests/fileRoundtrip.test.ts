import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { stabilizeFromLlm } from '../src/lib/llmJsonPrep.js'

describe('file-style roundtrip (tmp dir)', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs) {
      try {
        rmSync(d, { recursive: true })
      } catch {
        /* ignore */
      }
    }
    dirs.length = 0
  })

  it('writes repaired JSON from a saved LLM snippet file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'payloadfix-'))
    dirs.push(dir)
    const inp = join(dir, 'model-reply.txt')
    const out = join(dir, 'parsed.json')

    writeFileSync(
      inp,
      'Sure, here you go:\n```json\n{"items":[1,2,3],}\n```\nHope this helps.\n',
      'utf8',
    )

    const raw = readFileSync(inp, 'utf8')
    const r = stabilizeFromLlm(raw)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    writeFileSync(out, JSON.stringify(r.data, null, 2) + '\n', 'utf8')
    const parsed = JSON.parse(readFileSync(out, 'utf8')) as { items: number[] }
    expect(parsed.items).toEqual([1, 2, 3])
    expect(r.llmHints.length).toBeGreaterThan(0)
  })
})
