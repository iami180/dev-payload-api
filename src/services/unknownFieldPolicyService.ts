import type { CompiledSchemaNode } from './nestedSchemaService.js'
import type { FieldError } from './schemaValidationService.js'

export type UnknownFieldPolicy = 'allow' | 'reject' | 'strip' | 'report'

function joinPath(base: string, seg: string | number): string {
  if (base === '') return String(seg)
  return `${base}.${seg}`
}

/**
 * Apply unknown-key policy for flat schema (root object only).
 */
export function applyUnknownFieldsFlat(
  data: Record<string, unknown>,
  allowedKeys: Set<string>,
  policy: UnknownFieldPolicy,
): {
  data: Record<string, unknown>
  fieldErrors: FieldError[]
  unknownFields: string[]
  removedFields: string[]
} {
  const fieldErrors: FieldError[] = []
  const unknownFields: string[] = []
  const removedFields: string[] = []
  const out = { ...data }

  for (const key of Object.keys(out)) {
    if (allowedKeys.has(key)) continue
    const path = key
    if (policy === 'reject') {
      fieldErrors.push({
        field: path,
        code: 'unknown_field',
        message: `Unknown field "${path}" is not allowed by the schema`,
      })
    } else if (policy === 'strip') {
      delete out[key]
      removedFields.push(path)
    } else if (policy === 'report') {
      unknownFields.push(path)
    }
  }

  return { data: out, fieldErrors, unknownFields, removedFields }
}

/**
 * Unknown keys + optional additionalProperties:false on nested object nodes.
 */
export function applyUnknownFieldsNested(
  value: unknown,
  node: CompiledSchemaNode,
  path: string,
  policy: UnknownFieldPolicy,
): {
  value: unknown
  fieldErrors: FieldError[]
  unknownFields: string[]
  removedFields: string[]
} {
  const fieldErrors: FieldError[] = []
  const unknownFields: string[] = []
  const removedFields: string[] = []

  if (node.kind !== 'object') {
    return { value, fieldErrors, unknownFields, removedFields }
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { value, fieldErrors, unknownFields, removedFields }
  }

  let obj = { ...(value as Record<string, unknown>) }
  const allowed = new Set(Object.keys(node.properties))

  for (const key of Object.keys(obj)) {
    if (allowed.has(key)) continue
    const p = joinPath(path, key)
    const closed = !node.additionalProperties

    if (closed) {
      if (policy === 'strip') {
        delete obj[key]
        removedFields.push(p)
        continue
      }
      if (policy === 'report') {
        unknownFields.push(p)
        continue
      }
      fieldErrors.push({
        field: p,
        code: 'unknown_field',
        message: `Unknown field "${p}" is not allowed by the schema`,
      })
      continue
    }

    if (policy === 'reject') {
      fieldErrors.push({
        field: p,
        code: 'unknown_field',
        message: `Unknown field "${p}" is not allowed by the schema`,
      })
      continue
    }
    if (policy === 'strip') {
      delete obj[key]
      removedFields.push(p)
    } else if (policy === 'report') {
      unknownFields.push(p)
    }
  }

  for (const [key, child] of Object.entries(node.properties)) {
    if (!(key in obj)) continue
    const sub = applyUnknownFieldsNested(obj[key], child, joinPath(path, key), policy)
    obj[key] = sub.value
    fieldErrors.push(...sub.fieldErrors)
    unknownFields.push(...sub.unknownFields)
    removedFields.push(...sub.removedFields)
  }

  return { value: obj, fieldErrors, unknownFields, removedFields }
}
