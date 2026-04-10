/**
 * @deprecated Import from ../services/llmOutputPipeline.js or jsonExtractionService.js in new code.
 * Kept for backward compatibility with existing tests and imports.
 */
export { extractBalancedJson, stripMarkdownFences } from '../services/jsonExtractionService.js'
export {
  stabilizeFromLlm,
  type LlmStabilizeResult,
  type LlmStabilizeSuccess,
  type StabilizeFromLlmOptions,
} from '../services/llmOutputPipeline.js'
