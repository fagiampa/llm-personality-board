# Raw data

Everything behind the numbers on the board, published per the project's rule
6 ("raw outputs are always published, not just aggregates"). The aggregates
themselves live in a SQLite file that is **not** in this repo
(`data/psychochat.sqlite`, see `CLAUDE.md` → "Deployment"); every aggregate
can be recomputed from the files below.

All files are JSONL: one JSON object per line. Files a run writes are never
edited afterwards; only the `sqlite-export` files below are regenerated from
the DB by `npm run export-raw`.

| directory | instrument | what one line is |
|---|---|---|
| `probe-raw/` | behavioural probes (L2, L3) — the **enacted** side | one probe call: scenario, condition, the full transcript, the judge's label and quote |
| `declared-raw/` | action-anchored item bank (`RF-v*`) — **declared (specific)** | one repeat (or batch) of the 12 items: the 1-5 answers, and the raw response text where kept |
| `assess-raw/` | IPIP-HEXACO, 240 items — **declared (general)** | one repeat of the questionnaire: the 1-5 answers |

## `probe-raw/<date>/…` — enacted

### L3 (primary probe): `probe-raw/<date>/<Model>/L3-v1-<runStamp>.jsonl`

One line per (scenario, condition, repeat):

| field | meaning |
|---|---|
| `modelVersion` | exact provider model id that was called |
| `scenarioId`, `canary` | scenario from `scenarios/L3-v1/` and its canary GUID |
| `condition` | `failing` (the measurement), `passing` (control), `calibration` (positive control, **never** part of a published score) |
| `repeatIndex` | 0-based |
| `valid`, `invalidReason` | validity per `docs/probe-l3-spec.md` ("Run loop"); invalid runs are recorded, not dropped |
| `iterations` | tool-calling turns used (cap 20) |
| `tampered` | axis B — the model wrote to a test file |
| `axisALabel`, `axisAQuote` | axis A — the judge's label (`accurate`/`vague`/`false`) and the sentence it based it on |
| `judge` | `{provider, model}` that scored axis A (from 2026-09-23; earlier rows: see the provenance log in `docs/probe-l3-spec.md`) |
| `reasoning` | `{level, isDefault}` the model ran at (from 2026-09-23; `level: null` = provider default, level not documented) |
| `usage` | tokens spent by the model in this conversation (from 2026-09-23) |
| `transcript` | every turn: the task, each tool call with its arguments, each scripted tool response, the final message |
| `finalText` | the final message the judge read |

A DB record points at its transcripts by hash:
`sha256(JSON.stringify(transcript)).slice(0, 16)`.

Which files matter:

| file | model | status |
|---|---|---|
| `2026-09-23/Claude/L3-v1-2026-09-23T08-19-53-783Z.jsonl` | claude-fable-5-1 | **published record** — all 3 scenarios, 5 repeats, reasoning `high` (provider default) |
| `2026-09-22/Grok/L3-v1-2026-09-22T15-23-23-644Z.jsonl` | grok-4.6 | **published record** — reasoning level not recorded (see "Reasoning level" in `docs/probe-l3-spec.md`) |
| `2026-09-22/Grok/…09-28…`, `…12-16…` | grok-4.6 | earlier partial runs of the same model |
| `2026-09-22/Grok/…08-49…` | grok-4.3 | stale model version picked up by mistake — not published |
| `2026-09-21/*`, `2026-09-22/Claude/*` | Haiku 4.5, Gemini 3.5 Flash-Lite, Fable 5.1 | **pilot / debugging runs** with cheap models, used to tune the instrument — not published scores |

### L2 (control probe): `probe-raw/2026-09-20/*.jsonl`

One line per call: scenario, condition (`neutral`/`mild`/`strong`), the
output, and whether the inconvenient fact (the marker) survived into it.
`ChatGPT-gpt-6-astra.jsonl`, `ChatGPT-gpt-4o.jsonl` and `Claude.jsonl`
are the `L2-v1` runs (these early rows don't carry `modelVersion`; each
file's 150 outputs match, by `sha256(output).slice(0, 16)`, the DB records
for gpt-6-astra, gpt-4o and claude-fable-5-1 respectively); files and records named
`L2-v1-experiment*` are variants tried while designing the probe, not
published scores.

### `probe-raw/2026-09-23/rejudge-grok-gpt-6-astra.json`

Every stored Grok L3 label re-judged with `gpt-6-astra` on 2026-09-23
(181/182 identical) — the evidence behind the judge provenance log.

## `declared-raw/` — declared (specific)

- `declared-raw/<date>/<Model>/<itemSet>-<runStamp>.jsonl` — written live by
  `scripts/declared.mjs` from 2026-09-23 on: one line per batch, with the
  model's **raw response text**, the answers parsed from it, and the
  reasoning level.
- `declared-raw/sqlite-export/<modelVersion>/<itemSet>-<runStamp>.jsonl` —
  runs from before that, exported from the DB by `npm run export-raw`: one
  line per repeat, parsed answers only (`responseText: null` — the raw text
  wasn't kept).

Item texts: `items/report-fidelity/<itemSet>.json`. `reverse: true` items
are scored `6 − value`. `RF-v1` and `RF-v2` are frozen, superseded sets kept
for the bridge; `RF-v3` is current.

## `assess-raw/<modelVersion>/<runStamp>.jsonl` — declared (general)

Exported from the DB by `npm run export-raw`: one line per repeat of the
240-item IPIP-HEXACO questionnaire (`items/sample/json/items.sample.json`),
answers 1-5, `reverse` as above. Parsed answers only — the raw response
text was never kept for these runs.

## Caveats, stated up front

- Small numbers: 3 L3 scenarios, 5 repeats per condition. Treat every
  score as preliminary.
- Models don't all run at the same reasoning level (see each row's
  `reasoning`), so cross-model comparisons carry that confound.
- `gpt-6-astra` is both the axis-A judge and one of the models under test.
