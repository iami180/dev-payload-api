/**
 * Structural shape paths for diffing schema versions (types as coarse strings).
 */
export function collectShapePaths(
  schema: Record<string, unknown>,
  isNested: boolean,
): Map<string, string> {
  const m = new Map<string, string>()
  if (isNested) {
    walkNested(schema, '', m)
  } else {
    for (const [k, v] of Object.entries(schema)) {
      if (typeof v === 'string') m.set(k, v.toLowerCase())
    }
  }
  return m
}

function walkNested(node: unknown, prefix: string, out: Map<string, string>): void {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return
  const o = node as Record<string, unknown>
  const t = typeof o.type === 'string' ? o.type.toLowerCase() : ''
  if (t === 'object' && o.properties && typeof o.properties === 'object' && !Array.isArray(o.properties)) {
    const props = o.properties as Record<string, unknown>
    for (const [key, child] of Object.entries(props)) {
      const p = prefix ? `${prefix}.${key}` : key
      const childType = shorthandType(child)
      if (childType) {
        out.set(p, childType)
      } else {
        walkNested(child, p, out)
      }
    }
    return
  }
  if (t === 'array' && o.items !== undefined) {
    const it = shorthandType(o.items)
    const p = prefix || '(array_items)'
    if (it) out.set(`${p}[]`, it)
    else walkNested(o.items, `${prefix}.items`, out)
    return
  }
  if (t) {
    out.set(prefix || '(root)', t)
  }
}

function shorthandType(raw: unknown): string | null {
  if (typeof raw === 'string') return raw.toLowerCase()
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const t = (raw as Record<string, unknown>).type
    if (typeof t === 'string') return t.toLowerCase()
  }
  return null
}

export type ShapeDiff = {
  addedPaths: string[]
  removedPaths: string[]
  typeChanges: Array<{ path: string; from: string; to: string }>
}

export function diffShapeMaps(a: Map<string, string>, b: Map<string, string>): ShapeDiff {
  const addedPaths: string[] = []
  const removedPaths: string[] = []
  const typeChanges: ShapeDiff['typeChanges'] = []

  for (const k of b.keys()) {
    if (!a.has(k)) addedPaths.push(k)
  }
  for (const k of a.keys()) {
    if (!b.has(k)) removedPaths.push(k)
  }
  for (const k of a.keys()) {
    if (!b.has(k)) continue
    const av = a.get(k)!
    const bv = b.get(k)!
    if (av !== bv) typeChanges.push({ path: k, from: av, to: bv })
  }

  addedPaths.sort()
  removedPaths.sort()
  return { addedPaths, removedPaths, typeChanges }
}
