import type { StabilizeResult } from './stabilizeJson.js'
import { stabilizeJsonInput } from './stabilizeJson.js'

/** First ```json ... ``` or ``` ... ``` block, else whole-string fence trim. */
export function stripMarkdownFences(text: string): { text: string; stripped: boolean } {
  const s = text.trim()
  const block = /```(?:json)?\s*\n?([\s\S]*?)\n?```/i.exec(s)
  if (block) {
    const inner = block[1].trim()
    if (inner !== s) return { text: inner, stripped: true }
  }
  if (s.startsWith('```')) {
    let t = s.replace(/^```(?:json)?\s*\n?/i, '')
    t = t.replace(/\n?```\s*$/i, '').trim()
    if (t !== s) return { text: t, stripped: true }
  }
  return { text: s, stripped: false }
}

/**
 * First top-level `{...}` or `[...]` in the string, respecting JSON string literals.
 */
export function extractBalancedJson(text: string): string | null {
  const start = text.search(/[\[{]/)
  if (start === -1) return null

  const pairs: Record<string, string> = { '{': '}', '[': ']' }
  const stack: string[] = []

  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const c = text[i]

    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (c === '\\') {
        escape = true
        continue
      }
      if (c === '"') inString = false
      continue
    }

    if (c === '"') {
      inString = true
      continue
    }

    if (c === '{' || c === '[') {
      stack.push(c)
      continue
    }

    if (c === '}' || c === ']') {
      if (stack.length === 0) return null
      const last = stack[stack.length - 1]
      if (pairs[last] !== c) return null
      stack.pop()
      if (stack.length === 0) return text.slice(start, i + 1)
    }
  }

  return null
}

export type LlmStabilizeSuccess = Extract<StabilizeResult, { ok: true }> & {
  llmHints: string[]
}

export type LlmStabilizeResult =
  | LlmStabilizeSuccess
  | (Extract<StabilizeResult, { ok: false }> & { llmHints: string[] })

export function stabilizeFromLlm(raw: string): LlmStabilizeResult {
  const hints: string[] = []
  const { text: afterFence, stripped } = stripMarkdownFences(raw)
  if (stripped) hints.push('markdown_fence_removed')

  let r = stabilizeJsonInput(afterFence)
  if (r.ok) return { ...r, llmHints: hints }

  const candidates = [extractBalancedJson(afterFence), extractBalancedJson(raw.trim())].filter(
    (x): x is string => Boolean(x),
  )
  const seen = new Set<string>()
  let addedExtractHint = false

  for (const cand of candidates) {
    if (seen.has(cand)) continue
    seen.add(cand)
    if (cand === afterFence) continue
    if (!addedExtractHint) {
      hints.push('embedded_json_extracted')
      addedExtractHint = true
    }
    r = stabilizeJsonInput(cand)
    if (r.ok) return { ...r, llmHints: hints }
  }

  return { ...r, llmHints: hints }
}
