import { describe, expect, it } from 'vitest'
import { app } from '../src/app.js'
import { sortKeysDeep } from '../src/lib/sortKeys.js'
import { stabilizeJsonInput } from '../src/lib/stabilizeJson.js'

describe('stress / adversarial', () => {
  it('sortKeysDeep is idempotent', () => {
    const o = { z: { b: 1, a: [{ c: 1, b: 2 }] } }
    const once = sortKeysDeep(o)
    const twice = sortKeysDeep(once)
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice))
  })

  it('null byte inside JSON string', () => {
    const r = stabilizeJsonInput('{"a":"\\u0000"}')
    expect(r.ok).toBe(true)
    if (r.ok) expect((r.data as { a: string }).a).toBe('\u0000')
  })

  it('very long single-line JSON object (repair path)', () => {
    const inner = Array.from({ length: 500 }, (_, i) => `"k${i}":${i}`).join(',')
    const broken = `{${inner},}`
    const r = stabilizeJsonInput(broken)
    expect(r.ok).toBe(true)
  })

  it('unicode RTL override characters in string', () => {
    const raw = JSON.stringify({ x: '\u202eTEST' })
    const r = stabilizeJsonInput(raw)
    expect(r.ok).toBe(true)
  })

  it('POST llm/stabilize with sortKeys false preserves key order', async () => {
    const res = await app.request('http://test/v1/llm/stabilize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raw: '{"z":1,"a":2}',
        sortKeys: false,
        pretty: false,
      }),
    })
    expect(res.status).toBe(200)
    const j = (await res.json()) as { data: Record<string, number> }
    expect(Object.keys(j.data)).toEqual(['z', 'a'])
  })

  it('rapid sequential stabilize calls', async () => {
    for (let i = 0; i < 200; i++) {
      const r = stabilizeJsonInput(`{"i":${i}}`)
      expect(r.ok).toBe(true)
    }
  })
})
