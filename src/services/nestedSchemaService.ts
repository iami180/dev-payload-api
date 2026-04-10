import type { FieldError } from './schemaValidationService.js'
import { checkScalarType, normalizeScalarType } from './schemaValidationService.js'
import {
  coerceValue,
  type CoercionTrace,
  snapshotForTransparency,
} from './typeCoercionService.js'

export type CompiledSchemaNode =
  | { kind: 'scalar'; type: string }
  | {
      kind: 'object'
      properties: Record<string, CompiledSchemaNode>
      required: string[]
      /** false = unknown keys forbidden (like JSON Schema additionalProperties: false) */
      additionalProperties: boolean
    }
  | { kind: 'array'; items: CompiledSchemaNode }

const MAX_COMPILE_DEPTH = 24
const MAX_NODES = 500

/**
 * Nested JSON-schema-style root: `{ type: "object", properties: { ... } }`.
 * `properties` must be present (may be `{}`) so we never collide with a flat map
 * like `{ type: "object" }` meaning field "type" has JSON type object.
 */
export function isNestedSchemaRoot(schema: Record<string, unknown>): boolean {
  const t = schema.type
  if (typeof t !== 'string' || t.toLowerCase() !== 'object') return false
  if (!('properties' in schema)) return false
  const p = schema.properties
  return typeof p === 'object' && p !== null && !Array.isArray(p)
}

export function countNestedSchemaPropertySlots(schema: unknown): number {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return 0
  const o = schema as Record<string, unknown>
  const t = typeof o.type === 'string' ? o.type.toLowerCase() : ''
  if (t === 'object' && o.properties && typeof o.properties === 'object' && !Array.isArray(o.properties)) {
    const props = o.properties as Record<string, unknown>
    let n = Object.keys(props).length
    for (const v of Object.values(props)) n += countNestedSchemaPropertySlots(v)
    return n
  }
  if (t === 'array' && o.items !== undefined) return countNestedSchemaPropertySlots(o.items)
  return 0
}

export function nestedSchemaCompileDepth(schema: unknown, depth = 0): number {
  if (depth > MAX_COMPILE_DEPTH + 1) return depth
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return depth
  const o = schema as Record<string, unknown>
  const t = typeof o.type === 'string' ? o.type.toLowerCase() : ''
  if (t === 'object' && o.properties && typeof o.properties === 'object' && !Array.isArray(o.properties)) {
    const props = o.properties as Record<string, unknown>
    let max = depth
    for (const v of Object.values(props)) max = Math.max(max, nestedSchemaCompileDepth(v, depth + 1))
    return max
  }
  if (t === 'array' && o.items !== undefined) return nestedSchemaCompileDepth(o.items, depth + 1)
  return depth
}

