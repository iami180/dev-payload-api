# PayloadFix — product overview & full integration reference

**API version:** `0.5.0`  
**Machine-readable contract:** [`openapi.yaml`](./openapi.yaml) / [`openapi.json`](./openapi.json) (import into clients, Postman, RapidAPI).  
This document adds **field-level** detail so you can integrate without guessing.

---

## API Overview

PayloadFix cleans model output into structured JSON and validates it against your schema. Use `POST /v1/llm/stabilize` for parse/repair. Use `POST /v1/llm/validate-schema` for production contracts (strict mode, coercion, `contractEnforcement`, `driftReport`). Registry endpoints store versioned schemas.

Fix broken JSON from LLM outputs in one API call (e.g. ChatGPT, Claude, Gemini style output).

---

## PayloadFix API (narrative)

PayloadFix is built to turn messy, unreliable, or partially broken LLM output into structured, enforceable JSON your applications can safely consume.

If a model returns:

- markdown `` ```json `` wrappers  
- extra prose before/after the object  
- malformed JSON syntax  
- wrong primitive types  
- drifting field structures  
- or generally unreliable structured output  

PayloadFix helps clean, validate, and enforce that output before it reaches downstream systems.

The API spec can be imported from `openapi.yaml` or `openapi.json`. When using RapidAPI, set `servers.url` to your HTTPS base URL (without trailing slash).

### Core purpose

PayloadFix solves two main problems:

#### 1. JSON extraction & repair — `POST /v1/llm/stabilize`

Attempts to extract and repair usable JSON from raw LLM text. Useful when models return markdown fences, explanatory prose around JSON, trailing commas, malformed syntax, minor structural corruption.

When multiple JSON-like `{ ... }` blocks are present, choose strategy with **`preferJsonBlock`**:

- `first` | `last` | `largest`

**Additional request options:**

| Field | Default | Description |
|-------|---------|-------------|
| `sortKeys` | `true` | Recursively sort object keys in `data`. |
| `pretty` | `true` | Pretty-print the `stringified` output. |

If extraction is ambiguous, the response includes **`warnings`**.

**Important:** `stabilize` is best-effort. It does not guarantee the “intended” business object. The parsed root may still be an array or primitive.

#### 2. Contract / schema validation — `POST /v1/llm/validate-schema`

Same preprocessing pipeline as stabilize, then the parsed root **must** be a plain `{ ... }` object.

Validation can use:

- **Inline** `schema`, or  
- **`schemaRef`** pointing at the registry.

**Supported features:** flat and nested schemas, `required` field list, type coercion, strict/lenient modes, unknown-field policy, `contractEnforcement`, drift logging (with `schemaRef`), rich failure explanations.

**Additional request options:**

| Field | Default | Description |
|-------|---------|-------------|
| `driftLog` | `true` | When `true` **and** `schemaRef` is used, append one line to the server drift `.ndjson` log. |
| `richFailureExplanations` | `true` | When `false`, omits `richFailures` / root `failureExplanation` where applicable. |

**Responses may include:** `fieldErrors`, `confidence`, `transparency`, `contractGateway`, `meteringHint`, `driftReport`, `richFailures`.

Use this endpoint when you need output that matches an expected contract.

### Validation modes

- **Strict (`mode: "strict"`, default):** validation failures → **HTTP 422** (typical for production).  
- **Lenient (`mode: "lenient"`):** may return **HTTP 200** with **`success: false`** and diagnostics in the body (no transport-level error).

### Versioned schema registry

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/registry/schemas` | Create schema (version 1) |
| GET | `/v1/registry/schemas` | List schemas |
| GET | `/v1/registry/schemas/:id` | Full document (all versions) |
| POST | `/v1/registry/schemas/:id/versions` | New version + shape diff |
| GET | `/v1/registry/metering` | Aggregate metering counters |

### Additional endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Public metadata |
| GET | `/v1/health` | Liveness + endpoint list |
| POST | `/v1/text/stats` | Char / line / word / rough token estimate |
| POST | `/v1/hash/sha256` | SHA-256 (`utf8` or `hex` input) |

### Authentication

If `API_KEYS` is set on the server, all `/v1/*` routes require header:

```http
X-API-Key: <your-key>
```

`GET /` stays public. On RapidAPI, the gateway often injects the backend key.

### Production guidance

- Use **`validate-schema`** for contract-compliant output.  
- Use **`stabilize`** only for best-effort extraction/repair.  
- In **strict** mode, expect **422** for: root not object (`ROOT_NOT_OBJECT`), schema mismatch (`SCHEMA_VALIDATION_FAILED`), unrecoverable parse (`PARSE_FAILED`), invalid nested schema (`INVALID_NESTED_SCHEMA`).

### Limits

