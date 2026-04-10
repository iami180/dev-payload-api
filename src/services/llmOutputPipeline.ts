import type { StabilizeResult } from '../lib/stabilizeJson.js'
import {
  extractAllBalancedJson,
  extractBalancedJson,
  stripMarkdownFences,
} from './jsonExtractionService.js'
import { parseOrRepairJson } from './jsonRepairService.js'

export type LlmStabilizeSuccess = Extract<StabilizeResult, { ok: true }> & {
  llmHints: string[]
  /** Non-fatal: e.g. multiple balanced JSON candidates were evaluated */
  warnings: string[]
}

export type LlmStabilizeResult =
  | LlmStabilizeSuccess
  | (Extract<StabilizeResult, { ok: false }> & {
      llmHints: string[]
      warnings: string[]
      /** Ordered stages attempted — for debugging / product telemetry (no phrase-specific logic). */
      repairTrace: string[]
    })

/** When several top-level `{...}` fragments exist after extraction. */
export type StabilizeFromLlmOptions = {
  preferJsonBlock?: 'first' | 'last' | 'largest'
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/**
 * jsonrepair sometimes turns "prose + JSON" into [string, object] or [string, array]
 * (e.g. label line + products array).
 */
function isProseStitchedArray(data: unknown): boolean {
  if (!Array.isArray(data) || data.length < 2) return false
  const hasString = data.some((x) => typeof x === 'string')
  if (!hasString) return false
  const hasPlainObject = data.some(
    (x) => x !== null && typeof x === 'object' && !Array.isArray(x),
  )
  const hasArrayPayload = data.some((x) => Array.isArray(x))
  return hasPlainObject || hasArrayPayload
}

type Ok = Extract<StabilizeResult, { ok: true }>

function parseFragments(fragments: string[]): Array<{ frag: string; r: Ok }> {
  const out: Array<{ frag: string; r: Ok }> = []
  for (const f of fragments) {
    const p = parseOrRepairJson(f)
    if (p.ok) out.push({ frag: f, r: p })
  }
  return out
}

export function stabilizeFromLlm(raw: string, options?: StabilizeFromLlmOptions): LlmStabilizeResult {
  const hints: string[] = []
  const warnings: string[] = []
  const repairTrace: string[] = ['ingest_raw']
  const { text: afterFence, stripped } = stripMarkdownFences(raw)
  if (stripped) {
    hints.push('markdown_fence_removed')
    repairTrace.push('markdown_fence_stripped')
  }

  const trimmedRaw = raw.trim()
  let allFrags = extractAllBalancedJson(afterFence)
  if (allFrags.length === 0) {
    allFrags = extractAllBalancedJson(trimmedRaw)
  }

  const fullParse = parseOrRepairJson(afterFence)
  repairTrace.push(`balanced_fragments:${allFrags.length}`)
  repairTrace.push(
    fullParse.ok ? 'full_text_stabilize_ok' : `full_text_stabilize_fail:${fullParse.failedStage}`,
  )

  if (fullParse.ok && isProseStitchedArray(fullParse.data)) {
    for (const f of allFrags) {
      const p = parseOrRepairJson(f)
      if (p.ok && (isPlainObject(p.data) || Array.isArray(p.data))) {
        hints.push('embedded_json_extracted')
        warnings.push('repaired_array_replaced_by_embedded_object')
        return { ...p, llmHints: hints, warnings }
      }
    }
  }

  const parsedFrags = parseFragments(allFrags)
  repairTrace.push(`fragment_parse_successes:${parsedFrags.length}`)
  const objectParses = parsedFrags.filter((x) => isPlainObject(x.r.data))

  if (objectParses.length >= 2) {
    const jsonSize = (data: unknown) => {
      try {
        return JSON.stringify(data).length
      } catch {
        return 0
      }
    }
    const fullObjOk = fullParse.ok && isPlainObject(fullParse.data)
    const fullLen = fullObjOk ? jsonSize(fullParse.data) : 0
    let bestFragLen = 0
    for (const x of objectParses) {
      bestFragLen = Math.max(bestFragLen, jsonSize(x.r.data))
    }
    if (fullObjOk && fullLen > bestFragLen) {
      warnings.push('full_text_repair_over_competing_fragments')
      return { ...fullParse, llmHints: hints, warnings }
    }

    const pref = options?.preferJsonBlock ?? 'largest'
    if (pref === 'first') {
      hints.push('embedded_json_extracted')
      warnings.push('multiple_json_blocks_chose_first_fragment')
      return { ...objectParses[0]!.r, llmHints: hints, warnings }
    }
    if (pref === 'last') {
      hints.push('embedded_json_extracted')
      warnings.push('multiple_json_blocks_chose_last_fragment')
      return { ...objectParses[objectParses.length - 1]!.r, llmHints: hints, warnings }
    }

    const ranked = objectParses.map((x, i) => ({ x, i }))
    ranked.sort((a, b) => {
      const ld = b.x.frag.length - a.x.frag.length
      if (ld !== 0) return ld
      return b.i - a.i
    })
    hints.push('embedded_json_extracted')
    warnings.push('multiple_json_blocks_chose_largest_fragment')
    return { ...ranked[0]!.x.r, llmHints: hints, warnings }
  }

  if (fullParse.ok) {
    return { ...fullParse, llmHints: hints, warnings }
  }

  if (objectParses.length === 1) {
    hints.push('embedded_json_extracted')
    return { ...objectParses[0]!.r, llmHints: hints, warnings }
  }

  for (const x of parsedFrags) {
    hints.push('embedded_json_extracted')
    return { ...x.r, llmHints: hints, warnings }
  }

  const fallback =
    extractBalancedJson(afterFence) ??
    (trimmedRaw !== afterFence ? extractBalancedJson(trimmedRaw) : null)
  if (fallback && !allFrags.includes(fallback)) {
    repairTrace.push('fallback_balanced_extract_attempted')
    const p = parseOrRepairJson(fallback)
    if (p.ok) {
      hints.push('embedded_json_extracted')
      warnings.push('ambiguous_json_extraction')
      return { ...p, llmHints: hints, warnings }
    }
    repairTrace.push(`fallback_stabilize_fail:${p.failedStage}`)
  }

  repairTrace.push('all_repair_paths_exhausted')
  return {
    ok: false,
    error: fullParse.error,
    hint: fullParse.hint,
    failedStage: fullParse.failedStage,
    llmHints: hints,
    warnings,
    repairTrace,
  }
}
