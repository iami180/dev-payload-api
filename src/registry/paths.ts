import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export function getDataRoot(): string {
  return process.env.PAYLOADFIX_DATA_DIR?.trim() || join(process.cwd(), 'data')
}

export async function ensureDataDirs(): Promise<{
  root: string
  registry: string
  drift: string
}> {
  const root = getDataRoot()
  const registry = join(root, 'registry')
  const drift = join(root, 'drift')
  await mkdir(registry, { recursive: true })
  await mkdir(drift, { recursive: true })
  return { root, registry, drift }
}

export function meteringPath(): string {
  return join(getDataRoot(), 'metering.json')
}
