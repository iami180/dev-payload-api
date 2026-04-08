# dev-payload-api

**PayloadFix** — HTTP helpers for **LLM output**: turn messy model text into parsed JSON (markdown code fences, JSON buried in prose, common syntax glitches), plus rough text stats and SHA-256 for tooling.

## Endpoints

| Method | Path | What it does |
|--------|------|----------------|
| GET | `/` | Service name + version |
| GET | `/v1/health` | Liveness + endpoint list |
| POST | `/v1/llm/stabilize` | LLM-oriented pipeline on `raw` string → parsed JSON (`llmHints` shows what ran) |
| POST | `/v1/text/stats` | chars, lines, words, rough token estimate |
| POST | `/v1/hash/sha256` | SHA-256 (utf8 or hex input) |

`POST /v1/llm/stabilize` body: `{ "raw": "<paste model message>", "sortKeys": true, "pretty": true }`.

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

## Tests

```bash
npm test
```

Includes a **temp-file roundtrip** test: saves a fake LLM reply to disk, parses it, writes `parsed.json`, and asserts the content.

## Try on real files (CLI)

The HTTP API does **not** edit your repo files — it only returns JSON. To **write** a fixed JSON file from a saved model reply:

1. Save the model output as UTF-8 text, e.g. `llm-out.txt`.
2. Run:

```bash
npm run fix:llm-json -- llm-out.txt fixed.json
```

Pretty JSON goes to `fixed.json`; hints go to stderr. Omit `fixed.json` to print JSON to stdout.

Same logic as `POST /v1/llm/stabilize` (no server required).

## Docker

```bash
docker build -t payloadfix .
docker run -p 3000:3000 -e API_KEYS=your-secret payloadfix
```

(Run `npm run build` locally first, or extend the Dockerfile for a single-step image build.)

## License

MIT — use, change, and ship under your own brand.
