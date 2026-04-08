import { describe, expect, it } from 'vitest'
import {
  extractBalancedJson,
  stabilizeFromLlm,
  stripMarkdownFences,
} from './llmJsonPrep.js'

describe('stripMarkdownFences', () => {
  it('leaves plain JSON unchanged', () => {
    const r = stripMarkdownFences('{"a":1}')
    expect(r.stripped).toBe(false)
    expect(r.text).toBe('{"a":1}')
  })

  it('strips ```json fence', () => {
    const r = stripMarkdownFences('```json\n{"x":true}\n```')
    expect(r.stripped).toBe(true)
    expect(r.text).toBe('{"x":true}')
  })

  it('strips generic ``` fence', () => {
    const r = stripMarkdownFences('```\n[1,2,3]\n```')
    expect(r.stripped).toBe(true)
    expect(r.text).toBe('[1,2,3]')
  })
})

describe('extractBalancedJson', () => {
  it('extracts object from prose', () => {
    expect(extractBalancedJson('Sure! Here:\n{"b":2}\nThanks')).toBe('{"b":2}')
  })

  it('respects braces inside strings', () => {
    expect(extractBalancedJson('x {"a":"}"} y')).toBe('{"a":"}"}')
  })
})

describe('stabilizeFromLlm', () => {
  it('parses clean JSON', () => {
    const r = stabilizeFromLlm('{"a":1}')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).toEqual({ a: 1 })
      expect(r.llmHints).toEqual([])
    }
  })

  it('repairs trailing comma after fence strip', () => {
    const r = stabilizeFromLlm('```json\n{"a":1,}\n```')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).toEqual({ a: 1 })
      expect(r.llmHints).toContain('markdown_fence_removed')
    }
  })

  it('extracts and repairs embedded JSON', () => {
    const r = stabilizeFromLlm('The result is {"z":9,} as requested.')
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).toEqual({ z: 9 })
      expect(r.llmHints).toContain('embedded_json_extracted')
    }
  })

  it('returns hints on hard failure', () => {
    const r = stabilizeFromLlm('no json here {{{')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Array.isArray(r.llmHints)).toBe(true)
  })
})
