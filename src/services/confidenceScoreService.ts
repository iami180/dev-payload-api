export type ConfidenceInput = {
  llmHints: string[]
  repairedWithJsonrepair: boolean
  coercionCount: number
  fieldErrorCount: number
}

/**
 * Heuristic 0..1 — higher = fewer transformations / issues.
 */
export function computeConfidence(input: ConfidenceInput): number {
  let c = 1

  c -= Math.min(0.18, input.llmHints.length * 0.06)
  if (input.repairedWithJsonrepair) c -= 0.05
  c -= Math.min(0.2, input.coercionCount * 0.07)
  c -= Math.min(0.45, input.fieldErrorCount * 0.12)

  return Math.round(Math.max(0, Math.min(1, c)) * 100) / 100
}

export function humanizeLlmHint(hint: string): string {
  const map: Record<string, string> = {
    markdown_fence_removed: 'Removed markdown code fence',
    embedded_json_extracted: 'Extracted JSON from surrounding text',
  }
  return map[hint] ?? hint
}
