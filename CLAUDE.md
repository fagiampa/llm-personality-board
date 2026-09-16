# LLM Personality Board — griglia con radar chart HEXACO

Griglia di card, una per modello LLM, ciascuna con: monogramma, nome, badge
"live"/"Archived", breve testo descrittivo (one-liner), radar chart a sei assi
(HEXACO) con banda di incertezza attorno alla linea del punteggio medio, e un
combo per scegliere quale versione/run del modello visualizzare. Il progetto
non è più un semplice POC a dati mock: esiste una pipeline reale che
somministra il questionario ai modelli via API e persiste i risultati in un
DB, oltre a pagine di approfondimento (about / metodologia / considerazioni).

## Riferimento di design

Canvas pubblicato qui, pagina "Griglia" (vista desktop + variante mobile):
https://claude.ai/code/artifact/29508599-91f1-45f3-9d36-eb41b1d86a98 — per
look & feel, palette, tipografia (Space Grotesk + IBM Plex Sans) e per la
logica di disegno del radar chart in SVG.

## Stack tecnico

- **Frontend**: Next.js 14 (App Router) + React 18, TypeScript.
- **Radar chart**: SVG disegnato a mano in `components/RadarChart.tsx`
  (coordinate polari → cartesiane sui 6 assi), nessuna libreria di charting.
- **Persistenza**: SQLite via `sql.js` (WASM, nessuna build nativa) in
  `lib/db.mjs` — vedi sotto.
- **Provider LLM**: `@anthropic-ai/sdk`, `openai` (riusato anche per xAI/Grok
  e DeepSeek, entrambi API-compatibili con OpenAI), `@google/generative-ai`.
- **Hosting demo**: Vercel (deploy diretto di un progetto Next.js).
- **Nessun repo git** in questa directory (`git init` mai eseguito) — vedi
  "Note operative" sotto.

## Modello dati (`lib/hexaco.ts`)

```ts
interface ModelScore {
  name: string;
  monogram: string;
  hue: number;
  scores: [number, number, number, number, number, number]; // 0-100, ordine H,E,X,A,C,O
  oneLiner: string;
  dominant: string;
  margin?: [number, ...]; // mezza-larghezza banda di incertezza per dominio
  source: "live" | "fake";
  isCurrent?: boolean; // false se esiste una versione più recente dello stesso modello
  model?: string;       // stringa esatta del modello del provider, solo se source="live"
  assessedAt?: string;  // ISO timestamp del run, solo se source="live"
}
```

`H, E, X, A, C, O` = Onestà-Umiltà, Emotività, Estroversione, Gradevolezza,
Coscienziosità, Apertura (ordine fisso ovunque, dal DB al radar chart).

## Persistenza (`lib/db.mjs`)

DB SQLite a file singolo (`data/psychochat.sqlite`), due tabelle:

- `assessments`: una riga per run `(model_name, assessed_at)` — stesso shape
  di `ModelScore` più `item_means` (media per item sui repeat).
- `assessment_item_repeats`: una riga per `(model_version, assessed_at, item,
  repeat)` con la risposta grezza 1-5 — full fidelity dietro alle medie sopra.
  Chiave su `model_version` (il run vero, es. `"gemini-3.5-flash-lite"`), non
  su `model_name` (la famiglia, es. `"Gemini"`).

`is_current` è un fatto salvato, ricalcolato a ogni scrittura: la riga con il
`model_version` "più recente" per un dato `model_name` vince (`isNewer` in
`lib/db.mjs`, che confronta prima per numero di versione estratto dalla
stringa, poi per `assessed_at`) e diventa quella mostrata come "live"; le
altre diventano "Archived", indipendentemente da quale fosse il run
effettivamente più recente in senso cronologico.

`data/mock-scores.json` e i backup in `data/history/*.json` sono lo stato
**pre-migrazione a SQLite**: `scripts/import-to-db.mjs` (`npm run db:import`)
li ha importati una volta nel DB. Da quel momento `app/page.tsx` legge solo
dal DB (`listLatestPerModel()`), non più da quei file JSON — restano come
archivio storico, non più scritti da `scripts/assess.mjs`.

## Pipeline di assessment (`scripts/assess.mjs`, `npm run assess`)

