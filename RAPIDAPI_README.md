# PayloadFix

**RapidAPI tip:** If character limits are tight, use only the first paragraph below + link to this file on GitHub for nested schema and examples.

**Positioning:** PayloadFix is meant to be more than a tiny “JSON repair helper”. Use **`validate-schema`** as an **opinionated contract gateway**: one shared **source of truth** for shape between agents/services — **`schemaRef` + `/v1/registry/schemas`** (versioned schemas, **shape diff** on new versions, **drift `.ndjson` logs** when outputs diverge). Turn on **`contractEnforcement`** for a **hard-fail bundle** (strict + reject unknown keys) so you can tell your team: *this endpoint either matches the contract or returns a clear error*. Responses include **`contractGateway`** (team-facing summary), **`driftReport`** (which paths drifted, **received preview**, optional **before/after** when coercion ran), **`richFailures`**, and **`meteringHint.billableValidateSuccess`** for **success-based billing** (see **`GET /v1/registry/metering`** for aggregate counters). Pair with **hard rate limits** on your side for production peace of mind.

Repair and extract JSON from messy LLM text (markdown fences, prose, trailing commas). **Validate** with **flat or nested** schemas, optional coercion, **`unknownFieldPolicy`** (`allow` / `reject` / `strip` / `report`), nested **`additionalProperties: false`**, strict/lenient modes, `fieldErrors`, **confidence**, and **`transparency`** (pipeline stages, coercions, removed/unknown field paths, syntax repair metadata). **`/v1/llm/stabilize`** also returns **`warnings`** when extraction is ambiguous.

**Endpoints:** `GET /v1/health` · `POST /v1/llm/stabilize` · `POST /v1/llm/validate-schema` · **`/v1/registry/*`** (saved schemas, versioning, metering) · `POST /v1/text/stats` · `POST /v1/hash/sha256`

**Note:** `stabilize` fixes JSON but does not always return a single business `{object}` (prose can become an array). For production guarantees use **`validate-schema`** (root must be an object; strict → 422 on bad shape).

**Errors:** `{ "success": false, "error": { "code", "message", "details?" } }` — e.g. `INVALID_JSON`, `ROOT_NOT_OBJECT`, `SCHEMA_VALIDATION_FAILED`.

Stateless HTTPS API; treat payloads as sensitive if they contain PII.
