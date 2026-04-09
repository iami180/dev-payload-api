export type CoercionResult = {
  value: unknown
  coerced: boolean
  message?: string
}

const TRUTHY = new Set(['true', 'yes', '1', 'on'])
const FALSY = new Set(['false', 'no', '0', 'off'])

function isIntegerString(s: string): boolean {
  return /^-?\d+$/.test(s.trim())
}

function isNumberString(s: string): boolean {
  const t = s.trim()
  if (t === '') return false
  const n = Number(t)
  return !Number.isNaN(n) && Number.isFinite(n)
}

/**
 * Coerce a single value toward `expected` type string (simple schema).
 */
export function coerceValue(value: unknown, expected: string): CoercionResult {
  const exp = expected.toLowerCase()

  if (exp === 'any') return { value, coerced: false }

  if (exp === 'boolean') {
    if (typeof value === 'boolean') return { value, coerced: false }
    if (typeof value === 'string') {
      const s = value.trim().toLowerCase()
      if (TRUTHY.has(s)) return { value: true, coerced: true, message: `Coerced boolean from string "${value}"` }
      if (FALSY.has(s)) return { value: false, coerced: true, message: `Coerced boolean from string "${value}"` }
    }
    if (typeof value === 'number') {
      if (value === 1) return { value: true, coerced: true, message: 'Coerced boolean from number 1' }
      if (value === 0) return { value: false, coerced: true, message: 'Coerced boolean from number 0' }
    }
    return { value, coerced: false }
  }

  if (exp === 'number') {
    if (typeof value === 'number' && !Number.isNaN(value)) return { value, coerced: false }
    if (typeof value === 'string' && isNumberString(value)) {
      const n = Number(value.trim())
      return { value: n, coerced: true, message: `Coerced number from string "${value}"` }
    }
    return { value, coerced: false }
  }

  if (exp === 'integer') {
    if (typeof value === 'number' && Number.isInteger(value)) return { value, coerced: false }
    if (typeof value === 'string' && isIntegerString(value)) {
      const n = parseInt(value.trim(), 10)
      return { value: n, coerced: true, message: `Coerced integer from string "${value}"` }
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const n = Math.trunc(value)
      if (n !== value) {
        return { value: n, coerced: true, message: 'Coerced integer by truncating number' }
      }
    }
    return { value, coerced: false }
  }

  if (exp === 'string') {
    if (typeof value === 'string') return { value, coerced: false }
    if (value === null || value === undefined) return { value, coerced: false }
    const s = String(value)
    return { value: s, coerced: true, message: `Coerced string from ${typeof value}` }
  }

  return { value, coerced: false }
}

export type CoercionWalkResult = {
  data: Record<string, unknown>
  messages: string[]
}

/**
 * Apply coercion for each key declared in `schema` (flat map: key → type string).
 */
export function coerceObjectBySchema(
  obj: Record<string, unknown>,
  schema: Record<string, unknown>,
): CoercionWalkResult {
  const out = { ...obj }
  const messages: string[] = []

  for (const [key, expectedRaw] of Object.entries(schema)) {
    if (typeof expectedRaw !== 'string') continue
    if (!(key in out)) continue

    const { value, coerced, message } = coerceValue(out[key], expectedRaw)
    out[key] = value
    if (coerced && message) messages.push(message)
  }

  return { data: out, messages }
}
