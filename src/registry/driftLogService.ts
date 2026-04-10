import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { ensureDataDirs } from './paths.js'

export type DriftLogEntry = {
  ts: string
  schemaId: string
  schemaVersion: number
  success: boolean
  httpStatus: number
  errorCodes: string[]
  fieldErrorCount: number
  coercionCount: number
  removedUnknownCount: number
  reportedUnknownCount: number
  contractEnforcement: boolean
}

export async function appendDriftLog(entry: Omit<DriftLogEntry, 'ts'>): Promise<void> {
  const { drift } = await ensureDataDirs()
  const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n'
  const file = join(drift, `${sanitize(entry.schemaId)}.ndjson`)
  await mkdir(drift, { recursive: true })
  await appendFile(file, line, 'utf8')
}

function sanitize(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}
