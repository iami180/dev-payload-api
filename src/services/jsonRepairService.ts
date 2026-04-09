import type { StabilizeResult } from '../lib/stabilizeJson.js'
import { stabilizeJsonInput } from '../lib/stabilizeJson.js'

export function parseOrRepairJson(input: string): StabilizeResult {
  return stabilizeJsonInput(input)
}
