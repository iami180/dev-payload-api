/**
 * Read a file containing raw LLM output (markdown fences, prose, broken JSON),
 * run the same pipeline as POST /v1/llm/stabilize, write pretty JSON to a file or stdout.
 *
 * Usage:
 *   npx tsx scripts/fix-llm-json.ts sample-llm-output.txt out.json
 *   npx tsx scripts/fix-llm-json.ts sample-llm-output.txt   # prints JSON to stdout
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { stabilizeFromLlm } from '../src/lib/llmJsonPrep.js'

const [, , inPath, outPath] = process.argv

if (!inPath) {
  console.error('Usage: npx tsx scripts/fix-llm-json.ts <input.txt> [output.json]')
  process.exit(1)
}

const raw = readFileSync(inPath, 'utf8')
const r = stabilizeFromLlm(raw)

if (!r.ok) {
  console.error(JSON.stringify(r, null, 2))
  process.exit(1)
}

const pretty = JSON.stringify(r.data, null, 2)

if (outPath) {
  writeFileSync(outPath, pretty + '\n', 'utf8')
  console.error('OK →', outPath, '| llmHints:', r.llmHints.join(', ') || '(none)')
} else {
  console.log(pretty)
}
