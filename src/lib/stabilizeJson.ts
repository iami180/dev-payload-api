import { jsonrepair } from 'jsonrepair'

export type StabilizeResult =
  | { ok: true; data: unknown; method: 'direct' | 'repaired'; repairedFrom?: string }
  | { ok: false; error: string; hint?: string }

const MAX_LEN = 512 * 1024

export function stabilizeJsonInput(input: string): StabilizeResult {
  const trimmed = input.trim()
  if (trimmed.length > MAX_LEN) {
    return {
      ok: false,
      error: 'payload_too_large',
      hint: `Max ${MAX_LEN} bytes.`,
    }
  }

  try {
    const data = JSON.parse(trimmed) as unknown
    return { ok: true, data, method: 'direct' }
  } catch {
    try {
      const repaired = jsonrepair(trimmed)
      const data = JSON.parse(repaired) as unknown
      return { ok: true, data, method: 'repaired', repairedFrom: 'jsonrepair' }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'unknown'
      return {
        ok: false,
        error: 'invalid_json',
        hint: msg.slice(0, 200),
      }
    }
  }
}