function compileNode(
  raw: unknown,
  path: string,
  depth: number,
  nodeCount: { n: number },
): { ok: true; node: CompiledSchemaNode } | { ok: false; errors: FieldError[] } {
  if (depth > MAX_COMPILE_DEPTH) {
    return {
      ok: false,
      errors: [
        {
          field: path,
          code: 'schema_too_deep',
          message: `Nested schema exceeds max depth (${MAX_COMPILE_DEPTH})`,
        },
      ],
    }
  }
  if (nodeCount.n > MAX_NODES) {
    return {
      ok: false,
      errors: [
        {
          field: path,
          code: 'schema_too_large',
          message: `Nested schema exceeds max node count (${MAX_NODES})`,
        },
      ],
    }
  }

  if (typeof raw === 'string') {
    const t = normalizeScalarType(raw)
    if (!t) {
      return {
        ok: false,
        errors: [
          {
            field: path,
            code: 'invalid_schema_type',
            message: `Unknown type shorthand at "${path}"`,
          },
        ],
      }
    }
    if (t === 'object' || t === 'array') {
      return {
        ok: false,
        errors: [
          {
            field: path,
            code: 'invalid_schema',
            message: `At "${path}", use { "type": "object", "properties": {...} } or { "type": "array", "items": ... } instead of a string shorthand`,
          },
        ],
      }
    }
    nodeCount.n += 1
    return { ok: true, node: { kind: 'scalar', type: t } }
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      errors: [
        {
          field: path,
          code: 'invalid_schema',
          message: `Invalid schema node at "${path}" (expected object or type string)`,
        },
      ],
    }
  }

  const o = raw as Record<string, unknown>
  const typeRaw = o.type
  if (typeof typeRaw !== 'string') {
    return {
      ok: false,
      errors: [
        {
          field: path,
          code: 'invalid_schema',
          message: `Schema node at "${path}" must have string "type" or be a type shorthand string`,
        },
      ],
    }
  }

  const t = normalizeScalarType(typeRaw)
  if (!t) {
    return {
      ok: false,
      errors: [
        {
          field: `${path}.type`,
          code: 'invalid_schema_type',
          message: `Unknown type "${typeRaw}" at "${path}"`,
        },
      ],
    }
  }

  if (t === 'object') {
    nodeCount.n += 1
    const propsRaw = o.properties
    const properties: Record<string, CompiledSchemaNode> = {}
    if (propsRaw !== undefined && propsRaw !== null) {
      if (typeof propsRaw !== 'object' || Array.isArray(propsRaw)) {
        return {
          ok: false,
          errors: [
            {
              field: `${path}.properties`,
              code: 'invalid_schema',
              message: `"properties" at "${path}" must be an object`,
            },
          ],
        }
      }
      for (const [key, v] of Object.entries(propsRaw as Record<string, unknown>)) {
        const childPath = `${path}.properties.${key}`
        const c = compileNode(v, childPath, depth + 1, nodeCount)
        if (!c.ok) return c
        properties[key] = c.node
      }
    }

    let required: string[] = []
    const req = o.required
    if (req !== undefined) {
      if (!Array.isArray(req) || !req.every((x) => typeof x === 'string')) {
        return {
          ok: false,
          errors: [
            {
              field: `${path}.required`,
              code: 'invalid_schema',
              message: `"required" at "${path}" must be an array of strings`,
            },
          ],
        }
      }
      required = [...req]
    }

    let additionalProperties = true
    if ('additionalProperties' in o) {
      const ap = o.additionalProperties
      if (typeof ap !== 'boolean') {
        return {
          ok: false,
          errors: [
            {
              field: `${path}.additionalProperties`,
              code: 'invalid_schema',
              message: `"additionalProperties" at "${path}" must be a boolean`,
            },
          ],
        }
      }
      additionalProperties = ap
    }

    return { ok: true, node: { kind: 'object', properties, required, additionalProperties } }
  }

  if (t === 'array') {
    nodeCount.n += 1
    if (!('items' in o)) {
      return {
        ok: false,
        errors: [
          {
            field: path,
            code: 'invalid_schema',
            message: `Array schema at "${path}" must include "items"`,
          },
        ],
      }
    }
    const c = compileNode(o.items, `${path}.items`, depth + 1, nodeCount)
    if (!c.ok) return c
    return { ok: true, node: { kind: 'array', items: c.node } }
  }

  nodeCount.n += 1
  return { ok: true, node: { kind: 'scalar', type: t } }
}

export function compileNestedSchema(
  root: Record<string, unknown>,
): { ok: true; rootNode: CompiledSchemaNode } | { ok: false; errors: FieldError[] } {
  const counter = { n: 0 }
  const c = compileNode(root, 'schema', 0, counter)
  if (!c.ok) return c
  if (c.node.kind !== 'object') {
    return {
      ok: false,
      errors: [
        {
          field: 'schema',
          code: 'invalid_schema',
          message: 'Nested schema root must have type "object" with a properties map',
        },
      ],
    }
  }
  return { ok: true, rootNode: c.node }
}

function joinPath(base: string, seg: string | number): string {
  if (base === '') return String(seg)
  return `${base}.${seg}`
}

