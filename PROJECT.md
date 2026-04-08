# dev-payload-api — teljes projektleírás

## 1. Mi ez?

A **dev-payload-api** (termékneve: **PayloadFix**) egy **REST API** (HTTP/JSON), amit főleg **LLM-ek (nagy nyelvi modellek) szöveges kimenetének** feldolgozására szántak: a modell gyakran nem „tiszta” JSON-t ad, hanem markdown keretben, magyarázó szövegben, vagy enyhén szintaktikailag hibás formában.

A projekt **nem** webes felhasználói felület: fejlesztők, automatizálás (n8n, Make, saját backend), vagy piactér (**RapidAPI**) számára készült **programozható szolgáltatás**.

Verzió (package): **0.2.0**.

---

## 2. Milyen problémát céloz?

- Chatbot / LLM válasz: `` ```json ... ``` ``, előtte–utána szöveg.
- „Majdnem JSON”: pl. utolsó vessző objektum után, amit a sima `JSON.parse` elutasít.
- Tiszta, **strukturált adat** kell a további pipeline-nak (mentés, validálás, UI), nem kézi szerkesztés.

**Nem cél:** hivatalos számla, banki validáció, jogi „igazság” — a szolgáltatás **fejlesztői eszköz** jellegű.

---

## 3. Publikus HTTP végpontok

Minden útvonal **JSON** választ ad, kivéve ha másként nincs jelölve. CORS: `Access-Control-Allow-Origin: *`.

| Metódus | Útvonal | Leírás |
|--------|---------|--------|
| `GET` | `/` | Szolgáltatás meta: név, tagline, verzió, docs hivatkozás. |
| `GET` | `/v1/health` | Életjel, fókusz leírás, listázott végpontok. |
| `POST` | `/v1/llm/stabilize` | **Fő funkció:** LLM-szöveg → kinyert és javított JSON. |
| `POST` | `/v1/text/stats` | Karakter-, sor-, szószám + durva „token” becslés (kb. karakter/4). |
| `POST` | `/v1/hash/sha256` | SHA-256 hash UTF-8 szövegre vagy hex dekódolt bájtokra. |

### `POST /v1/llm/stabilize`

**Body (JSON):**

- `raw` (kötelező): a modell válaszának teljes vagy részleges szövege.
- `sortKeys` (opcionális, alap: `true`): objektum kulcsok rekurzív ábécé rendezése.
- `pretty` (opcionális, alap: `true`): a `stringified` mező szép formázása.

**Sikeres válasz:** `ok`, `method` (`direct` | `repaired`), `repairedFrom` (ha volt jsonrepair), `llmHints` (pl. `markdown_fence_removed`, `embedded_json_extracted`), `data`, `stringified`.

**Hibák:** `400` (rossz body / validáció), `422` (nem sikerült parse még javítás után sem).

### Belső pipeline (`stabilizeFromLlm`)

1. **Markdown fence** levágása (`` ```json `...` `` / `` ``` `...` ``).
2. `JSON.parse`; ha hiba → **jsonrepair** + újra parse (max. **512 KiB** bemenet, különben `payload_too_large`).
3. Ha még mindig hiba: **első kiegyensúlyozott `{...}` vagy `[...]`** kinyerése (idézőjelek közötti `{`/`}` figyelembevéve).
4. Opcionális kulcsrendezés a válasz előállításakor.

### `POST /v1/text/stats`

Body: `{ "text": "..." }` (max 512 KiB). Válasz: `chars`, `lines`, `words`, `roughTokensLlMHint`, rövid megjegyzés hogy nem igazi tokenizer.

### `POST /v1/hash/sha256`

Body: `{ "text": "...", "encoding": "utf8" | "hex" }`. Válasz: `sha256` hex string.

---

## 4. Biztonság: API kulcs

Ha a környezetben be van állítva **`API_KEYS`** (vesszővel elválasztott lista), minden **`/v1/*`** kéréshez kötelező header:

`X-API-Key: <egyező kulcs>`