| Limit | Value |
|-------|--------|
| `raw` / `text` / hash input | max **512 KiB** string |
| Flat schema | max **200** top-level keys |
| Nested schema | max **~250** property slots, depth **24** |
| Serialized schema JSON | max **~48 KiB** |

### Error format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable explanation",
    "details": {}
  }
}
```

**Common codes:** `INVALID_BODY`, `REQUEST_VALIDATION_FAILED`, `UNAUTHORIZED`, `INVALID_JSON` (stabilize 422), `PARSE_FAILED`, `ROOT_NOT_OBJECT`, `SCHEMA_VALIDATION_FAILED`, `INVALID_NESTED_SCHEMA`, `SCHEMA_REF_NOT_FOUND`, `NOT_FOUND`, `INVALID_HEX_INPUT`.

For stabilize **422** `INVALID_JSON`, `error.details` may include: `parseCode`, `hint`, `failedStage`, `repairTrace`, `llmHints`.

### Metering

Per validate response: **`meteringHint.billableValidateSuccess`**. Aggregates: **`GET /v1/registry/metering`**.

### Security note

No outbound LLM calls; processing is local. Treat payloads as sensitive if they contain PII or secrets.

---

## Integration reference (requests & responses)

### Base URL & headers

- **Base:** `https://<your-host>` — no trailing slash.  
- **Content-Type:** `application/json` for all POST bodies.  
- **Auth (if enabled):** `X-API-Key: ...` on `/v1/*`.

---

### `GET /`

**Response 200**

```json
{
  "service": "PayloadFix",
  "tagline": "LLM output reliability: extract, repair, schema validation, coercion, and confidence for production pipelines",
  "version": "0.5.0",
  "docs": "/v1/health"
}
```

---

### `GET /v1/health`

**Response 200**

```json
{
  "ok": true,
  "focus": "Structured LLM output — parse, validate, coerce, strict/lenient modes",
  "endpoints": [
    "POST /v1/llm/stabilize",
    "POST /v1/llm/validate-schema",
    "POST /v1/registry/schemas",
    "GET /v1/registry/schemas",
    "GET /v1/registry/schemas/:id",
    "POST /v1/registry/schemas/:id/versions",
    "GET /v1/registry/metering",
    "POST /v1/text/stats",
    "POST /v1/hash/sha256"
  ]
}
```

**401** — if `API_KEYS` set and key missing/invalid: `StandardErrorResponse`.

---

### `POST /v1/llm/stabilize`

**Request body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `raw` | string | yes | — | LLM or chat text |
| `sortKeys` | boolean | no | `true` | Sort keys in `data` |
| `pretty` | boolean | no | `true` | Pretty `stringified` |
| `preferJsonBlock` | `"first"` \| `"last"` \| `"largest"` | no | — | If multiple `{...}` blocks |

**Response 200**

| Field | Type | Description |
|-------|------|-------------|
| `success` | `true` | |
| `ok` | `true` | |
| `method` | `"direct"` \| `"repaired"` | |
| `repairedFrom` | string \| omitted | e.g. `jsonrepair` when repaired |
| `llmHints` | string[] | Pipeline hints |
| `warnings` | string[] | Ambiguity warnings |
| `data` | any | Parsed JSON value |
| `stringified` | string | JSON string of `data` |

**Response 400** — `INVALID_BODY` or `REQUEST_VALIDATION_FAILED`.

