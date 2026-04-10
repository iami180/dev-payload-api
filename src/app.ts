import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { apiError } from './lib/apiResponse.js'
import { stabilizeFromLlm } from './lib/llmJsonPrep.js'
import { sortKeysDeep } from './lib/sortKeys.js'
import { apiKeyGate } from './middleware/apiKey.js'
import { appendDriftLog } from './registry/driftLogService.js'
import { getMetering, recordMetering } from './registry/meteringService.js'
import { ensureDataDirs } from './registry/paths.js'
import {
  addRegistryVersion,
  createRegistrySchema,
  getRegistryDocument,
  getRegistrySchema,
  listRegistrySchemas,
} from './registry/schemaRegistryService.js'
import {
  countNestedSchemaPropertySlots,
  isNestedSchemaRoot,
  nestedSchemaCompileDepth,
} from './services/nestedSchemaService.js'
import { runLlmValidateSchema } from './services/llmValidateSchemaFlow.js'

function refineSchemaPayload(
  s: Record<string, unknown>,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  if (isNestedSchemaRoot(s)) {
    if (countNestedSchemaPropertySlots(s) > 250 || nestedSchemaCompileDepth(s) > 24) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'schema: nested max 250 property slots and depth 24',
        path,
      })
    }
  } else if (Object.keys(s).length > 200) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'schema: max 200 top-level keys',
      path,
    })
  }
  if (JSON.stringify(s).length > 48000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'schema: JSON serialized size max ~48 KiB',
      path,
    })
  }
}

function extractErrorCodes(o: Record<string, unknown>): string[] {
  const codes: string[] = []
  const e = o.error as { code?: string } | undefined
  if (e?.code) codes.push(e.code)
  const fe = o.fieldErrors as { code: string }[] | undefined
  if (Array.isArray(fe)) {
    for (const x of fe) {
      if (x?.code && !codes.includes(x.code)) codes.push(x.code)
    }
  }
  return codes
}

export const app = new Hono()

app.use('/*', cors({ origin: '*' }))
app.use('/v1/*', apiKeyGate())

app.get('/', (c) =>
  c.json({
    service: 'PayloadFix',
    tagline:
      'LLM output reliability: extract, repair, schema validation, coercion, and confidence for production pipelines',
    version: '0.5.0',
    docs: '/v1/health',
  }),
)

app.get('/v1/health', (c) =>
  c.json({
    ok: true,
    focus: 'Structured LLM output — parse, validate, coerce, strict/lenient modes',
    endpoints: [
      'POST /v1/llm/stabilize',
      'POST /v1/llm/validate-schema',
      'POST /v1/registry/schemas',
      'GET /v1/registry/schemas',
      'GET /v1/registry/schemas/:id',
      'POST /v1/registry/schemas/:id/versions',
      'GET /v1/registry/metering',
      'POST /v1/text/stats',
      'POST /v1/hash/sha256',
    ],
  }),
)

const stabilizeSchema = z.object({
  raw: z.string().min(1),
  sortKeys: z.boolean().optional().default(true),
  pretty: z.boolean().optional().default(true),
  /** When several `{...}` blocks exist: which to return (default: largest / tie → last in text). */
  preferJsonBlock: z.enum(['first', 'last', 'largest']).optional(),
})

app.post('/v1/llm/stabilize', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(
      apiError(
        'INVALID_BODY',
        'Request body must be valid JSON with a string field "raw".',
      ),
      400,
    )
  }

  const parsed = stabilizeSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      apiError('REQUEST_VALIDATION_FAILED', 'Request body validation failed.', {
        issues: parsed.error.issues,
      }),
      400,
    )
  }

  const { raw, sortKeys, pretty, preferJsonBlock } = parsed.data
  const result = stabilizeFromLlm(raw, preferJsonBlock ? { preferJsonBlock } : undefined)
  if (!result.ok) {
    await recordMetering({ kind: 'stabilize', success: false })
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: result.hint ?? 'Could not parse or repair JSON from the given text.',
          details: {
            parseCode: result.error,
            hint: result.hint,
            failedStage: result.failedStage,
            repairTrace: result.repairTrace,
            llmHints: result.llmHints,
          },
        },
        llmHints: result.llmHints,
        warnings: result.warnings,
      },
      422,
    )
  }

  let data = result.data
  if (sortKeys) data = sortKeysDeep(data)

  const output = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)

  await recordMetering({ kind: 'stabilize', success: true })
  return c.json({
    success: true,
    ok: true,
    method: result.method,
    repairedFrom: result.repairedFrom,
    llmHints: result.llmHints,
    warnings: result.warnings,
    data,
    stringified: output,
  })
})

