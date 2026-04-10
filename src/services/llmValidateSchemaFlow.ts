import { computeConfidence, humanizeLlmHint } from './confidenceScoreService.js'
import { stabilizeFromLlm } from './llmOutputPipeline.js'
import {
  coerceNestedValue,
  compileNestedSchema,
  isNestedSchemaRoot,
  validateNestedRoot,
} from './nestedSchemaService.js'
import type { CoercionTrace } from './typeCoercionService.js'
import { coerceObjectBySchema } from './typeCoercionService.js'
import { validateSimpleSchema, type FieldError } from './schemaValidationService.js'
import {
  applyUnknownFieldsFlat,
  applyUnknownFieldsNested,
  type UnknownFieldPolicy,
} from './unknownFieldPolicyService.js'
import { buildDriftReport } from './driftReportService.js'
import {
  buildRichFailureExplanations,
  enrichRootError,
} from './richFailureExplanations.js'

function contractGatewayMeta(
  contract: boolean,
  input: {
    contractSatisfied: boolean | null
    failureClass?: 'parse' | 'root_shape' | 'invalid_contract_definition' | 'schema_violation'
    teamSummary?: string | null
  },
) {
  return {
    contractGateway: {
      /** Opinionated mode: central gate — not “just repair”, but enforced shape + unknown-key policy bundle when enabled. */
      opinionated: contract,
      /** When `contractEnforcement` was true: this request used strict + reject-unknown as a hard contract attempt. */
      hardFailGuaranteeActive: contract,
      contractSatisfied: input.contractSatisfied,
      failureClass: input.failureClass ?? null,
      teamSummary:
        input.teamSummary ??
        (contract
          ? 'Use contractEnforcement + schemaRef/registry so the whole team shares one truth for this use case.'
          : null),
    },
    /** For billing proxies: count when `success` and this validate-schema call fully satisfied the schema. */
    meteringHint: {
      billableValidateSuccess: input.contractSatisfied === true,
      event: 'validate_schema',
    },
  }
}

export type ValidateSchemaRequest = {
  raw: string
  schema: Record<string, unknown>
  required?: string[]
  coerceTypes: boolean
  mode: 'strict' | 'lenient'
  /** Default `allow` (backward compatible). */
  unknownFieldPolicy?: UnknownFieldPolicy
  /** Forces strict mode, unknownFieldPolicy reject, stricter production contract. */
  contractEnforcement?: boolean
  /** When false, omit `richFailures` / root `failureExplanation` (default true). */
  richFailureExplanations?: boolean
  /** Echoed in response when validating via schema registry. */
  registryContext?: { schemaId: string; version: number }
}

export type ValidateSchemaHttpResult = {
  status: 200 | 400 | 422
  body: Record<string, unknown>
}

export type ValidateTransparency = {
  pipeline: { stages: string[] }
  coercions: CoercionTrace[]
  removedFields: string[]
  /** Populated when `unknownFieldPolicy` is `report` */
  unknownFields: string[]
  syntaxRepairs: Array<{ kind: string; tool?: string }>
  warnings: string[]
}

function flatStringSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(schema)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

function buildStages(input: {
  llmHints: string[]
  method: 'direct' | 'repaired'
  unknownPolicy: UnknownFieldPolicy
  coerceTypes: boolean
  contractEnforcement: boolean
}): string[] {
  const s: string[] = ['ingest_raw']
  if (input.llmHints.includes('markdown_fence_removed')) s.push('strip_markdown_fence')
  s.push(input.method === 'direct' ? 'json_parse_ok' : 'json_parse_then_repair')
  if (input.method === 'repaired') s.push('jsonrepair_syntax')
  if (input.llmHints.includes('embedded_json_extracted')) s.push('extract_balanced_json_fragment')
  s.push('ensure_root_object')
  if (input.contractEnforcement) s.push('contract_enforcement_bundle')
  s.push(`unknown_fields_${input.unknownPolicy}`)
  if (input.coerceTypes) s.push('coerce_types')
  s.push('schema_type_validate')
  return s
}