export function coerceNestedValue(
  value: unknown,
  node: CompiledSchemaNode,
  path: string,
  coerceTypes: boolean,
): { value: unknown; messages: string[]; coercions: CoercionTrace[] } {
  if (!coerceTypes) return { value, messages: [], coercions: [] }

  switch (node.kind) {
    case 'scalar': {
      const before = value
      const { value: v, coerced, message } = coerceValue(value, node.type)
      const messages =
        coerced && message ? [`${path || '(root)'}: ${message}`] : []
      const coercions: CoercionTrace[] = []
      if (coerced) {
        coercions.push({
          path: path || '(root)',
          from: snapshotForTransparency(before),
          to: snapshotForTransparency(v),
          message,
        })
      }
      return { value: v, messages, coercions }
    }
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return { value, messages: [], coercions: [] }
      }
      const o = value as Record<string, unknown>
      const out = { ...o }
      const messages: string[] = []
      const coercions: CoercionTrace[] = []
      for (const [key, child] of Object.entries(node.properties)) {
        if (!(key in out)) continue
        const sub = coerceNestedValue(out[key], child, joinPath(path, key), coerceTypes)
        out[key] = sub.value
        messages.push(...sub.messages)
        coercions.push(...sub.coercions)
      }
      return { value: out, messages, coercions }
    }
    case 'array': {
      if (!Array.isArray(value)) return { value, messages: [], coercions: [] }
      const arr = [...value]
      const messages: string[] = []
      const coercions: CoercionTrace[] = []
      for (let i = 0; i < arr.length; i += 1) {
        const sub = coerceNestedValue(arr[i], node.items, joinPath(path, i), coerceTypes)
        arr[i] = sub.value
        messages.push(...sub.messages)
        coercions.push(...sub.coercions)
      }
      return { value: arr, messages, coercions }
    }
  }
}

function describeValueType(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

export function validateNestedValue(
  value: unknown,
  node: CompiledSchemaNode,
  path: string,
  fieldErrors: FieldError[],
  objectRequired: string[] | undefined,
): void {
  switch (node.kind) {
    case 'scalar': {
      if (!checkScalarType(value, node.type)) {
        fieldErrors.push({
          field: path || '(root)',
          code: 'type_mismatch',
          message: `Field "${path || '(root)'}" expected type "${node.type}" but got ${describeValueType(value)}`,
        })
      }
      break
    }
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        fieldErrors.push({
          field: path || '(root)',
          code: 'type_mismatch',
          message: `Field "${path || '(root)'}" expected object but got ${describeValueType(value)}`,
        })
        return
      }
      const obj = value as Record<string, unknown>
      const req = objectRequired ?? node.required
      for (const key of req) {
        if (!(key in obj) || obj[key] === undefined) {
          fieldErrors.push({
            field: joinPath(path, key),
            code: 'required_missing',
            message: `Required field "${joinPath(path, key)}" is missing`,
          })
        }
      }
      for (const [key, child] of Object.entries(node.properties)) {
        if (!(key in obj)) continue
        const v = obj[key]
        if (v === undefined) {
          fieldErrors.push({
            field: joinPath(path, key),
            code: 'undefined_value',
            message: `Field "${joinPath(path, key)}" is undefined`,
          })
          continue
        }
        validateNestedValue(v, child, joinPath(path, key), fieldErrors, undefined)
      }
      break
    }
    case 'array': {
      if (!Array.isArray(value)) {
        fieldErrors.push({
          field: path || '(root)',
          code: 'type_mismatch',
          message: `Field "${path || '(root)'}" expected array but got ${describeValueType(value)}`,
        })
        return
      }
      for (let i = 0; i < value.length; i += 1) {
        validateNestedValue(value[i], node.items, joinPath(path, i), fieldErrors, undefined)
      }
      break
    }
  }
}

export function validateNestedRoot(
  data: unknown,
  rootNode: CompiledSchemaNode,
  extraRootRequired: string[] | undefined,
): { ok: boolean; fieldErrors: FieldError[] } {
  const fieldErrors: FieldError[] = []
  if (rootNode.kind !== 'object') {
    fieldErrors.push({
      field: 'schema',
      code: 'invalid_schema',
      message: 'Internal error: nested root must be an object node',
    })
    return { ok: false, fieldErrors }
  }
  const mergedRequired = [...new Set([...rootNode.required, ...(extraRootRequired ?? [])])]
  validateNestedValue(data, rootNode, '', fieldErrors, mergedRequired)
  return { ok: fieldErrors.length === 0, fieldErrors }
}
