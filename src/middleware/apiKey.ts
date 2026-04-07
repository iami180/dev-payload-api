import type { Context, Next } from 'hono'

export function apiKeyGate() {
  return async (c: Context, next: Next) => {
    const keys = process.env.API_KEYS?.split(',')
      .map((k) => k.trim())
      .filter(Boolean)
    if (!keys?.length) {
      await next()
      return
    }
    const header = c.req.header('X-API-Key') ?? c.req.header('x-api-key')
    if (!header || !keys.includes(header)) {
      return c.json({ error: 'unauthorized', message: 'Missing or invalid X-API-Key' }, 401)
    }
    await next()
  }
}