export function runLlmValidateSchema(req: ValidateSchemaRequest): ValidateSchemaHttpResult {
  const contract = req.contractEnforcement === true
  const effectiveMode: 'strict' | 'lenient' = contract ? 'strict' : req.mode
  const policy: UnknownFieldPolicy = contract ? 'reject' : (req.unknownFieldPolicy ?? 'allow')
  const wantRich = req.richFailureExplanations !== false

  const issues: string[] = []
  const parsed = stabilizeFromLlm(req.raw)

  if (!parsed.ok) {
    for (const h of parsed.llmHints) issues.push(humanizeLlmHint(h))
    const msg = 'Could not extract valid JSON from the model output.'
    const rootRich = wantRich ? enrichRootError('PARSE_FAILED', msg) : undefined
    return {
      status: 422,
      body: {
        success: false,
        error: {
          code: 'PARSE_FAILED',
          message: msg,
          details: {
            parseCode: parsed.error,
            hint: parsed.hint,
            llmHints: parsed.llmHints,
            repairTrace: parsed.repairTrace,
            failedStage: parsed.failedStage,
          },
        },
        ...(rootRich ? { failureExplanation: rootRich } : {}),
        issues,
        llmHints: parsed.llmHints,
        warnings: parsed.warnings,
        confidence: 0,
        transparency: {
          pipeline: { stages: ['ingest_raw', 'parse_failed'] },
          coercions: [],
          removedFields: [],
          unknownFields: [],
          syntaxRepairs: [],
          warnings: parsed.warnings,
        } satisfies ValidateTransparency,
        ...(req.registryContext ? { registryContext: req.registryContext } : {}),
        ...contractGatewayMeta(contract, {
          contractSatisfied: false,
          failureClass: 'parse',
          teamSummary:
            'No JSON object to validate — fix prompts/output or use /v1/llm/stabilize for parse-only.',
        }),
      },
    }
  }

  for (const h of parsed.llmHints) issues.push(humanizeLlmHint(h))
  if (parsed.method === 'repaired') {
    issues.push('Repaired JSON syntax (jsonrepair)')
  }
  for (const w of parsed.warnings) {
    issues.push(`Warning: ${w}`)
  }

  const { data, method, repairedFrom, llmHints, warnings } = parsed

  const syntaxRepairs: ValidateTransparency['syntaxRepairs'] =
    method === 'repaired'
      ? [{ kind: 'json_syntax', tool: repairedFrom ?? 'jsonrepair' }]
      : []

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    const msg =
      'Parsed JSON must be a plain object for schema validation (not an array or primitive).'
    issues.push(msg)
    const confidence = computeConfidence({
      llmHints,
      repairedWithJsonrepair: method === 'repaired',
      coercionCount: 0,
      fieldErrorCount: 1,
    })
    const transparency: ValidateTransparency = {
      pipeline: {
        stages: buildStages({
          llmHints,
          method,
          unknownPolicy: policy,
          coerceTypes: false,
          contractEnforcement: contract,
        }),
      },
      coercions: [],
      removedFields: [],
      unknownFields: [],
      syntaxRepairs,
      warnings,
    }
    const rootRich = wantRich ? enrichRootError('ROOT_NOT_OBJECT', msg) : undefined
    const body = {
      success: false,
      error: {
        code: 'ROOT_NOT_OBJECT',
        message: msg,
      },
      ...(rootRich ? { failureExplanation: rootRich } : {}),
      issues,
      confidence,
      data,
      transparency,
      warnings,
      ...(req.registryContext ? { registryContext: req.registryContext } : {}),
      ...contractGatewayMeta(contract, {
        contractSatisfied: false,
        failureClass: 'root_shape',
        teamSummary:
          'Contract validation expects a single JSON object `{...}` at the root after parse/repair.',
      }),
      driftReport: {
        driftFields: ['(root)'],
        details: [
          {
            field: '(root)',
            code: 'root_not_object',
            receivedPreview: (() => {
              try {
                return JSON.stringify(data).slice(0, 280)
              } catch {
                return String(data).slice(0, 280)
              }
            })(),
            note: 'Root value is array/primitive/null — services cannot share one object-shaped contract.',
          },
        ],
      },
    }
    if (effectiveMode === 'strict') return { status: 422, body }
    return { status: 200, body }
  }

  let dataObj = { ...(data as Record<string, unknown>) }

  let unknownFieldsReported: string[] = []
  let removedFields: string[] = []
  let unknownFieldErrors: FieldError[] = []
  let coercions: CoercionTrace[] = []
  let coercionMessages: string[] = []
  let validation: { ok: boolean; fieldErrors: FieldError[] }

  if (isNestedSchemaRoot(req.schema)) {
    const compiled = compileNestedSchema(req.schema)
    if (!compiled.ok) {
      const schemaIssues = compiled.errors.map((e) => e.message)
      const invMsg = 'The nested schema definition is invalid.'
      const rootRich = wantRich ? enrichRootError('INVALID_NESTED_SCHEMA', invMsg) : undefined
      return {
        status: 400,
        body: {
          success: false,
          error: {
            code: 'INVALID_NESTED_SCHEMA',
            message: invMsg,
            details: { fieldErrors: compiled.errors },
          },
          ...(rootRich ? { failureExplanation: rootRich } : {}),
          ...(wantRich && compiled.errors.length
            ? { richFailures: buildRichFailureExplanations(compiled.errors) }
            : {}),
          issues: schemaIssues,
          fieldErrors: compiled.errors,
          confidence: 0,
          warnings,
          transparency: {
            pipeline: { stages: ['ingest_raw', 'invalid_nested_schema'] },
            coercions: [],
            removedFields: [],
            unknownFields: [],
            syntaxRepairs,
            warnings,
          } satisfies ValidateTransparency,
          ...(req.registryContext ? { registryContext: req.registryContext } : {}),
          ...contractGatewayMeta(contract, {
            contractSatisfied: false,
            failureClass: 'invalid_contract_definition',
            teamSummary: 'Fix the nested schema document — the contract definition itself failed compile checks.',
          }),
          driftReport: buildDriftReport({}, compiled.errors, []),
        },
      }
    }

    const { rootNode } = compiled
    const unk = applyUnknownFieldsNested(dataObj, rootNode, '', policy)
    dataObj = unk.value as Record<string, unknown>
    unknownFieldErrors = unk.fieldErrors
    unknownFieldsReported = unk.unknownFields
    removedFields = unk.removedFields
    for (const fe of unknownFieldErrors) issues.push(fe.message)
    for (const p of removedFields) issues.push(`Removed unknown field "${p}"`)

    if (req.coerceTypes) {
      const { value, messages, coercions: c } = coerceNestedValue(dataObj, rootNode, '', true)
      dataObj = value as Record<string, unknown>
      coercionMessages = messages
      coercions = c
      issues.push(...messages)
    }

    validation = validateNestedRoot(dataObj, rootNode, req.required)
  } else {
    const flatSchema = flatStringSchema(req.schema)
    const allowed = new Set(Object.keys(flatSchema))
    const unk = applyUnknownFieldsFlat(dataObj, allowed, policy)
    dataObj = unk.data
    unknownFieldErrors = unk.fieldErrors
    unknownFieldsReported = unk.unknownFields
    removedFields = unk.removedFields
    for (const fe of unknownFieldErrors) issues.push(fe.message)
    for (const p of removedFields) issues.push(`Removed unknown field "${p}"`)

    if (req.coerceTypes && Object.keys(flatSchema).length > 0) {
      const { data: coerced, messages, coercions: c } = coerceObjectBySchema(dataObj, flatSchema)
      dataObj = coerced
      coercionMessages = messages
      coercions = c
      issues.push(...messages)
    }

    validation = validateSimpleSchema({
      data: dataObj,
      schema: flatSchema,
      required: req.required,
    })
  }

  const mergedFieldErrors: FieldError[] = [...unknownFieldErrors, ...validation.fieldErrors]
  for (const fe of validation.fieldErrors) {
    if (!issues.includes(fe.message)) issues.push(fe.message)
  }

  const validationOk = mergedFieldErrors.length === 0

  const confidence = computeConfidence({
    llmHints,
    repairedWithJsonrepair: method === 'repaired',
    coercionCount: coercionMessages.length,
    fieldErrorCount: mergedFieldErrors.length,
  })

  const transparency: ValidateTransparency = {
    pipeline: {
      stages: buildStages({
        llmHints,
        method,
        unknownPolicy: policy,
        coerceTypes: req.coerceTypes,
        contractEnforcement: contract,
      }),
    },
    coercions,
    removedFields,
    unknownFields: unknownFieldsReported,
    syntaxRepairs,
    warnings,
  }

  const base = {
    data: dataObj,
    issues,
    fieldErrors: mergedFieldErrors,
    confidence,
    llmHints,
    method,
    repairedFrom,
    transparency,
    warnings,
    ...(req.registryContext ? { registryContext: req.registryContext } : {}),
  }

  if (validationOk) {
    return {
      status: 200,
      body: {
        success: true,
        ...base,
        ...contractGatewayMeta(contract, {
          contractSatisfied: true,
          teamSummary:
            'Payload satisfies the active schema and policies — safe to treat as the shared contract output for this use case.',
        }),
      },
    }
  }

  const driftReport = buildDriftReport(dataObj, mergedFieldErrors, coercions)

  const failBody = {
    success: false,
    error: {
      code: 'SCHEMA_VALIDATION_FAILED',
      message: 'One or more fields failed schema validation.',
    },
    ...(wantRich && mergedFieldErrors.length > 0
      ? { richFailures: buildRichFailureExplanations(mergedFieldErrors) }
      : {}),
    driftReport,
    ...base,
    ...contractGatewayMeta(contract, {
      contractSatisfied: false,
      failureClass: 'schema_violation',
      teamSummary:
        'See driftReport.details for which paths drifted; transparency.coercions shows before/after where coercion ran.',
    }),
  }

  if (effectiveMode === 'strict') {
    return {
      status: 422,
      body: failBody,
    }
  }

  return {
    status: 200,
    body: failBody,
  }
}
