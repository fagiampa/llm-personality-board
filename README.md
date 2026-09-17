# LLM Personality Board

A grid of cards showing each LLM's personality profile on the **HEXACO** model — the same six-dimension questionnaire humans take (Honesty-Humility, Emotionality, Extraversion, Agreeableness, Conscientiousness, Openness), administered directly to language models via API and visualized as a radar chart with an uncertainty band.

ChatGPT, Claude, Gemini, Grok and DeepSeek all take the exact same 240-item instrument, scored the same way, tracked version by version over time.

## Features

- **Real assessment pipeline** (`scripts/assess.mjs`): administers the full 240-item [IPIP-HEXACO](https://ipip.ori.org/newHEXACO_PI_key.htm) inventory (public-domain analog of the HEXACO-PI-R) to each configured model, 3 repeats at temperature 1, batched to cut API round-trips.
- **Hand-drawn SVG radar chart** (`components/RadarChart.tsx`) — no charting library, just polar-to-cartesian math.
- **Version history per model** — every run is a row in a SQLite DB; each card has a version combo to browse past runs, with the highest-ranked version per model shown as "live" and the rest "Archived".
- **Model self-interpretation** — the one-liner on each card isn't a template, it's the model describing its own personality in light of its own scores.
- **Bilingual (EN/IT)**, driven automatically by the browser's `Accept-Language` header — no manual switcher.
- **`/questionnaire`** — the full 240-item list, grouped by domain and facet, shown in the exact English wording actually sent to the models.
- **`/methodology`** and **`/considerations`** — the reasoning behind the design choices, and honest doubts about what the whole exercise does and doesn't mean.

## Tech stack

- **Frontend**: Next.js 14 (App Router), React 18, TypeScript.
- **Persistence**: SQLite via [`sql.js`](https://github.com/sql-js/sql.js) (WASM, no native build step) — `data/psychochat.sqlite`.
- **Providers**: `@anthropic-ai/sdk`, `openai` (also used for xAI/Grok and DeepSeek, both OpenAI-compatible), `@google/generative-ai`.
- **Item bank**: `items/sample/json/items.sample.json` — the real, full IPIP-HEXACO battery (public domain), despite the "sample" name.

## Getting started

```bash
git clone <this-repo>
cd progetto-psycochat
npm install
cp .env.example .env   # fill in the API keys for the providers you want to assess
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm run assess` | Administer the questionnaire to every configured model and write results to the DB (needs API keys in `.env`) |
| `npm run db:import` | One-off: import `data/mock-scores.json` + `data/history/*.json` into the SQLite DB |
| `npm run translate-onliners` | One-off: backfill Italian translations for existing English card descriptions |

Useful `assess` overrides (see `.env.example`): `ASSESS_ONLY=Gemini` to (re)assess a single model, `GOOGLE_MODEL=gemini-3.6-flash` (etc.) to pin a specific provider model version.

## Contributing

Issues and pull requests are welcome — this is meant to be a community-run instrument, not a one-off demo. See [`LICENSE`](./LICENSE) for the terms contributions are accepted under.

## Licenza

LLM Personality Board © 2026 il tennico (tennicodabar@gmail.com). Distribuito sotto GNU AGPL v3.0 o successive. Vedi il file [LICENSE](./LICENSE).