Somministra il vero item bank IPIP-HEXACO (240 item, analogo di pubblico
dominio dell'HEXACO-PI-R) in `items/sample/json/items.sample.json` a un
modello reale per provider configurato in `MODEL_CONFIG`, e scrive ogni run
direttamente nel DB via `upsertAssessment`. Non è una somministrazione
psicometrica validata: è un proxy pragmatico (ogni item chiesto
`ASSESS_REPEATS` volte a temperatura 1; lo spread tra i repeat fa da banda di
confidenza).

Punti da tenere a mente se si tocca questo script:

- Item raggruppati in batch da `ASSESS_BATCH_SIZE` (default 40) per ridurre le
  round-trip, mescolati tra domini per evitare che il modello si "ancori" a
  risposte consecutive dello stesso dominio.
- Ogni provider ha le sue trappole sui "reasoning token" che possono mangiarsi
  tutto il budget di output prima di produrre testo visibile (famiglie
  o1/o3/o4/gpt-5, Grok con `reasoning_effort` di default alto): vedi i
  commenti su `isReasoningModel` e `makeXaiClient`.
- `ASSESS_ONLY=NomeModello` limita il run a un sottoinsieme di modelli; gli
  altri restano invariati nel DB.
- Un modello senza chiave API configurata, o escluso da `ASSESS_ONLY`, non
  aborta l'intero run: viene solo saltato con un warning.
- A fine run per ogni modello, una chiamata extra genera un self-interpretation
  one-liner (il modello descrive se stesso alla luce dei propri punteggi),
  invece di un testo template — evita che modelli con profili simili
  producano lo stesso one-liner.

## API routes (`app/api/*`)

- `GET /api/models` → `listLatestPerModel()`, un `ModelScore` per modello
  (quello con `is_current = 1`). Usata dal server component `app/page.tsx`.
- `GET /api/versions?model=X` → lista dei run disponibili per un modello
  (per popolare il combo di versione di una card).
- `GET /api/assessment?model=X&assessedAt=Y` → un `ModelScore` puntuale per
  quel `(model, assessedAt)`; `assessedAt` assente/vuoto = entry seed.

## Struttura di progetto

```
/components/RadarChart.tsx      # radar chart SVG (6 assi, banda min/max, linea media)
/components/ModelCard.tsx        # card: monogramma, nome, one-liner, radar, combo versione
/components/ModelGrid.tsx        # griglia client-side, owns lo stato di selezione versione per card
/app/page.tsx                    # home: server component, legge il DB, renderizza ModelGrid
/app/about/                      # pagina "about this idea"
/app/methodology/                # pagina metodologia (solo IT per ora)
/app/considerations/             # pagina "ulteriori considerazioni" (solo IT per ora)
/app/api/models, /versions, /assessment/route.ts
/lib/hexaco.ts                   # tipi condivisi (ModelScore, label HEXACO)
/lib/db.mjs                      # persistenza SQLite (sql.js)
/scripts/assess.mjs              # somministra il questionario ai modelli via API, scrive nel DB
/scripts/import-to-db.mjs        # migrazione one-off da mock-scores.json + data/history/ al DB
/scripts/dump-db.mjs             # dump di ispezione del DB
/scripts/fill-empty-onliners.mjs # backfill di one-liner mancanti
/items/sample/json/items.sample.json  # item bank IPIP-HEXACO reale (240 item), nonostante il nome "sample"
/data/psychochat.sqlite          # DB
/data/mock-scores.json, /data/history/*.json  # stato pre-DB, solo archivio storico
```

## Combo di selezione versione (`ModelCard.tsx`)

Non è una `<select>` nativa: un popup nativo può aprirsi verso l'alto e
coprire il radar chart/one-liner sopra di sé. È un listbox custom
(`VersionCombo`), ancorato solo al bordo inferiore del trigger, con altezza
del pannello clampata via JS allo spazio realmente disponibile sotto (scroll
invece di overflow). La freccia (`.comboCaret`, un carattere `▾`) deve
restare leggibile: **12px / opacity 0.75** (alzata da 8px/0.6, era troppo
piccola per essere notata come indicatore di dropdown).

## Note operative

- **Nessun repo git in questa cartella.** Non c'è `git stash`/`checkout` come
  rete di sicurezza: trattare con cautela extra qualsiasi operazione
  distruttiva o di overwrite sui file di progetto.
- `data/history/*.json` non ha un cap di retention — scelta intenzionale
  (dati potenzialmente ancora utili), non un oversight: non aggiungere logica
  di pruning/rotazione senza che sia esplicitamente richiesto.
- Le pagine `/methodology` e `/considerations` sono deliberatamente solo in
  italiano per ora.
