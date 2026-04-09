import { computeConfidence, humanizeLlmHint } from './confidenceScoreService.js'
import { stabilizeFromLlm } from './llmOutputPipeline.js'
import { coerceObjectBySchema } from './typeCoercionService.js'
import { validateSimpleSchema, type FieldError } from './schemaValidationService.js'

export type ValidateSchemaRequest = {
  raw: string
  schema: Record<string, unknown>
  required?: string[]
  coerceTypes: boolean
  mode: 'strict' | 'lenient'
}

export type ValidateSchemaHttpResult = {
  status: 200 | 422
  body: Record<string, unknown>
}

function flatStringSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(schema)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

export function runLlmValidateSchema(req: ValidateSchemaRequest): ValidateSchemaHttpResult {
  const issues: string[] = []
  const parsed = stabilizeFromLlm(req.raw)

  if (!parsed.ok) {
    for (const h of parsed.llmHints) issues.push(humanizeLlmHint(h))
    return {
      status: 422,
      body: {
        success: false,
        error: {
          code: 'PARSE_FAILED',
          message: 'Could not extract valid JSON from the model output.',
          details: {
            parseCode: parsed.error,
            hint: parsed.hint,
            llmHints: parsed.llmHints,
          },
        },
        issues,
        llmHints: parsed.llmHints,
        confidence: 0,
      },
    }
  }

  for (const h of parsed.llmHints) issues.push(humanizeLlmHint(h))
  if (parsed.method === 'repaired') {
    issues.push('Repaired JSON syntax (jsonrepair)')
  }

  const { data, method, repairedFrom, llmHints } = parsed

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    const msg =
      'Parsed JSON must be a plain object for schema validation (not an array or primitive).'
    issues.push(msg)
    const confidence = computeConfidence({
      llmHints,
      repairedWithJsonrepair: method === 'repaired',
      coercionCount: 0,
      fieldErrorCount: 1,
    })
    const body = {
      success: false,
      error: {
        code: 'ROOT_NOT_OBJECT',
        message: msg,
      },
      issues,
      confidence,
      data,
    }
    if (req.mode === 'strict') return { status: 422, body }
    return { status: 200, body }
  }

  let dataObj = { ...(data as Record<string, unknown>) }
  const flatSchema = flatStringSchema(req.schema)

  let coercionMessages: string[] = []
  if (req.coerceTypes && Object.keys(flatSchema).length > 0) {
    const { data: coerced, messages } = coerceObjectBySchema(dataObj, flatSchema)
    dataObj = coerced
    coercionMessages = messages
    issues.push(...messages)
  }

  const validation = validateSimpleSchema({
    data: dataObj,
    schema: flatSchema,
    required: req.required,
  })

  const fieldErrors: FieldError[] = validation.fieldErrors
  for (const fe of fieldErrors) {
    issues.push(fe.message)
  }

  const confidence = computeConfidence({
    llmHints,
    repairedWithJsonrepair: method === 'repaired',
    coercionCount: coercionMessages.length,
    fieldErrorCount: fieldErrors.length,
  })

  const base = {
    data: dataObj,
    issues,
    fieldErrors,
    confidence,
    llmHints,
    method,
    repairedFrom,
  }

  if (validation.ok) {
    return {
      status: 200,
      body: {
        success: true,
        ...base,
      },
    }
  }

  const failBody = {
    success: false,
    error: {
      code: 'SCHEMA_VALIDATION_FAILED',
      message: 'One or more fields failed schema validation.',
    },
    ...base,
  }

  if (req.mode === 'strict') {
    return {
      status: 422,
      body: failBody,
    }
  }

  return {
    status: 200,
    body: failBody,
  }
}
