export type FieldError = {
  field: string
  code: string
  message: string
}

const ALLOWED = new Set(['string', 'number', 'integer', 'boolean', 'array', 'object', 'any'])

function normalizeExpected(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.toLowerCase()
  return ALLOWED.has(s) ? s : null
}

function checkType(value: unknown, expected: string): boolean {
  switch (expected) {
    case 'any':
      return true
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value)
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value) && !Number.isNaN(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'array':
      return Array.isArray(value)
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    default:
      return false
  }
}

export type SchemaValidationInput = {
  data: Record<string, unknown>
  schema: Record<string, unknown>
  required?: string[]
}

export type SchemaValidationResult = {
  ok: boolean
  fieldErrors: FieldError[]
}

/**
 * Flat schema: each key maps to a type name string (e.g. "string", "number").
 */
export function validateSimpleSchema(input: SchemaValidationInput): SchemaValidationResult {
  const fieldErrors: FieldError[] = []
  const { data, schema, required = [] } = input

  for (const key of required) {
    if (!(key in data) || data[key] === undefined) {
      fieldErrors.push({
        field: key,
        code: 'required_missing',
        message: `Required field "${key}" is missing`,
      })
    }
  }

  for (const [key, expectedRaw] of Object.entries(schema)) {
    const expected = normalizeExpected(expectedRaw)
    if (expected === null) {
      fieldErrors.push({
        field: key,
        code: 'invalid_schema_type',
        message: `Unknown schema type for "${key}"`,
      })
      continue
    }

    if (!(key in data)) continue

    const value = data[key]
    if (value === undefined) {
      fieldErrors.push({
        field: key,
        code: 'undefined_value',
        message: `Field "${key}" is undefined`,
      })
      continue
    }

    if (!checkType(value, expected)) {
      fieldErrors.push({
        field: key,
        code: 'type_mismatch',
        message: `Field "${key}" expected type "${expected}" but got ${describeType(value)}`,
      })
    }
  }

  return { ok: fieldErrors.length === 0, fieldErrors }
}

function describeType(v: unknown): string {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}
