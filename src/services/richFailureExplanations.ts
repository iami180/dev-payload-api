import type { FieldError } from './schemaValidationService.js'

export type RichFailureItem = {
  field: string
  code: string
  message: string
  explanation: string
  remediationHint: string
  severity: 'error' | 'warning'
}

function explain(fe: FieldError): Omit<RichFailureItem, 'field' | 'code' | 'message'> {
  switch (fe.code) {
    case 'required_missing':
      return {
        explanation:
          'The model output did not include this key, or it was stripped earlier. Contract consumers expect this field.',
        remediationHint:
          'Adjust the prompt / tool schema, or relax `required` / registry version until the model reliably emits this key.',
        severity: 'error',
      }
    case 'type_mismatch':
      return {
        explanation:
          'The value’s JSON type does not match the schema (e.g. string instead of number). Coercion may be disabled or failed.',
        remediationHint:
          'Enable `coerceTypes: true` for common string→number cases, or fix the model output format.',
        severity: 'error',
      }
    case 'unknown_field':
      return {
        explanation:
          'This key is not declared in the schema (or `additionalProperties` is false for the parent object).',
        remediationHint:
          'Remove the key, add it to the schema, use `unknownFieldPolicy: "strip"`, or widen the contract.',
        severity: 'error',
      }
    case 'undefined_value':
      return {
        explanation: 'The key exists but its value is JSON `undefined` (invalid in standard JSON — often lost in transit).',
        remediationHint: 'Ensure the model emits `null` or omits the key instead of undefined.',
        severity: 'warning',
      }
    case 'invalid_schema_type':
    case 'invalid_schema':
    case 'schema_too_deep':
    case 'schema_too_large':
      return {
        explanation: 'The schema definition itself is invalid or too large for server limits.',
        remediationHint: 'Fix the nested schema object or reduce depth/size; see OpenAPI limits.',
        severity: 'error',
      }
    case 'ROOT_NOT_OBJECT':
      return {
        explanation: 'validate-schema requires a plain JSON object at the root after parsing.',
        remediationHint: 'Use /v1/llm/stabilize if you only need parse/repair, or constrain the model to return `{...}`.',
        severity: 'error',
      }
    default:
      return {
        explanation: 'Validation rule failed for this field.',
        remediationHint: 'Compare `data` with your schema and `fieldErrors` paths.',
        severity: 'error',
      }
  }
}

export function buildRichFailureExplanations(fieldErrors: FieldError[]): RichFailureItem[] {
  return fieldErrors.map((fe) => ({
    field: fe.field,
    code: fe.code,
    message: fe.message,
    ...explain(fe),
  }))
}

export function enrichRootError(
  code: string,
  message: string,
): { explanation: string; remediationHint: string } {
  if (code === 'PARSE_FAILED') {
    return {
      explanation: 'No valid JSON could be parsed or repaired from the raw model text.',
      remediationHint:
        'Check for truncated output, non-JSON prose only, or use a fenced JSON prompt; inspect `details.hint` and `llmHints`.',
    }
  }
  if (code === 'ROOT_NOT_OBJECT') {
    return {
      explanation: message,
      remediationHint: 'Ask the model for a single JSON object, or use stabilize-only flow.',
    }
  }
  if (code === 'INVALID_NESTED_SCHEMA') {
    return {
      explanation: 'The nested schema document failed compile-time checks.',
      remediationHint: 'Fix `type` / `properties` / `items` / `additionalProperties` shapes per API docs.',
    }
  }
  return {
    explanation: message,
    remediationHint: 'See `error.code` and `issues` for more context.',
  }
}
