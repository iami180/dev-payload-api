# Listing PayloadFix on RapidAPI

This repo is an **HTTP API** (no web UI). Use this checklist after your backend is live on **HTTPS** (e.g. Render).

## 1. Prepare the spec

1. Prefer **`openapi.yaml`** (spec **0.5.0**). If the Hub shows **“unknown internal error”** on save, try **`openapi.json`** instead (same spec, bundled — some RapidAPI imports handle JSON more reliably).
2. Replace `https://YOUR_HOST` under `servers` with your real base URL, **without** a trailing slash  
   (e.g. `https://dev-payload-api.onrender.com`). A placeholder host can sometimes confuse the Hub; use your **live** URL before **Save**.
3. Regenerate JSON after YAML edits: `npx @redocly/cli bundle openapi.yaml -o openapi.json` (or `npm run openapi:bundle`).

### If import still fails

- Wait a few minutes and **retry** (transient RapidAPI errors happen).
- **Discard** → upload again; try another browser or incognito.
- Nested-schema / multi-example bodies were simplified in the spec to avoid fragile Hub parsers; full behavior is unchanged in the real API.

## 2. Backend auth vs RapidAPI

RapidAPI users call **RapidAPI’s** URL with `X-RapidAPI-Key`. Your server can still use **`API_KEYS`** + `X-API-Key`.

**Recommended:** In the RapidAPI **Provider Dashboard**, configure the API so each request **to your origin** includes a fixed header, e.g.:

- Header name: `X-API-Key`  
- Value: one of the keys you set in `API_KEYS` on Render  

(Exact UI path varies; look for *Transformations*, *Backend*, *Custom headers*, or *Endpoint settings* for your API.)

**Alternative:** Leave `API_KEYS` **unset** on the server so the origin is open. Simpler, but anyone who discovers the URL can hit it directly — use only if you accept that risk.

## 3. Add the API on RapidAPI

1. [RapidAPI Provider Dashboard](https://rapidapi.com/provider/dashboard) → **Add New API** (or **My APIs** → add).
2. **Import** OpenAPI: upload `openapi.yaml` or `openapi.json` (with `servers` already fixed), or paste spec.
3. Map **Base URL** if the importer asks (same as in `servers`).
4. Save and run **Test** in the hub console on `GET /v1/health` and `POST /v1/llm/stabilize`.

## 4. Pricing & tiers

- Add a **free** tier with a low monthly quota so people can try the LLM JSON endpoint.
- Add a paid tier for higher limits on `POST /v1/llm/stabilize` (main value).

## 5. Listing quality

- **Hub README / long description:** copy-paste from **[RAPIDAPI_README.md](./RAPIDAPI_README.md)** (English, marketplace-ready).
- **Short description:** focus on *LLM output → valid JSON* (markdown fences, prose, small syntax fixes).
- **Long description:** paste examples of `raw` payloads (fenced JSON, “Here is the result: …”).
- **Category:** something like *Data* or *Tools* / *Text analysis* — pick what fits RapidAPI’s taxonomy.

### When the hub text is too short (complex APIs)

RapidAPI favors **short listings**. For PayloadFix, **do not** put the full nested-schema story in the hub blurb.

**Use a split:**

| Layer | What to put |
|--------|----------------|
| **Short / subtitle** | One sentence: pain + outcome (see snippets below). |
| **Long description (if limit allows)** | 3 bullets max + **one link**: “Full docs & nested schema → GitHub README” (your repo URL). |
| **OpenAPI import** | Your `openapi.yaml` already carries **per-endpoint** descriptions — that’s where complexity belongs. Users who expand an endpoint see the detail. |
| **External** | GitHub `README.md` + `PROJECT.md` (Hungarian) = canonical depth. Optional: enable GitHub Pages on `/docs` later. |

**Copy-paste snippets (English):**

- **Ultra-short (~120 chars):**  
  `Turn messy LLM replies into real JSON: strips markdown fences, repairs syntax, optional nested schema validation & coercion.`

- **Short blurb (~350 chars):**  
  `PayloadFix cleans model output so your app gets structured JSON. POST raw chat text → parsed JSON (fences, prose, trailing commas). Use validate-schema for production: flat or nested object schemas, type coercion, strict/lenient modes, field-level errors and confidence. Full API details: [YOUR_GITHUB_REPO_URL]`

- **First line of long README (hub):**  
  `**Docs:** [YOUR_GITHUB_REPO_URL] — nested schema, examples, limits. This page is a summary.`

Replace `[YOUR_GITHUB_REPO_URL]` with your public repo link (or a short link).

## 6. Health check

RapidAPI (and monitors) can use:

`GET /v1/health` — no `X-API-Key` required on your API **if** `API_KEYS` is unset.  
If `API_KEYS` is set, health checks must send `X-API-Key` (or you exempt `/v1/health` in code — not implemented here).

---

**Summary:** Fix `servers` in `openapi.yaml`, deploy HTTPS, import to RapidAPI, wire `X-API-Key` from RapidAPI → your backend if you use `API_KEYS`, then test and publish.