**Response 422** — parse/repair failed:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_JSON",
    "message": "...",
    "details": {
      "parseCode": "...",
      "hint": "...",
      "failedStage": "syntax_repair",
      "repairTrace": ["..."],
      "llmHints": []
    }
  },
  "llmHints": [],
  "warnings": []
}
```

---

### `POST /v1/llm/validate-schema`

**Request body**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `raw` | string | yes | — | Max 512 KiB |
| `schema` | object | one of `schema` / `schemaRef` | — | Inline flat or nested schema |
| `schemaRef` | object | one of | — | `{ "schemaId": string (8–128 chars), "version"?: positive int }` |
| `required` | string[] | no | — | Max 100 names |
| `coerceTypes` | boolean | no | `false` | |
| `mode` | `"strict"` \| `"lenient"` | no | `"strict"` | |
| `unknownFieldPolicy` | string | no | `"allow"` | **`allow`** \| **`reject`** \| **`strip`** \| **`report`** |
| `contractEnforcement` | boolean | no | `false` | If `true`: strict + reject unknown keys |
| `driftLog` | boolean | no | `true` | Drift file only with `schemaRef` |
| `richFailureExplanations` | boolean | no | `true` | |

**Response status**

- **200** — `success: true` when validation passes; **lenient** may return **200** with `success: false`.  
- **400** — `INVALID_BODY`, `REQUEST_VALIDATION_FAILED`, or invalid nested schema compile.  
- **404** — `SCHEMA_REF_NOT_FOUND` if `schemaRef` id/version missing.  
- **422** — **strict** mode: `PARSE_FAILED`, `ROOT_NOT_OBJECT`, `SCHEMA_VALIDATION_FAILED`, `INVALID_NESTED_SCHEMA`, etc.

**Success 200 (shape, key fields)**

```json
{
  "success": true,
  "data": {},
  "issues": [],
  "fieldErrors": [],
  "confidence": 0.95,
  "llmHints": [],
  "method": "repaired",
  "repairedFrom": "jsonrepair",
  "warnings": [],
  "transparency": {
    "pipeline": { "stages": [] },
    "coercions": [],
    "removedFields": [],
    "unknownFields": [],
    "syntaxRepairs": [],
    "warnings": []
  },
  "contractGateway": {
    "opinionated": false,
    "hardFailGuaranteeActive": false,
    "contractSatisfied": true,
    "failureClass": null,
    "teamSummary": null
  },
  "meteringHint": {
    "billableValidateSuccess": true,
    "event": "validate_schema"
  },
  "registryContext": { "schemaId": "...", "version": 1 }
}
```

(`registryContext` only when using `schemaRef`.)

**Error body (typical)** includes `success: false`, `error`, optional `fieldErrors`, `driftReport`, `richFailures`, `transparency`, `contractGateway`, `meteringHint` — see OpenAPI schema `ValidateSchemaErrorResponse` for the full list of optional keys.

---

### `POST /v1/registry/schemas`

**Request**

```json
{
  "name": "Optional name",
  "schema": { "field": "string" }
}
```

**Response 200**

```json
{
  "success": true,
  "ok": true,
  "schemaId": "<uuid>",
  "version": 1,
  "shapeDiffFromPrevious": null
}
```

**400** — validation / schema limits.

---

### `GET /v1/registry/schemas`

**Response 200**

```json
{
  "success": true,
  "ok": true,
  "schemas": [
    {
      "id": "<uuid>",
      "name": "",
      "latestVersion": 1,
      "versionCount": 1
    }
  ]
}
```

---

### `GET /v1/registry/schemas/:id`

**Response 200** — `{ "success": true, "ok": true, "id", "name", "versions": [ ... ] }`  
Each version includes `version`, `createdAt`, `schema`, optional `changelog`, optional `shapeDiffFromPrevious`.

**404** — `NOT_FOUND`.

---

### `POST /v1/registry/schemas/:id/versions`

**Request**

```json
{
  "schema": { },
  "changelog": "optional, max 2000 chars"
}
```

**Response 200**

```json
{
  "success": true,
  "ok": true,
  "version": 2,
  "shapeDiffFromPrevious": {
    "addedPaths": [],
    "removedPaths": [],
    "typeChanges": []
  }
}
```

**400 / 404** as above.

---

### `GET /v1/registry/metering`

**Response 200**

```json
{
  "success": true,
  "ok": true,
  "metering": {
    "stabilize": { "success": 0, "total": 0 },
    "validateSchema": { "success": 0, "total": 0 },
    "registry": { "schemasCreated": 0, "versionsCreated": 0 },
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

---

### `POST /v1/text/stats`

**Request:** `{ "text": "..." }` (1–512 KiB)

**Response 200**

```json
{
  "success": true,
  "ok": true,
  "chars": 0,
  "lines": 0,
  "words": 0,
  "roughTokensLlMHint": 0,
  "note": "roughTokensLlMHint is ~chars/4, not a real tokenizer."
}
```

---

### `POST /v1/hash/sha256`

**Request**

```json
{
  "text": "...",
  "encoding": "utf8"
}
```

`encoding`: `"utf8"` (default) or `"hex"` (even-length hex string).

**Response 200:** `{ "success": true, "ok": true, "sha256": "<hex>", "encoding": "utf8" | "hex" }`  
**400** — `INVALID_HEX_INPUT` for bad hex.

---

## Standard error envelope

Used for **400**, **401**, **404** (and similar) on routes that use `apiError`:

```json
{
  "success": false,
  "error": {
    "code": "CODE",
    "message": "...",
    "details": { }
  }
}
```

`details` is omitted when empty; may contain Zod `issues`, `schemaRef`, etc.

---

## Summary

PayloadFix is an HTTP API for extracting JSON from noisy LLM output, repairing malformed structure, validating against enforceable schemas, managing versioned contracts, logging drift (with `schemaRef`), and returning transparent repair/coercion/failure metadata — a **reliability layer** between LLMs and production systems. For **generated clients and exhaustive field lists**, keep **`openapi.yaml`** as the source of truth alongside this document.
