# dev-payload-api

**PayloadFix** — mikro-API **fejlesztői / LLM pipeline** feladatokra: hibás vagy rendezetlen JSON javítása, szövegstatisztika, SHA-256. **Nem** pénzügyi, jogi vagy kritikus döntés egyetlen forrása — ha elrontod a kódot, legfeljebb rossz parse / rossz hash, nem utalás.

## Piac (röviden)

- Sok csapat kap **szakadt JSON-t** (LLM, régi API-k, kézi szerkesztés). A *normalize / repair* irány használatos a piacon (hasonló kategória: encoding repair, CSV sanitize, token számlálók).
- **Célközönség:** backend fejlesztők, automatizálás (n8n, Make), tesztelők, prompt pipeline-ok.
- **Monetizáció:** RapidAPI / saját oldal + Stripe: ingyenes kvóta + magasabb tier; vagy B2B fix havi „unlimited” kis csapatoknak.

## Végpontok

| Metódus | Útvonal | Mit csinál |
|--------|---------|------------|
| GET | `/` | Szolgáltatás név + verzió |
| GET | `/v1/health` | Életjel + lista |
| POST | `/v1/json/stabilize` | `JSON.parse`, különben `jsonrepair`, opcionálisan rekurzív kulcsrendezés |
| POST | `/v1/text/stats` | karakter, sor, szó, durva token becslés |
| POST | `/v1/hash/sha256` | SHA-256 (utf8 vagy hex input) |

## Futtatás

```bash
cd dev-payload-api
npm install
npm run dev
```

Éles:

```bash
npm run build
npm start
```

Környezet: lásd `.env.example`. Ha beállítod az `API_KEYS`-t (vesszővel elválasztva), minden `/v1/*` kéréshez kell: `X-API-Key`. Ha üres, **csak fejlesztésre** hagyd nyitva.

## Példa hívások

```bash
curl -s localhost:3000/v1/health

curl -s -X POST localhost:3000/v1/json/stabilize ^
  -H "Content-Type: application/json" ^
  -d "{\"raw\": \"{\\\"a\\\":1,}\"}"

curl -s -X POST localhost:3000/v1/text/stats ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"hello world\\nline two\"}"

curl -s -X POST localhost:3000/v1/hash/sha256 ^
  -H "Content-Type: application/json" ^
  -d "{\"text\":\"payload\"}"
```

(PowerShellben a JSON idézőjeleket igazítsd vagy használj `curl.exe`-t fájlból.)

## Docker

```bash
docker build -t payloadfix .
docker run -p 3000:3000 -e API_KEYS=your-secret payloadfix
```

(Előtte helyi `npm run build`, vagy bővítsd a Dockerfile-t, ha egy lépésben akarod.)

## RapidAPI

1. Deployolj publikus HTTPS URL-t (Railway, Fly.io, Render, stb.).
2. Provider hub: **Add Your API** → importáld az `openapi.yaml`-t (cseréld `YOUR_HOST`-ot).
3. Árazás: pl. ingyenes 50–100 hívás / nap, fizetős több.
4. Backend: vagy RapidAPI proxy mögött **nem** kötelező saját `API_KEYS`; ha közvetlenül is elérhető az URL, állíts kulcsot.

## Licenc

MIT — használd, módosítsd, add el alatta a saját márkádat.
