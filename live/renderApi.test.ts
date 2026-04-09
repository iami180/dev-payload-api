import { describe, expect, it } from 'vitest'

/**
 * Default: public Render deployment.
 * Override: PAYLOADFIX_LIVE_URL, optional PAYLOADFIX_API_KEY if the host uses API_KEYS.
 */
const BASE = (
  process.env.PAYLOADFIX_LIVE_URL || 'https://dev-payload-api.onrender.com'
).replace(/\/$/, '')

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {}
  const key = process.env.PAYLOADFIX_API_KEY
  if (key) h['X-API-Key'] = key
  return h
}

async function get(path: string): Promise<Response> {
  return fetch(`${BASE}${path}`, { headers: authHeaders() })
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  })
}

describe(`Live API — ${BASE}`, () => {
  it('GET / returns PayloadFix meta', async () => {
    const res = await get('/')
    expect(res.status).toBe(200)
    const j = (await res.json()) as {
      service: string
      version: string
      docs: string
    }
    expect(j.service).toBe('PayloadFix')
    expect(j.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(j.docs).toBe('/v1/health')
  })

  it('GET /v1/health returns 200 and endpoint list', async () => {
    const res = await get('/v1/health')
    if (res.status === 401) {
      throw new Error(
        'GET /v1/health → 401. If Render has API_KEYS, set env PAYLOADFIX_API_KEY to the same value.',
      )
    }
    expect(res.status).toBe(200)
    const j = (await res.json()) as { ok: boolean; endpoints: string[] }
    expect(j.ok).toBe(true)
    expect(j.endpoints).toContain('POST /v1/llm/stabilize')
    expect(j.endpoints).toContain('POST /v1/llm/validate-schema')
  })

  it('POST /v1/llm/stabilize repairs fenced JSON', async () => {
    const res = await postJson('/v1/llm/stabilize', {
      raw: 'Here:\n```json\n{"name":"Apple","price":"1999",}\n```',
      sortKeys: true,
    })
    if (res.status === 401) {
      throw new Error('401 — set PAYLOADFIX_API_KEY if the server uses API_KEYS')
    }
    expect(res.status).toBe(200)
    const j = (await res.json()) as {
      success: boolean
      data: { name: string; price: string }
    }
    expect(j.success).toBe(true)
    expect(j.data).toEqual({ name: 'Apple', price: '1999' })
  })

  it('POST /v1/llm/stabilize 422 on garbage input', async () => {
    const res = await postJson('/v1/llm/stabilize', {
      raw: '{{{ not json at all',
    })
    if (res.status === 401) {
      throw new Error('401 — set PAYLOADFIX_API_KEY if the server uses API_KEYS')
    }
    expect(res.status).toBe(422)
    const j = (await res.json()) as {
      success: boolean
      error: { code: string }
    }
    expect(j.success).toBe(false)
    expect(j.error.code).toBe('INVALID_JSON')
  })

  it('POST /v1/llm/validate-schema strict + coerceTypes', async () => {
    const res = await postJson('/v1/llm/validate-schema', {
      raw: '```json\n{"name":"Apple","price":"1999"}\n```',
      schema: { name: 'string', price: 'number' },
      required: ['name', 'price'],
      coerceTypes: true,
      mode: 'strict',
    })
    if (res.status === 401) {
      throw new Error('401 — set PAYLOADFIX_API_KEY if the server uses API_KEYS')
    }
    expect(res.status).toBe(200)
    const j = (await res.json()) as {
      success: boolean
      data: { name: string; price: number }
      issues: string[]
    }
    expect(j.success).toBe(true)
    expect(j.data).toEqual({ name: 'Apple', price: 1999 })
    expect(Array.isArray(j.issues)).toBe(true)
  })

  it('POST /v1/text/stats', async () => {
    const res = await postJson('/v1/text/stats', { text: 'hello\nworld' })
    if (res.status === 401) {
      throw new Error('401 — set PAYLOADFIX_API_KEY if the server uses API_KEYS')
    }
    expect(res.status).toBe(200)
    const j = (await res.json()) as { lines: number; success: boolean }
    expect(j.success).toBe(true)
    expect(j.lines).toBe(2)
  })

  it('POST /v1/hash/sha256 utf8', async () => {
    const res = await postJson('/v1/hash/sha256', { text: 'abc', encoding: 'utf8' })
    if (res.status === 401) {
      throw new Error('401 — set PAYLOADFIX_API_KEY if the server uses API_KEYS')
    }
    expect(res.status).toBe(200)
    const j = (await res.json()) as { sha256: string }
    expect(j.sha256).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
