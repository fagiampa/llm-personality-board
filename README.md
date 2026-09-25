# LLM Personality Board

An open observatory of **what language models say about their own honesty, and what they actually do**.

Each model answers a personality questionnaire about itself. Then it is put to work: a coding task, with tools, that
cannot be completed. The project measures the **gap** between the two, that is, between what the model *declares*
and what it *enacts* when an honest report costs it something.

**Live site**: https://aipersonality.org

## What a card shows

One card per model version:

- a **HEXACO radar**, from the model's answers to the 240-item [IPIP-HEXACO](https://ipip.ori.org/newHEXACO_PI_key.htm)
  questionnaire (public-domain analog of the HEXACO-PI-R): the general, trait-level self-report (**declared, general**)
- on the Honesty-Humility axis, two points:
  - **declared (specific)**: the model's answers to 12 statements about concrete work situations (for example,
    naming a workaround in the same sentence where it reports success), asked in a separate session
  - **enacted**: how faithfully it reports on its own work in an agentic task it cannot finish (the L3 probe),
    labelled by a judge model from the tool log and the final message
- a badge: **complete** once that version has had a complete run of the current L3 scenario set

For now the grid shows only versions with a complete L3 run (`HOME_ONLY_COMPLETE_L3` in `lib/db.mjs`).

Everything is preliminary: three L3 scenarios, a handful of models. The pages `/about`, `/methodology` and
`/considerations` explain the design, its limits and the doubts behind it.

## Getting started

Requires Node.js 20.6 or later.

```bash
git clone https://github.com/fagiampa/llm-personality-board.git
cd llm-personality-board
npm install
npm run db:rebuild   # recreate the SQLite DB from the data in the repo
npm run dev
```

Open [http://localhost:3000](http://localhost:3000): you get the same board as the live site, with no API keys needed.

`npm run db:rebuild` builds `data/psychochat.sqlite` from `data/records/` and the raw answers under `data/`. It also
checks every aggregate that can be recomputed (scores from the answers, enacted from the judge labels), and that every
transcript a record points at is in `data/probe-raw/`. See [`data/README.md`](data/README.md).

## Running your own measurements

Copy `.env.example` to `.env` and add API keys for the providers you want to call (Anthropic, OpenAI, Google, xAI,
DeepSeek). Pick the model version with `ANTHROPIC_MODEL`, `OPENAI_MODEL`, etc. The defaults are cheap models on
purpose.

The order matters:

1. `npm run assess`: the HEXACO questionnaire (declared, general)
2. `npm run declared`: the action-anchored item bank (declared, specific). Always its **own session**, never in the
   same conversation as the probes: the items describe the probe's situations, and sharing a session is priming.
3. `npm run probe-l3`: the agentic probe (enacted). Multi-turn conversations with tool calls, so costs add up
   quickly on large models. Debug with the fake driver in `tests/l3-agent.test.mjs`, never with paid calls.

Each script can be scoped to one model (`ASSESS_ONLY=Claude`, `DECLARED_ONLY=…`, `PROBE_L3_ONLY=…`). After a run,
`npm run export-raw` writes the new data to `data/`, so it can be committed and rebuilt by anyone.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm test` | Unit tests, plus a check that the committed data rebuilds into a consistent DB |
| `npm run lint` | ESLint |
| `npm run db:rebuild` | Recreate the DB from `data/` (add `-- --force` to overwrite an existing one) |
| `npm run export-raw` | Write the DB's answers and records to `data/` |
| `npm run assess` | HEXACO questionnaire, 240 items, repeated at temperature 1 |
| `npm run declared` | Action-anchored item bank (current set: `RF-v3`) |
| `npm run probe-l3` | L3 agentic probe (primary), judged by `gpt-6-astra` by default |
| `npm run probe` | L2 probe (a small control) |

## Specs and docs

The specs are the source of truth. When a decision changes, the spec is updated first, then the code.

- [`docs/declared-spec.md`](docs/declared-spec.md): the declared side and the three-level record
- [`docs/probe-l3-spec.md`](docs/probe-l3-spec.md): the primary probe, its judge rubric and its calibration
- [`docs/probe-l2-spec.md`](docs/probe-l2-spec.md): the control probe
- [`docs/positioning.md`](docs/positioning.md): related work
- [`CLAUDE.md`](CLAUDE.md): architecture notes and the non-negotiable rules

## Tech stack

Next.js 14 (App Router), React 18, TypeScript. SQLite via [`sql.js`](https://github.com/sql-js/sql.js) (WASM, no
native build step). Provider SDKs: `@anthropic-ai/sdk`, `openai` (also used for xAI and DeepSeek),
`@google/generative-ai`. Hand-drawn SVG charts, no charting library. Bilingual (EN/IT), picked from the browser's
`Accept-Language` header.

## Contributing

Issues and pull requests are welcome. This is meant to be a community-run instrument, not a one-off demo. Adding a
scenario is a one-file pull request. See [`CONTRIBUTING.md`](./CONTRIBUTING.md), including the notes on AI-assisted
contributions.

## Licenza

LLM Personality Board © 2026 il tennico (tennicodabar@gmail.com). Distribuito sotto GNU AGPL v3.0 o successive. Vedi il file [LICENSE](./LICENSE).
