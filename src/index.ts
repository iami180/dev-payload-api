import { serve } from '@hono/node-server'
import { app } from './app.js'

const port = Number(process.env.PORT) || 3000
console.log(`PayloadFix listening on :${port}`)
serve({ fetch: app.fetch, port })
