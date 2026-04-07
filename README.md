# dev-payload-api

**PayloadFix** — a small HTTP API for **developer / LLM pipelines**: fix messy JSON, basic text stats, SHA-256 hashing. **Not** a single source of truth for financial, legal, or safety-critical decisions — worst case you get a bad parse or wrong hash, not a wire transfer.

## Market (short)

- Many teams hit **broken JSON** (LLMs, legacy APIs, manual edits). *Normalize / repair* utilities are a known category (encoding repair, CSV sanitize, token counters, etc.).
- **Audience:** backend developers, automation (n8n, Make), testers, prompt pipelines.
- **Monetization:** RapidAPI or your own site + Stripe (free tier + paid tiers), or small-team B2B flat monthly.

## Endpoints

| Method | Path | What it does |
|--------|------|----------------|
| GET | `/` | Service name + version |
| GET | `/v1/health` | Liveness + endpoint list |
| POST | `/v1/json/stabilize` | `JSON.parse`, else `jsonrepair`, optional recursive key sort |
| POST | `/v1/text/stats` | chars, lines, words, rough token estimate |
| POST | `/v1/hash/sha256` | SHA-256 (utf8 or hex input) |

## Deploy (Render)

1. Go to [Render](https://render.com) → sign in → **New** → **Blueprint**.
2. Connect the repo `iami180/dev-payload-api` (or **New → Web Service** and pick the same GitHub repo).
3. With **Blueprint**, root `render.yaml` fills in the settings.
4. **Manual** Web Service: **Build** `npm ci && npm run build`, **Start** `npm start`, **Health check path** `/v1/health`.
5. Optional: **Environment** → `API_KEYS` (comma-separated) → all `/v1/*` calls need header `X-API-Key`.
6. After deploy, your public URL may look like `https://dev-payload-api.onrender.com` — try `GET .../v1/health`.

**Free** instances may spin down; the first request after idle can be slow.

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

## RapidAPI

1. Deploy a public HTTPS URL (Railway, Fly.io, Render, etc.).
2. Provider hub: **Add Your API** → import `openapi.yaml` (replace `YOUR_HOST`).
3. Pricing: e.g. free 50–100 calls/day, paid above that.
4. Behind RapidAPI’s proxy you may skip your own `API_KEYS`; if the origin is also public, set a key.

## License

MIT — use, change, and ship under your own brand.
