/** Markdown fences and embedded JSON extraction from LLM text. */

export function stripMarkdownFences(text: string): { text: string; stripped: boolean } {
  const s = text.trim()
  const block = /```[\w-]*\s*\n?([\s\S]*?)\n?```/i.exec(s)
  if (block) {
    const inner = block[1].trim()
    if (inner !== s) return { text: inner, stripped: true }
  }
  if (s.startsWith('```')) {
    let t = s.replace(/^```[\w-]*\s*\n?/i, '')
    t = t.replace(/\n?```\s*$/i, '').trim()
    if (t !== s) return { text: t, stripped: true }
  }
  return { text: s, stripped: false }
}

/**
 * Balanced `{...}` / `[...]` slice starting exactly at `start` (must be `{` or `[`).
 */
export function extractBalancedJsonFrom(text: string, start: number): string | null {
  if (start < 0 || start >= text.length) return null
  const open = text[start]
  if (open !== '{' && open !== '[') return null

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

export function extractBalancedJson(text: string): string | null {
  const start = text.search(/[\[{]/)
  if (start === -1) return null
  return extractBalancedJsonFrom(text, start)
}

/** Every top-level balanced JSON fragment in document order (for multi-block LLM output). */
export function extractAllBalancedJson(text: string): string[] {
  const out: string[] = []
  let pos = 0
  while (pos < text.length) {
    const slice = text.slice(pos)
    const rel = slice.search(/[\[{]/)
    if (rel === -1) break
    const start = pos + rel
    const frag = extractBalancedJsonFrom(text, start)
    if (!frag) {
      pos = start + 1
      continue
    }
    out.push(frag)
    pos = start + frag.length
  }
  return out
}
