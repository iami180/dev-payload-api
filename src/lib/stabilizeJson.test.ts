import { describe, expect, it } from 'vitest'
import { stabilizeJsonInput } from './stabilizeJson.js'

describe('stabilizeJsonInput', () => {
  it('parses valid JSON', () => {
    const r = stabilizeJsonInput('{"a":1}')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.method).toBe('direct')
      expect(r.data).toEqual({ a: 1 })
    }
  })

  it('trims whitespace', () => {
    const r = stabilizeJsonInput('  \n{"x":true}\n  ')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toEqual({ x: true })
  })

  it('repairs trailing comma (jsonrepair)', () => {
    const r = stabilizeJsonInput('{"a":1,}')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.method).toBe('repaired')
      expect(r.repairedFrom).toBe('jsonrepair')
      expect(r.data).toEqual({ a: 1 })
    }
  })

  it('rejects over max length', () => {
    const huge = 'x'.repeat(512 * 1024 + 1)
    const r = stabilizeJsonInput(huge)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('payload_too_large')
  })

  it('rejects one byte over max (JSON string)', () => {
    const over = `"${'x'.repeat(512 * 1024 - 1)}"`
    expect(over.length).toBe(512 * 1024 + 1)
    expect(stabilizeJsonInput(over).ok).toBe(false)
  })

  it('accepts exactly max-sized valid JSON string', () => {
    const raw = `"${'y'.repeat(512 * 1024 - 2)}"`
    expect(raw.length).toBe(512 * 1024)
    const r = stabilizeJsonInput(raw)
    expect(r.ok).toBe(true)
  })

  it('unicode and emoji in JSON', () => {
    const r = stabilizeJsonInput('{"msg":"你好","e":"🚀"}')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toEqual({ msg: '你好', e: '🚀' })
  })

  it('fails on unrepaired garbage', () => {
    const r = stabilizeJsonInput('not json at all {{{')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('invalid_json')
  })

  it('parses deep nesting (100 levels)', () => {
    function deep(n: number): unknown {
      if (n <= 0) return 1
      return { nested: deep(n - 1) }
    }
    const raw = JSON.stringify(deep(100))
    const r = stabilizeJsonInput(raw)
    expect(r.ok).toBe(true)
  })
})
