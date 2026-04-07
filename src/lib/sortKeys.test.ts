import { describe, expect, it } from 'vitest'
import { sortKeysDeep } from './sortKeys.js'

describe('sortKeysDeep', () => {
  it('sorts shallow object keys', () => {
    expect(sortKeysDeep({ z: 1, a: 2, m: 3 })).toEqual({ a: 2, m: 3, z: 1 })
  })

  it('preserves arrays order, sorts inside objects in elements', () => {
    const input = [{ b: 1, a: 2 }, { d: 3, c: 4 }]
    expect(sortKeysDeep(input)).toEqual([{ a: 2, b: 1 }, { c: 4, d: 3 }])
  })

  it('handles null and primitives', () => {
    expect(sortKeysDeep(null)).toBe(null)
    expect(sortKeysDeep(42)).toBe(42)
    expect(sortKeysDeep('x')).toBe('x')
  })

  it('deep nesting', () => {
    expect(sortKeysDeep({ z: { b: 1, a: 2 } })).toEqual({ z: { a: 2, b: 1 } })
  })

  it('many keys (stress)', () => {
    const obj: Record<string, number> = {}
    for (let i = 0; i < 2000; i++) obj[`k${i}`] = i
    const sorted = sortKeysDeep(obj) as Record<string, number>
    const keys = Object.keys(sorted)
    expect(keys.length).toBe(2000)
    const lexSorted = [...keys].sort()
    expect(keys).toEqual(lexSorted)
    expect(Object.values(sorted).reduce((a, b) => a + b, 0)).toBe((1999 * 2000) / 2)
  })

  it('unicode keys', () => {
    expect(sortKeysDeep({ ű: 1, á: 2 })).toEqual({ á: 2, ű: 1 })
  })
})
