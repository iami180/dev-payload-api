import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { meteringPath } from './paths.js'

export type MeteringSnapshot = {
  stabilize: { success: number; total: number }
  validateSchema: { success: number; total: number }
  registry: { schemasCreated: number; versionsCreated: number }
  updatedAt: string
}

const empty = (): MeteringSnapshot => ({
  stabilize: { success: 0, total: 0 },
  validateSchema: { success: 0, total: 0 },
  registry: { schemasCreated: 0, versionsCreated: 0 },
  updatedAt: new Date().toISOString(),
})

async function load(): Promise<MeteringSnapshot> {
  const p = meteringPath()
  try {
    const raw = await readFile(p, 'utf8')
    const j = JSON.parse(raw) as Partial<MeteringSnapshot>
    return {
      stabilize: {
        success: Number(j.stabilize?.success) || 0,
        total: Number(j.stabilize?.total) || 0,
      },
      validateSchema: {
        success: Number(j.validateSchema?.success) || 0,
        total: Number(j.validateSchema?.total) || 0,
      },
      registry: {
        schemasCreated: Number(j.registry?.schemasCreated) || 0,
        versionsCreated: Number(j.registry?.versionsCreated) || 0,
      },
      updatedAt: new Date().toISOString(),
    }
  } catch {
    return empty()
  }
}

async function save(m: MeteringSnapshot): Promise<void> {
  const p = meteringPath()
  await mkdir(dirname(p), { recursive: true })
  m.updatedAt = new Date().toISOString()
  await writeFile(p, JSON.stringify(m, null, 2), 'utf8')
}

export async function getMetering(): Promise<MeteringSnapshot> {
  return load()
}

export type MeteringOp =
  | { kind: 'stabilize'; success: boolean }
  | { kind: 'validateSchema'; success: boolean }
  | { kind: 'registrySchemaCreated' }
  | { kind: 'registryVersionCreated' }

export async function recordMetering(op: MeteringOp): Promise<void> {
  const m = await load()
  switch (op.kind) {
    case 'stabilize':
      m.stabilize.total += 1
      if (op.success) m.stabilize.success += 1
      break
    case 'validateSchema':
      m.validateSchema.total += 1
      if (op.success) m.validateSchema.success += 1
      break
    case 'registrySchemaCreated':
      m.registry.schemasCreated += 1
      break
    case 'registryVersionCreated':
      m.registry.versionsCreated += 1
      break
  }
  await save(m)
}
