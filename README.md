# dev-payload-api

**PayloadFix** — a small HTTP API for **developer / LLM pipelines**: fix messy JSON, basic text stats, and SHA-256 hashing.

## Endpoints

| Method | Path | What it does |
|--------|------|----------------|
| GET | `/` | Service name + version |
| GET | `/v1/health` | Liveness + endpoint list |
| POST | `/v1/json/stabilize` | `JSON.parse`, else `jsonrepair`, optional recursive key sort |
| POST | `/v1/text/stats` | chars, lines, words, rough token estimate |
| POST | `/v1/hash/sha256` | SHA-256 (utf8 or hex input) |

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

curl -s -X POST localhost:3000/v1/json/stabilize \
  -H "Content-Type: application/json" \
  -d '{"raw": "{\"a\":1,}"}'

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
