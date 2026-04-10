/**
 * Reads examples/messy-llm-output.txt and POSTs it to PayloadFix /v1/llm/stabilize.
 * Usage: from repo root, with server running: node examples/demo-stabilize.mjs
 * Env: PAYLOADFIX_URL (default http://127.0.0.1:3000), PAYLOADFIX_API_KEY (optional)
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const base = process.env.PAYLOADFIX_URL ?? 'http://127.0.0.1:3000'
const apiKey = process.env.PAYLOADFIX_API_KEY

const raw = await readFile(join(__dirname, 'messy-llm-output.txt'), 'utf8')

const headers = { 'Content-Type': 'application/json' }
if (apiKey) headers['X-API-Key'] = apiKey

const res = await fetch(`${base.replace(/\/$/, '')}/v1/llm/stabilize`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ raw, sortKeys: true, pretty: true }),
})

const out = await res.json()
const outPath = join(__dirname, 'stabilize-response.json')
await writeFile(outPath, JSON.stringify(out, null, 2), 'utf8')

console.log(`HTTP ${res.status} → wrote ${outPath}`)
if (out.success && out.data) {
  console.log('\nParsed data:\n', JSON.stringify(out.data, null, 2))
} else {
  console.log('\nResponse:', JSON.stringify(out, null, 2))
  process.exitCode = 1
}
