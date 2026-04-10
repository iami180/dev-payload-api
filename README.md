# dev-payload-api

**PayloadFix** — HTTP helpers for **LLM output**: turn messy model text into parsed JSON (markdown code fences, JSON buried in prose, common syntax glitches), plus rough text stats and SHA-256 for tooling.

Full project description (Hungarian): **[PROJECT.md](./PROJECT.md)**.

## Endpoints

| Method | Path | What it does |
|--------|------|----------------|
| GET | `/` | Service name + version |
| GET | `/v1/health` | Liveness + endpoint list |
| POST | `/v1/llm/stabilize` | LLM-oriented pipeline on `raw` string → parsed JSON (`llmHints` shows what ran) |
| POST | `/v1/llm/validate-schema` | Same prep + **flat or nested** schema validation, coercion, strict/lenient |
| POST | `/v1/text/stats` | chars, lines, words, rough token estimate |
| POST | `/v1/hash/sha256` | SHA-256 (utf8 or hex input) |

`POST /v1/llm/stabilize` body: `{ "raw": "<paste model message>", "sortKeys": true, "pretty": true }`.

## RapidAPI

This project is meant to be consumed as an **API** (e.g. listed on RapidAPI). Step-by-step: **[RAPIDAPI.md](./RAPIDAPI.md)**. Import `openapi.yaml` after setting the `servers` URL to your HTTPS deployment.

**Field-by-field integration (requests, responses, status codes):** **[INTEGRATION.md](./INTEGRATION.md)**.

## Run locally

```bash
cd dev-payload-api
npm install
npm run dev
```

Production build:

```bash
npm run build
npm start
```

Environment: see `.env.example`. If `API_KEYS` is set (comma-separated), every `/v1/*` request must send `X-API-Key`. If unset, leave it open **for development only**.

## Live smoke tests (production URL)

Verifies the deployed API over HTTPS (default [Render](https://dev-payload-api.onrender.com/)) — stabilize, validate-schema, stats, hash, error shape.

```bash
npm install
npm run test:live
```

Optional env (see `.env.example`): `PAYLOADFIX_LIVE_URL`, `PAYLOADFIX_API_KEY` (required if your deployment sets `API_KEYS`). First request may be slow (cold start).

## Example requests

```bash
curl -s localhost:3000/v1/health

curl -s -X POST localhost:3000/v1/llm/stabilize \
  -H "Content-Type: application/json" \
  -d '{"raw": "Here is the result:\n```json\n{\"a\":1,}\n```"}'

curl -s -X POST localhost:3000/v1/text/stats \
  -H "Content-Type: application/json" \
  -d '{"text":"hello world\nline two"}'

curl -s -X POST localhost:3000/v1/hash/sha256 \
  -H "Content-Type: application/json" \
  -d '{"text":"payload"}'
```

On Windows PowerShell, fix quoting or use `curl.exe` with a JSON file and `--data-binary @body.json`.

## Docker

```bash
docker build -t payloadfix .
docker run -p 3000:3000 -e API_KEYS=your-secret payloadfix
```

(Run `npm run build` locally first, or extend the Dockerfile for a single-step image build.)

## License

MIT — use, change, and ship under your own brand.
