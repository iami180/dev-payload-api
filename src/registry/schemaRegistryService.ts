import { randomUUID } from 'node:crypto'
import { readFile, writeFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { isNestedSchemaRoot } from '../services/nestedSchemaService.js'
import { recordMetering } from './meteringService.js'
import { ensureDataDirs } from './paths.js'
import { collectShapePaths, diffShapeMaps, type ShapeDiff } from './schemaShape.js'

export type SchemaVersionRecord = {
  version: number
  createdAt: string
  schema: Record<string, unknown>
  changelog?: string
  shapeDiffFromPrevious?: ShapeDiff
}

export type RegistryFile = {
  id: string
  name: string
  versions: SchemaVersionRecord[]
}

async function filePath(id: string): Promise<string> {
  const { registry } = await ensureDataDirs()
  return join(registry, `${id}.json`)
}

async function readDoc(id: string): Promise<RegistryFile | null> {
  try {
    const raw = await readFile(await filePath(id), 'utf8')
    return JSON.parse(raw) as RegistryFile
  } catch {
    return null
  }
}

async function writeDoc(doc: RegistryFile): Promise<void> {
  const p = await filePath(doc.id)
  await writeFile(p, JSON.stringify(doc, null, 2), 'utf8')
}

function shapeMapsFor(schema: Record<string, unknown>) {
  const nested = isNestedSchemaRoot(schema)
  return {
    nested,
    map: collectShapePaths(schema, nested),
  }
}

export async function createRegistrySchema(
  name: string | undefined,
  schema: Record<string, unknown>,
): Promise<{ id: string; version: number }> {
  await ensureDataDirs()
  const id = randomUUID()
  const doc: RegistryFile = {
    id,
    name: name?.trim() || id,
    versions: [
      {
        version: 1,
        createdAt: new Date().toISOString(),
        schema,
      },
    ],
  }
  await writeDoc(doc)
  await recordMetering({ kind: 'registrySchemaCreated' })
  return { id, version: 1 }
}

export async function addRegistryVersion(
  id: string,
  schema: Record<string, unknown>,
  changelog?: string,
): Promise<{ version: number; shapeDiffFromPrevious: ShapeDiff } | null> {
  const doc = await readDoc(id)
  if (!doc || doc.versions.length === 0) return null

  const prev = doc.versions[doc.versions.length - 1]
  const prevShape = shapeMapsFor(prev.schema as Record<string, unknown>)
  const nextShape = shapeMapsFor(schema)
  const shapeDiffFromPrevious = diffShapeMaps(prevShape.map, nextShape.map)

  const nextVersion = prev.version + 1
  doc.versions.push({
    version: nextVersion,
    createdAt: new Date().toISOString(),
    schema,
    changelog: changelog?.trim() || undefined,
    shapeDiffFromPrevious,
  })
  await writeDoc(doc)
  await recordMetering({ kind: 'registryVersionCreated' })
  return { version: nextVersion, shapeDiffFromPrevious }
}

export async function getRegistrySchema(
  id: string,
  version?: number,
): Promise<{ schema: Record<string, unknown>; version: number; name: string } | null> {
  const doc = await readDoc(id)
  if (!doc || doc.versions.length === 0) return null

  let rec: SchemaVersionRecord | undefined
  if (version === undefined) {
    rec = doc.versions[doc.versions.length - 1]
  } else {
    rec = doc.versions.find((v) => v.version === version)
  }
  if (!rec) return null

  return {
    schema: rec.schema as Record<string, unknown>,
    version: rec.version,
    name: doc.name,
  }
}

export async function getRegistryDocument(id: string): Promise<RegistryFile | null> {
  return readDoc(id)
}

export async function listRegistrySchemas(): Promise<
  Array<{ id: string; name: string; latestVersion: number; versionCount: number }>
> {
  const { registry } = await ensureDataDirs()
  let names: string[] = []
  try {
    names = await readdir(registry)
  } catch {
    return []
  }
  const out: Array<{ id: string; name: string; latestVersion: number; versionCount: number }> = []
  for (const f of names) {
    if (!f.endsWith('.json')) continue
    const id = f.replace(/\.json$/, '')
    const doc = await readDoc(id)
    if (!doc?.versions.length) continue
    const latest = doc.versions[doc.versions.length - 1]
    out.push({
      id: doc.id,
      name: doc.name,
      latestVersion: latest.version,
      versionCount: doc.versions.length,
    })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}