const validateSchemaBody = z
  .object({
    raw: z.string().min(1).max(512 * 1024),
    schema: z.record(z.unknown()).optional(),
    schemaRef: z
      .object({
        schemaId: z.string().min(8).max(128),
        version: z.number().int().positive().optional(),
      })
      .optional(),
    required: z.array(z.string()).max(100).optional(),
    coerceTypes: z.boolean().optional().default(false),
    mode: z.enum(['strict', 'lenient']).default('strict'),
    unknownFieldPolicy: z
      .enum(['allow', 'reject', 'strip', 'report'])
      .optional()
      .default('allow'),
    contractEnforcement: z.boolean().optional().default(false),
    driftLog: z.boolean().optional().default(true),
    richFailureExplanations: z.boolean().optional().default(true),
  })
  .superRefine((val, ctx) => {
    if (!val.schema && !val.schemaRef) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either `schema` (inline) or `schemaRef` (registry).',
        path: ['schema'],
      })
    }
    if (val.schema) {
      refineSchemaPayload(val.schema as Record<string, unknown>, ctx, ['schema'])
    }
  })

const registryCreateBody = z
  .object({
    name: z.string().max(200).optional(),
    schema: z.record(z.unknown()),
  })
  .superRefine((val, ctx) => {
    refineSchemaPayload(val.schema as Record<string, unknown>, ctx, ['schema'])
  })

const registryVersionBody = z
  .object({
    schema: z.record(z.unknown()),
    changelog: z.string().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    refineSchemaPayload(val.schema as Record<string, unknown>, ctx, ['schema'])
  })

app.post('/v1/llm/validate-schema', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(
      apiError('INVALID_BODY', 'Request body must be valid JSON.'),
      400,
    )
  }

  const parsed = validateSchemaBody.safeParse(body)
  if (!parsed.success) {
    return c.json(
      apiError('REQUEST_VALIDATION_FAILED', 'Request body validation failed.', {
        issues: parsed.error.issues,
      }),
      400,
    )
  }

  await ensureDataDirs()

  let schema: Record<string, unknown>
  let registryContext: { schemaId: string; version: number } | undefined

  if (parsed.data.schemaRef) {
    const got = await getRegistrySchema(
      parsed.data.schemaRef.schemaId,
      parsed.data.schemaRef.version,
    )
    if (!got) {
      return c.json(
        apiError('SCHEMA_REF_NOT_FOUND', 'Unknown schemaId or version in schemaRef.', {
          schemaRef: parsed.data.schemaRef,
        }),
        404,
      )
    }
    schema = got.schema
    registryContext = { schemaId: parsed.data.schemaRef.schemaId, version: got.version }
  } else {
    schema = parsed.data.schema as Record<string, unknown>
  }

  const {
    raw,
    required,
    coerceTypes,
    mode,
    unknownFieldPolicy,
    contractEnforcement,
    driftLog,
    richFailureExplanations,
  } = parsed.data

  const { status, body: out } = runLlmValidateSchema({
    raw,
    schema,
    required,
    coerceTypes,
    mode,
    unknownFieldPolicy,
    contractEnforcement,
    richFailureExplanations,
    registryContext,
  })

  const outObj = out as Record<string, unknown>
  const success = outObj.success === true

  if (driftLog && registryContext) {
    const tr = outObj.transparency as
      | {
          coercions?: unknown[]
          removedFields?: string[]
          unknownFields?: string[]
        }
      | undefined
    void appendDriftLog({
      schemaId: registryContext.schemaId,
      schemaVersion: registryContext.version,
      success,
      httpStatus: status,
      errorCodes: extractErrorCodes(outObj),
      fieldErrorCount: Array.isArray(outObj.fieldErrors) ? outObj.fieldErrors.length : 0,
      coercionCount: Array.isArray(tr?.coercions) ? tr.coercions.length : 0,
      removedUnknownCount: Array.isArray(tr?.removedFields) ? tr.removedFields.length : 0,
      reportedUnknownCount: Array.isArray(tr?.unknownFields) ? tr.unknownFields.length : 0,
      contractEnforcement,
    })
  }

  await recordMetering({ kind: 'validateSchema', success })
  return c.json(out, status)
})

