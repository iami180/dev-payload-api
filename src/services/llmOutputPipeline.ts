import type { StabilizeResult } from '../lib/stabilizeJson.js'
import { extractBalancedJson, stripMarkdownFences } from './jsonExtractionService.js'
import { parseOrRepairJson } from './jsonRepairService.js'

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

  let r = parseOrRepairJson(afterFence)
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
    r = parseOrRepairJson(cand)
    if (r.ok) return { ...r, llmHints: hints }
  }

  return { ...r, llmHints: hints }
}
