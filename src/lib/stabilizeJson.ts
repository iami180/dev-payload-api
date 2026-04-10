import { jsonrepair } from 'jsonrepair'

export type StabilizeFailureStage = 'payload_too_large' | 'syntax_repair'

export type StabilizeResult =
  | { ok: true; data: unknown; method: 'direct' | 'repaired'; repairedFrom?: string }
  | { ok: false; error: string; hint?: string; failedStage: StabilizeFailureStage }

const MAX_LEN = 512 * 1024

/**
 * Collapse `,,` / `, ,` sequences outside JSON strings (common LLM glitch).
 * Does not modify commas inside quoted strings.
 */
export function collapseDuplicateCommasOutsideStrings(s: string): string {
  let out = ''
  let i = 0
  let inString = false
  let escape = false
  while (i < s.length) {
    const c = s[i]
    if (inString) {
      out += c
      if (escape) {
        escape = false
      } else if (c === '\\') {
        escape = true
      } else if (c === '"') {
        inString = false
      }
      i++
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      i++
      continue
    }
    if (c === ',') {
      let j = i + 1
      while (j < s.length && /\s/.test(s[j]!)) j++
      if (j < s.length && s[j] === ',') {
        out += ','
        j++
        while (j < s.length && (s[j] === ',' || /\s/.test(s[j]!))) j++
        i = j
        continue
      }
    }
    out += c
    i++
  }
  return out
}

/** `({ ... })` / `( [ ... ] )` wrappers from JS expression output. */
export function stripOuterParenWrapper(s: string): string {
  const t = s.trim()
  if (!t.startsWith('(') || !t.endsWith(')')) return t
  const inner = t.slice(1, -1).trim()
  if (inner.startsWith('{') || inner.startsWith('[')) return inner
  return t
}

/** Remove `//` and `/* *\/` comments outside double-quoted JSON strings. */
export function stripJsonCommentsOutsideStrings(s: string): string {
  let out = ''
  let i = 0
  let inString = false
  let escape = false
  while (i < s.length) {
    const c = s[i]!
    if (inString) {
      out += c
      if (escape) {
        escape = false
      } else if (c === '\\') {
        escape = true
      } else if (c === '"') {
        inString = false
      }
      i++
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      i++
      continue
    }
    if (c === '/' && s[i + 1] === '/') {
      i += 2
      while (i < s.length && s[i] !== '\n' && s[i] !== '\r') i++
      continue
    }
    if (c === '/' && s[i + 1] === '*') {
      i += 2
      while (i < s.length - 1 && !(s[i] === '*' && s[i + 1] === '/')) i++
      i = Math.min(i + 2, s.length)
      continue
    }
    out += c
    i++
  }
  return out
}

/**
 * Python literals + bare `yes`/`no` (LLM invoice style) outside `"` strings.
 */
export function replaceNonJsonLiteralsOutsideStrings(s: string): string {
  const KW: { w: string; r: string }[] = [
    { w: '-Infinity', r: 'null' },
    { w: 'undefined', r: 'null' },
    { w: 'Infinity', r: 'null' },
    { w: 'NaN', r: 'null' },
    { w: 'None', r: 'null' },
    { w: 'True', r: 'true' },
    { w: 'False', r: 'false' },
    { w: 'yes', r: 'true' },
    { w: 'no', r: 'false' },
  ].sort((a, b) => b.w.length - a.w.length)
  let out = ''
  let i = 0
  let inString = false
  let escape = false
  while (i < s.length) {
    const c = s[i]!
    if (inString) {
      out += c
      if (escape) {
        escape = false
      } else if (c === '\\') {
        escape = true
      } else if (c === '"') {
        inString = false
      }
      i++
      continue
    }
    if (c === '"') {
      inString = true
      out += c
      i++
      continue
    }
    const rest = s.slice(i)
    let hit: { w: string; r: string } | undefined
    for (const k of KW) {
      if (!rest.startsWith(k.w)) continue
      const next = rest[k.w.length]
      if (next !== undefined && /[A-Za-z0-9_]/.test(next)) continue
      hit = k
      break
    }
    if (hit) {
      out += hit.r
      i += hit.w.length
      continue
    }
    out += c
    i++
  }
  return out
}

/** After JSON.parse: unwrap string layers that contain JSON text. */
export function unwrapJsonEncodedStringLayers(v: unknown): unknown {
  let cur: unknown = v
  for (let d = 0; d < 8; d++) {
    if (typeof cur !== 'string') return cur
    const t = cur.trim()
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        cur = JSON.parse(t) as unknown
        continue
      } catch {
        return cur
      }
    }
    if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
      try {
        cur = JSON.parse(t) as unknown
        continue
      } catch {
        return cur
      }
    }
    return cur
  }
  return cur
}

export function prepareJsonLikeInput(trimmed: string): string {
  let t = stripOuterParenWrapper(trimmed)
  t = stripJsonCommentsOutsideStrings(t)
  t = replaceNonJsonLiteralsOutsideStrings(t)
  t = collapseDuplicateCommasOutsideStrings(t)
  return t
}

export function stabilizeJsonInput(input: string): StabilizeResult {
  const trimmed = input.trim()
  if (trimmed.length > MAX_LEN) {
    return {
      ok: false,
      error: 'payload_too_large',
      hint: `Max ${MAX_LEN} bytes.`,
      failedStage: 'payload_too_large',
    }
  }

  try {
    let data = JSON.parse(trimmed) as unknown
    data = unwrapJsonEncodedStringLayers(data)
    return { ok: true, data, method: 'direct' }
  } catch {
    try {
      const prepared = prepareJsonLikeInput(trimmed)
      try {
        let data = JSON.parse(prepared) as unknown
        data = unwrapJsonEncodedStringLayers(data)
        return { ok: true, data, method: 'direct' }
      } catch {
        const repaired = jsonrepair(prepared)
        const data = JSON.parse(repaired) as unknown
        return { ok: true, data, method: 'repaired', repairedFrom: 'jsonrepair' }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown'
      return {
        ok: false,
        error: 'invalid_json',
        hint: msg.slice(0, 200),
        failedStage: 'syntax_repair',
      }
    }
  }
}