A `GET /` és (kulcs nélkül) a kulcsmentes üzemmód kivétel: `/v1/*` védelem nélkül **csak fejlesztésre** ajánlott.

A middleware **minden kérésnél** újraolvassa az `API_KEYS` változót (tesztelhetőség, 12-factor).

---

## 5. Technológiai stack

| Réteg | Technológia |
|-------|-------------|
| HTTP keretrendszer | **Hono** 4 |
| Node szerver | **@hono/node-server** (`serve`) |
| Nyelv | **TypeScript** → `tsc` → `dist/` |
| Validáció | **Zod** 3 |
| JSON javítás | **jsonrepair** |
| Tesztek | **Vitest** 3 + **@vitest/coverage-v8** |

**Külső HTTP API nincs** a üzleti logikában: minden számítás helyben fut.

---

## 6. Forrástruktúra (fontosabb fájlok)

```
dev-payload-api/
├── src/
│   ├── index.ts              # Belépő: listen, PORT
│   ├── app.ts                # Hono útvonalak
│   ├── lib/
│   │   ├── llmJsonPrep.ts    # Fence + extract + stabilizeFromLlm
│   │   ├── stabilizeJson.ts  # parse / jsonrepair / méretlimit
│   │   ├── sortKeys.ts       # Rekurzív kulcsrendezés
│   │   └── *.test.ts         # Egységtesztek
│   └── middleware/
│       └── apiKey.ts
├── tests/
│   ├── app.integration.test.ts
│   ├── stress.test.ts
│   └── fileRoundtrip.test.ts # Fájl I/O + tmp könyvtár
├── scripts/
│   └── fix-llm-json.ts       # CLI: fájl → fájl (szerver nélkül)
├── openapi.yaml              # OpenAPI 3, RapidAPI import
├── RAPIDAPI.md               # RapidAPI feltöltési útmutató
├── render.yaml               # Render Blueprint (Node)
├── Dockerfile                # Opcionális konténer build
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── README.md
├── PROJECT.md                # Ez a fájl
└── .env.example
```

---

## 7. Parancsok

| Parancs | Jelentés |
|---------|----------|
| `npm run dev` | `tsx watch src/index.ts` — fejlesztői szerver |
| `npm run build` | TypeScript fordítás → `dist/` |
| `npm start` | `node dist/index.js` — éles futtatás |
| `npm test` | Összes Vitest teszt |
| `npm run test:watch` | Figyelő mód |
| `npm run test:coverage` | Lefedettség |
| `npm run fix:llm-json -- <in> [out]` | CLI: LLM szövegfájl → JSON fájl / stdout |

**Port:** `process.env.PORT` vagy alapértelmezés **3000**.

---

## 8. Deploy

- **Render:** `render.yaml` (Node: `npm ci && npm run build`, `npm start`, health `/v1/health`). Dockerrel is lehet (repo `Dockerfile`).
- **Környezet:** lásd `.env.example` (`PORT`, `API_KEYS`).

---

## 9. Tesztelés

- **~50** automata teszt: lib függvények, HTTP integráció (`app.request`), stressz, ideiglenes fájl roundtrip.
- **NIST SHA-256** tesztve az `abc` vektorral.
- Párhuzamos health hívások, CORS fejléc, API kulcs ágak.

---

## 10. RapidAPI / piactér

- **`openapi.yaml`**: cseréld a `servers` URL-t a saját HTTPS originre import előtt.
- Részletes lépések: **`RAPIDAPI.md`** (proxy, `X-API-Key`, árazás, listing).

---

## 11. Korlátok

- Bemeneti szöveg limit **512 KiB** a stabilize útvonalon (és a kapcsolódó validációknál hasonló nagyságrend).
- A kinyerés és javítás **heurisztikus**; extrém vagy rosszindulatú bemenet lehet, hogy továbbra is 422.
- **Nem** helyettesíti a hivatalos JSON séma validátort vagy üzleti szabályokat — a kimenetet érdemes tovább validálni a saját rendszeredben.

---

## 12. Licenc

**MIT** — lásd README.
