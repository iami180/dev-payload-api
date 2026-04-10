# PayloadFix

**API version:** `0.5.0` (matches `GET /` and `openapi.yaml`). **Spec:** import [`openapi.yaml`](https://github.com/iami180/dev-payload-api/blob/main/openapi.yaml) or [`openapi.json`](https://github.com/iami180/dev-payload-api/blob/main/openapi.json) into RapidAPI; set `servers.url` to your HTTPS base (no trailing slash).

**RapidAPI tip:** If character limits are tight, use the short blurb below + link to this file for registry, nested schema, and error details.

---

## What it does

- **`POST /v1/llm/stabilize`** — Extract/repair JSON from messy LLM text (markdown fences, prose, common syntax glitches). Optional **`preferJsonBlock`** (`first` | `last` | `largest`) when several `{...}` blocks appear. Returns **`warnings`** when extraction is ambiguous. **Does not** guarantee a single business `{object}` (root can be array/primitive).
- **`POST /v1/llm/validate-schema`** — Same preprocessing, then the root **must** be a plain **`{...}`** object. Validate with an inline **`schema`** *or* registry **`schemaRef`**. Supports **flat or nested** schemas, **`coerceTypes`**, **`mode`** (`strict` | `lenient`), **`unknownFieldPolicy`** (`allow` | `reject` | `strip` | `report`), **`contractEnforcement`** (strict + reject unknown keys), **`required`** field list, **`driftLog`** with **`schemaRef`**, **`richFailureExplanations`**. Responses include **`fieldErrors`**, **`confidence`**, **`transparency`**, **`contractGateway`**, **`meteringHint`** (e.g. **`billableValidateSuccess`**), and on failure **`driftReport`** / **`richFailures`** where applicable.

**Registry (versioned contracts):**

- `POST /v1/registry/schemas` — create schema (v1); response includes **`shapeDiffFromPrevious: null`**
- `GET /v1/registry/schemas` — list ids / names / versions
- `GET /v1/registry/schemas/:id` — full document (all versions)
- `POST /v1/registry/schemas/:id/versions` — new version + **`shapeDiffFromPrevious`**
- `GET /v1/registry/metering` — aggregate counters (stabilize / validateSchema / registry events)

**Other:** `GET /` (public meta) · `GET /v1/health` · `POST /v1/text/stats` · `POST /v1/hash/sha256`

**Auth:** If the server has **`API_KEYS`** set, send **`X-API-Key`** on **`/v1/*`**. `GET /` stays public. RapidAPI → origin: configure a fixed `X-API-Key` toward your backend if you use keys.

**No outbound LLM calls** — all processing runs on your server.

---

## Production note

Use **`validate-schema`** when you need a **guaranteed object root** and schema rules. **`stabilize`** alone is best-effort parse/repair; strict **`validate-schema`** returns **422** for bad shape (e.g. **`ROOT_NOT_OBJECT`**, **`SCHEMA_VALIDATION_FAILED`**) or **`PARSE_FAILED`** when JSON cannot be extracted.

---

## Errors

Envelope: `{ "success": false, "error": { "code", "message", "details?" } }`

**Common codes**

| Area | Codes |
|------|--------|
| Request body | `INVALID_BODY`, `REQUEST_VALIDATION_FAILED` |
| Auth | `UNAUTHORIZED` |
| Stabilize (422) | **`INVALID_JSON`** — `error.details` may include **`failedStage`**, **`repairTrace`**, **`parseCode`**, **`llmHints`** |
| Validate-schema | `PARSE_FAILED`, `ROOT_NOT_OBJECT`, `SCHEMA_VALIDATION_FAILED`, `INVALID_NESTED_SCHEMA` |
| Registry | `SCHEMA_REF_NOT_FOUND`, `NOT_FOUND` |
| Hash | `INVALID_HEX_INPUT` |

**Metering / billing hint:** use per-response **`meteringHint.billableValidateSuccess`** on validate-schema and **`GET /v1/registry/metering`** for aggregates. Enforce **rate limits** on your side (or via RapidAPI tiers).

Stateless HTTPS API; treat payloads as sensitive if they contain PII.
