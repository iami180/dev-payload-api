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

/** Thousands separators and trailing % (e.g. "1,999.99", "15%"). */
function parseLooseNumericString(s: string): number | null {
  let t = s.trim()
  if (t.endsWith('%')) t = t.slice(0, -1).trim()
  t = t.replace(/,/g, '')
  if (t === '') return null
  const n = Number(t)
  return !Number.isNaN(n) && Number.isFinite(n) ? n : null
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
    if (typeof value === 'string') {
      if (isNumberString(value)) {
        const n = Number(value.trim())
        return { value: n, coerced: true, message: `Coerced number from string "${value}"` }
      }
      const loose = parseLooseNumericString(value)
      if (loose !== null) {
        return {
          value: loose,
          coerced: true,
          message: `Coerced number from normalized string "${value}"`,
        }
      }
    }
    return { value, coerced: false }
  }

  if (exp === 'integer') {
    if (typeof value === 'number' && Number.isInteger(value)) return { value, coerced: false }
    if (typeof value === 'string') {
      if (isIntegerString(value)) {
        const n = parseInt(value.trim(), 10)
        return { value: n, coerced: true, message: `Coerced integer from string "${value}"` }
      }
      const loose = parseLooseNumericString(value)
      if (loose !== null && Number.isInteger(loose)) {
        return {
          value: loose,
          coerced: true,
          message: `Coerced integer from normalized string "${value}"`,
        }
      }
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
  coercions: CoercionTrace[]
}

/** JSON-safe snapshot for transparency (no circular refs). */
export function snapshotForTransparency(v: unknown): unknown {
  if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
    return v
  if (typeof v === 'bigint') return v.toString()
  if (typeof v === 'undefined') return null
  try {
    return JSON.parse(JSON.stringify(v)) as unknown
  } catch {
    return String(v)
  }
}

export type CoercionTrace = {
  path: string
  from: unknown
  to: unknown
  message?: string
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
  const coercions: CoercionTrace[] = []

  for (const [key, expectedRaw] of Object.entries(schema)) {
    if (typeof expectedRaw !== 'string') continue
    if (!(key in out)) continue

    const before = out[key]
    const { value, coerced, message } = coerceValue(before, expectedRaw)
    out[key] = value
    if (coerced && message) messages.push(message)
    if (coerced) {
      coercions.push({
        path: key,
        from: snapshotForTransparency(before),
        to: snapshotForTransparency(value),
        message,
      })
    }
  }

  return { data: out, messages, coercions }
}
