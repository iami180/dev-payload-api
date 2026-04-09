# PayloadFix

Repair and extract JSON from messy LLM text (markdown fences, prose, trailing commas). **Validate** with a flat schema, optional coercion, strict/lenient modes, `fieldErrors`, and a confidence score.

**Endpoints:** `GET /v1/health` · `POST /v1/llm/stabilize` · `POST /v1/llm/validate-schema` · `POST /v1/text/stats` · `POST /v1/hash/sha256`

**Note:** `stabilize` fixes JSON but does not always return a single business `{object}` (prose can become an array). For production guarantees use **`validate-schema`** (root must be an object; strict → 422 on bad shape).

**Errors:** `{ "success": false, "error": { "code", "message", "details?" } }` — e.g. `INVALID_JSON`, `ROOT_NOT_OBJECT`, `SCHEMA_VALIDATION_FAILED`.

Stateless HTTPS API; treat payloads as sensitive if they contain PII.
