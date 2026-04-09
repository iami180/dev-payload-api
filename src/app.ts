import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { apiError } from './lib/apiResponse.js'
import { stabilizeFromLlm } from './lib/llmJsonPrep.js'
import { sortKeysDeep } from './lib/sortKeys.js'
import { apiKeyGate } from './middleware/apiKey.js'
import { runLlmValidateSchema } from './services/llmValidateSchemaFlow.js'

export const app = new Hono()

app.use('/*', cors({ origin: '*' }))
app.use('/v1/*', apiKeyGate())

app.get('/', (c) =>
  c.json({
    service: 'PayloadFix',
    tagline:
      'LLM output reliability: extract, repair, schema validation, coercion, and confidence for production pipelines',
    version: '0.4.0',
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
      'POST /v1/text/stats',
      'POST /v1/hash/sha256',
    ],
  }),
)

const stabilizeSchema = z.object({
  raw: z.string().min(1),
  sortKeys: z.boolean().optional().default(true),
  pretty: z.boolean().optional().default(true),
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

  const { raw, sortKeys, pretty } = parsed.data
  const result = stabilizeFromLlm(raw)
  if (!result.ok) {
    return c.json(
      {
        success: false,
        error: {
          code: 'INVALID_JSON',
          message: result.hint ?? 'Could not parse or repair JSON from the given text.',
          details: {
            parseCode: result.error,
            hint: result.hint,
            llmHints: result.llmHints,
          },
        },
        llmHints: result.llmHints,
      },
      422,
    )
  }

  let data = result.data
  if (sortKeys) data = sortKeysDeep(data)

  const output = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)

  return c.json({
    success: true,
    ok: true,
    method: result.method,
    repairedFrom: result.repairedFrom,
    llmHints: result.llmHints,
    data,
    stringified: output,
  })
})

const validateSchemaBody = z.object({
  raw: z.string().min(1).max(512 * 1024),
  schema: z
    .record(z.unknown())
    .refine((s) => Object.keys(s).length <= 200, 'schema: max 200 keys')
    .refine((s) => JSON.stringify(s).length <= 48000, 'schema: payload too large'),
  required: z.array(z.string()).max(100).optional(),
  coerceTypes: z.boolean().optional().default(false),
  mode: z.enum(['strict', 'lenient']).default('strict'),
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

  const { raw, schema, required, coerceTypes, mode } = parsed.data
  const { status, body: out } = runLlmValidateSchema({
    raw,
    schema,
    required,
    coerceTypes,
    mode,
  })

  return c.json(out, status)
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
