import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { sortKeysDeep } from './lib/sortKeys.js'
import { stabilizeJsonInput } from './lib/stabilizeJson.js'
import { apiKeyGate } from './middleware/apiKey.js'

export const app = new Hono()

app.use('/*', cors({ origin: '*' }))
app.use('/v1/*', apiKeyGate())

app.get('/', (c) =>
  c.json({
    service: 'PayloadFix',
    tagline: 'Low-stakes JSON + text utilities for dev / LLM pipelines',
    version: '0.1.0',
    docs: '/v1/health',
  }),
)

app.get('/v1/health', (c) =>
  c.json({
    ok: true,
    endpoints: [
      'POST /v1/json/stabilize',
      'POST /v1/text/stats',
      'POST /v1/hash/sha256',
    ],
    disclaimer:
      'Best-effort tools for development. Do not use as sole input for financial, legal, or safety-critical decisions.',
  }),
)

const stabilizeSchema = z.object({
  raw: z.string().min(1),
  sortKeys: z.boolean().optional().default(true),
  pretty: z.boolean().optional().default(true),
})

app.post('/v1/json/stabilize', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_body', message: 'Expected JSON object with { raw: string }' }, 400)
  }

  const parsed = stabilizeSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.issues }, 400)
  }

  const { raw, sortKeys, pretty } = parsed.data
  const result = stabilizeJsonInput(raw)
  if (!result.ok) {
    return c.json(result, 422)
  }

  let data = result.data
  if (sortKeys) data = sortKeysDeep(data)

  const output = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data)

  return c.json({
    ok: true,
    method: result.method,
    repairedFrom: result.repairedFrom,
    data,
    stringified: output,
  })
})

const textSchema = z.object({
  text: z.string().min(1).max(512 * 1024),
})

app.post('/v1/text/stats', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_body' }, 400)
  }
  const parsed = textSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.issues }, 400)
  }
  const { text } = parsed.data
  const lines = text.split(/\r?\n/).length
  const words = text.trim().split(/\s+/).filter(Boolean).length
  const chars = text.length
  const roughTokens = Math.ceil(chars / 4)
  return c.json({
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
    return c.json({ error: 'invalid_body' }, 400)
  }
  const parsed = hashSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'validation_error', issues: parsed.error.issues }, 400)
  }
  const { text, encoding } = parsed.data
  const buf = encoding === 'hex' ? Buffer.from(text, 'hex') : Buffer.from(text, 'utf8')
  const hex = createHash('sha256').update(buf).digest('hex')
  return c.json({ ok: true, sha256: hex, encoding })
})
