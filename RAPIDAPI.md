# Listing PayloadFix on RapidAPI

This repo is an **HTTP API** (no web UI). Use this checklist after your backend is live on **HTTPS** (e.g. Render).

## 1. Prepare the spec

1. Open `openapi.yaml`.
2. Replace `https://YOUR_HOST` under `servers` with your real base URL, **without** a trailing slash  
   (e.g. `https://dev-payload-api.onrender.com`).

## 2. Backend auth vs RapidAPI

RapidAPI users call **RapidAPI’s** URL with `X-RapidAPI-Key`. Your server can still use **`API_KEYS`** + `X-API-Key`.

**Recommended:** In the RapidAPI **Provider Dashboard**, configure the API so each request **to your origin** includes a fixed header, e.g.:

- Header name: `X-API-Key`  
- Value: one of the keys you set in `API_KEYS` on Render  

(Exact UI path varies; look for *Transformations*, *Backend*, *Custom headers*, or *Endpoint settings* for your API.)

**Alternative:** Leave `API_KEYS` **unset** on the server so the origin is open. Simpler, but anyone who discovers the URL can hit it directly — use only if you accept that risk.

## 3. Add the API on RapidAPI

1. [RapidAPI Provider Dashboard](https://rapidapi.com/provider/dashboard) → **Add New API** (or **My APIs** → add).
2. **Import** OpenAPI: upload `openapi.yaml` (with `servers` already fixed), or paste spec.
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

## 6. Health check

RapidAPI (and monitors) can use:

`GET /v1/health` — no `X-API-Key` required on your API **if** `API_KEYS` is unset.  
If `API_KEYS` is set, health checks must send `X-API-Key` (or you exempt `/v1/health` in code — not implemented here).

---

**Summary:** Fix `servers` in `openapi.yaml`, deploy HTTPS, import to RapidAPI, wire `X-API-Key` from RapidAPI → your backend if you use `API_KEYS`, then test and publish.
