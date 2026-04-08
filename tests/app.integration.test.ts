import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { app } from '../src/app.js'

describe('PayloadFix HTTP (integration)', () => {
  afterEach(() => {
    delete process.env.API_KEYS
  })

  describe('without API_KEYS', () => {
    it('GET / returns service json', async () => {
      const res = await app.request('http://test/')
      expect(res.status).toBe(200)
      const j = (await res.json()) as { service: string }
      expect(j.service).toBe('PayloadFix')
    })

    it('GET /v1/health', async () => {
      const res = await app.request('http://test/v1/health')
      expect(res.status).toBe(200)
      const j = (await res.json()) as { ok: boolean; endpoints: string[] }
      expect(j.ok).toBe(true)
      expect(j.endpoints).toContain('POST /v1/llm/stabilize')
    })

    it('POST /v1/llm/stabilize valid', async () => {
      const res = await app.request('http://test/v1/llm/stabilize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: '{"z":1,"a":2}', sortKeys: true }),
      })
      expect(res.status).toBe(200)
      const j = (await res.json()) as { ok: boolean; data: { a: number; z: number } }
      expect(j.ok).toBe(true)
      expect(j.data).toEqual({ a: 2, z: 1 })
    })

    it('POST /v1/llm/stabilize invalid body (not JSON)', async () => {
      const res = await app.request('http://test/v1/llm/stabilize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      })
      expect(res.status).toBe(400)
    })

    it('POST /v1/llm/stabilize 422 when cannot parse', async () => {
      const res = await app.request('http://test/v1/llm/stabilize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: 'totally {{{' }),
      })
      expect(res.status).toBe(422)
    })

    it('POST /v1/llm/stabilize validation: empty raw', async () => {
      const res = await app.request('http://test/v1/llm/stabilize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: '' }),
      })
      expect(res.status).toBe(400)
    })

    it('POST /v1/llm/stabilize strips markdown and returns llmHints', async () => {
      const res = await app.request('http://test/v1/llm/stabilize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw: '```json\n{"ok":true,}\n```',
          sortKeys: true,
        }),
      })
      expect(res.status).toBe(200)
      const j = (await res.json()) as { llmHints: string[]; data: { ok: boolean } }
      expect(j.data).toEqual({ ok: true })
      expect(j.llmHints).toContain('markdown_fence_removed')
    })

    it('POST /v1/text/stats', async () => {
      const res = await app.request('http://test/v1/text/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'hello world\nline2' }),
      })
      expect(res.status).toBe(200)
      const j = (await res.json()) as { words: number; lines: number; chars: number }
      expect(j.words).toBe(3)
      expect(j.lines).toBe(2)
      expect(j.chars).toBe(17)
    })

    it('POST /v1/text/stats rejects empty text', async () => {
      const res = await app.request('http://test/v1/text/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '' }),
      })
      expect(res.status).toBe(400)
    })

    it('POST /v1/text/stats rejects too long text', async () => {
      const res = await app.request('http://test/v1/text/stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'x'.repeat(512 * 1024 + 1) }),
      })
      expect(res.status).toBe(400)
    })

    it('POST /v1/hash/sha256 NIST vector abc', async () => {
      const res = await app.request('http://test/v1/hash/sha256', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'abc', encoding: 'utf8' }),
      })
      expect(res.status).toBe(200)
      const j = (await res.json()) as { sha256: string }
      expect(j.sha256).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      )
    })

    it('POST /v1/hash/sha256 empty via utf8 rejected by zod', async () => {
      const res = await app.request('http://test/v1/hash/sha256', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '' }),
      })
      expect(res.status).toBe(400)
    })

    it('POST /v1/hash/sha256 hex mode', async () => {
      const res = await app.request('http://test/v1/hash/sha256', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'deadbeef', encoding: 'hex' }),
      })
      expect(res.status).toBe(200)
      const j = (await res.json()) as { sha256: string }
      const { createHash } = await import('node:crypto')
      const expected = createHash('sha256').update(Buffer.from('deadbeef', 'hex')).digest('hex')
      expect(j.sha256).toBe(expected)
    })

    it('concurrent load (100 parallel health)', async () => {
      const all = await Promise.all(
        Array.from({ length: 100 }, () => app.request('http://test/v1/health')),
      )
      expect(all.every((r) => r.status === 200)).toBe(true)
    })

    it('CORS allow-origin on GET /v1/health', async () => {
      const res = await app.request('http://test/v1/health')
      expect(res.headers.get('access-control-allow-origin')).toBe('*')
    })
  })

  describe('with API_KEYS', () => {
    beforeEach(() => {
      process.env.API_KEYS = 'secret-a,secret-b'
    })

    it('rejects /v1/health without key', async () => {
      const res = await app.request('http://test/v1/health')
      expect(res.status).toBe(401)
    })

    it('allows /v1/health with X-API-Key', async () => {
      const res = await app.request('http://test/v1/health', {
        headers: { 'X-API-Key': 'secret-b' },
      })
      expect(res.status).toBe(200)
    })

    it('GET / is not protected', async () => {
      const res = await app.request('http://test/')
      expect(res.status).toBe(200)
    })

    it('rejects wrong key', async () => {
      const res = await app.request('http://test/v1/health', {
        headers: { 'X-API-Key': 'wrong' },
      })
      expect(res.status).toBe(401)
    })
  })
})