app.post('/v1/registry/schemas', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(apiError('INVALID_BODY', 'Request body must be valid JSON.'), 400)
  }
  const parsed = registryCreateBody.safeParse(body)
  if (!parsed.success) {
    return c.json(
      apiError('REQUEST_VALIDATION_FAILED', 'Request body validation failed.', {
        issues: parsed.error.issues,
      }),
      400,
    )
  }
  await ensureDataDirs()
  const { id, version } = await createRegistrySchema(
    parsed.data.name,
    parsed.data.schema as Record<string, unknown>,
  )
  return c.json({
    success: true,
    ok: true,
    schemaId: id,
    version,
    shapeDiffFromPrevious: null,
  })
})

app.get('/v1/registry/schemas', async (c) => {
  await ensureDataDirs()
  const schemas = await listRegistrySchemas()
  return c.json({ success: true, ok: true, schemas })
})

app.get('/v1/registry/schemas/:id', async (c) => {
  await ensureDataDirs()
  const id = c.req.param('id')
  const doc = await getRegistryDocument(id)
  if (!doc) {
    return c.json(apiError('NOT_FOUND', 'Unknown schema id.'), 404)
  }
  return c.json({ success: true, ok: true, ...doc })
})

app.post('/v1/registry/schemas/:id/versions', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(apiError('INVALID_BODY', 'Request body must be valid JSON.'), 400)
  }
  const parsed = registryVersionBody.safeParse(body)
  if (!parsed.success) {
    return c.json(
      apiError('REQUEST_VALIDATION_FAILED', 'Request body validation failed.', {
        issues: parsed.error.issues,
      }),
      400,
    )
  }
  await ensureDataDirs()
  const id = c.req.param('id')
  const r = await addRegistryVersion(
    id,
    parsed.data.schema as Record<string, unknown>,
    parsed.data.changelog,
  )
  if (!r) {
    return c.json(apiError('NOT_FOUND', 'Unknown schema id.'), 404)
  }
  return c.json({
    success: true,
    ok: true,
    version: r.version,
    shapeDiffFromPrevious: r.shapeDiffFromPrevious,
  })
})

app.get('/v1/registry/metering', async (c) => {
  await ensureDataDirs()
  const m = await getMetering()
  return c.json({ success: true, ok: true, metering: m })
})

const textSchema = z.object({
  text: z.string().min(1).max(512 * 1024),
})

app.post('/v1/text/stats', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(apiError('INVALID_BODY', 'Request body must be valid JSON.'), 400)
  }
  const parsed = textSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      apiError('REQUEST_VALIDATION_FAILED', 'Request body validation failed.', {
        issues: parsed.error.issues,
      }),
      400,
    )
  }
  const { text } = parsed.data
  const lines = text.split(/\r?\n/).length
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const chars = text.length
  const roughTokens = Math.ceil(chars / 4)
  return c.json({
    success: true,
    ok: true,
    chars,
    lines,
    words,
    roughTokensLlMHint: roughTokens,
    note: 'roughTokensLlMHint is ~chars/4, not a real tokenizer.',
  })
})

const hashSchema = z.object({
  text: z.string().min(1).max(512 * 1024),
  encoding: z.enum(['utf8', 'hex']).optional().default('utf8'),
})

app.post('/v1/hash/sha256', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json(apiError('INVALID_BODY', 'Request body must be valid JSON.'), 400)
  }
  const parsed = hashSchema.safeParse(body)
  if (!parsed.success) {
    return c.json(
      apiError('REQUEST_VALIDATION_FAILED', 'Request body validation failed.', {
        issues: parsed.error.issues,
      }),
      400,
    )
  }
  const { text, encoding } = parsed.data
  if (encoding === 'hex') {
    if (!/^[0-9a-fA-F]+$/.test(text) || text.length % 2 !== 0) {
      return c.json(
        apiError(
          'INVALID_HEX_INPUT',
          'Hex encoding requires a non-empty even-length hexadecimal string (0-9, a-f).',
        ),
        400,
      )
    }
  }
  const buf = encoding === 'hex' ? Buffer.from(text, 'hex') : Buffer.from(text, 'utf8')
  const hex = createHash('sha256').update(buf).digest('hex')
  return c.json({ success: true, ok: true, sha256: hex, encoding })
})
