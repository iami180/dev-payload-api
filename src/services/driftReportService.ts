import type { CoercionTrace } from './typeCoercionService.js'
import type { FieldError } from './schemaValidationService.js'
import { snapshotForTransparency } from './typeCoercionService.js'

const MAX_PREVIEW = 280

function truncate(s: string): string {
  if (s.length <= MAX_PREVIEW) return s
  return s.slice(0, MAX_PREVIEW) + '…'
}

/**
 * Read value at dot path like `user.age` or `items.0.name` from a root object.
 */
export function getValueAtPath(root: unknown, path: string): unknown {
  if (path === '' || path === '(root)') return root
  const parts = path.split('.')
  let cur: unknown = root
  for (const p of parts) {
    if (cur === null || cur === undefined) return undefined
    if (Array.isArray(cur)) {
      const i = Number(p)
      if (!Number.isInteger(i) || i < 0 || i >= cur.length) return undefined
      cur = cur[i]
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[p]
    } else {
      return undefined
    }
  }
  return cur
}

export type DriftFieldDetail = {
  field: string
  code: string
  /** What the payload had at this path (after unknown-field policy + coercion). */
  receivedPreview: string
  /** Human hint: expected vs got */
  note: string
  /** If this path was coerced earlier in the pipeline, before → after (JSON-safe). */
  beforeAfter?: { before: unknown; after: unknown }
}

export type DriftReport = {
  /** Paths where the contract was violated */
  driftFields: string[]
  /** Per-field detail for team debugging and “what drifted” */
  details: DriftFieldDetail[]
}

function previewValue(v: unknown): string {
  try {
    return truncate(JSON.stringify(snapshotForTransparency(v)))
  } catch {
    return truncate(String(v))
  }
}

function findCoercionForPath(coercions: CoercionTrace[], field: string): CoercionTrace | undefined {
  return coercions.find((c) => c.path === field)
}

/**
 * Build “which field drifted” + optional before/after when coercion touched that path.
 */
export function buildDriftReport(
  rootData: Record<string, unknown>,
  fieldErrors: FieldError[],
  coercions: CoercionTrace[],
): DriftReport {
  const driftFields = [...new Set(fieldErrors.map((e) => e.field))].sort()
  const details: DriftFieldDetail[] = []

  for (const fe of fieldErrors) {
    const raw = getValueAtPath(rootData, fe.field)
    const receivedPreview = previewValue(raw)
    const co = findCoercionForPath(coercions, fe.field)
    const beforeAfter = co
      ? { before: co.from, after: co.to }
      : findCoercionForPrefix(coercions, fe.field)

    let note = fe.message
    if (fe.code === 'type_mismatch') {
      note = `Schema expected a different JSON type than what arrived at "${fe.field}" (after any coercion). Compare receivedPreview with your contract.`
    } else if (fe.code === 'unknown_field') {
      note = `Key is not allowed under the active contract (reject/strip/report or additionalProperties: false).`
    } else if (fe.code === 'required_missing') {
      note = `Model output omitted this required path; pipeline cannot invent it.`
    }

    const row: DriftFieldDetail = {
      field: fe.field,
      code: fe.code,
      receivedPreview,
      note,
    }
    if (beforeAfter) row.beforeAfter = beforeAfter
    details.push(row)
  }

  return { driftFields, details }
}

/** Match coercion on parent path when error is on nested path (e.g. user.age vs user). */
function findCoercionForPrefix(
  coercions: CoercionTrace[],
  field: string,
): { before: unknown; after: unknown } | undefined {
  const parts = field.split('.')
  while (parts.length > 1) {
    parts.pop()
    const prefix = parts.join('.')
    const c = coercions.find((x) => x.path === prefix)
    if (c) return { before: c.from, after: c.to }
  }
  return undefined
}
