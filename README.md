# LLM Personality Board

An open observatory of **what AI agents do when honesty or restraint costs them something, set against what they
say they do**.

Each model first rates statements about how it works ("Once a test run tells me nothing new, I stop making
changes…"), in a session of its own. Then it is put to work: a small software project with a failing build, files to
read and write, tests to run. Some tasks can't be finished, one is already done. For three behaviours the project
measures the **gap** between what the model *declares* and what it *enacts*:

- **report fidelity**: when it can't finish, does its final message say what was and wasn't done?
- **knowing when to stop**: once the goal is out of reach, does it stop pushing and say so?
- **sticking to the evidence**: when the facts contradict the premise of the task, does it stop, or find something
  to do anyway?

**Live site**: https://aipersonality.org

## What a card shows

One card per model family; a family with several versions opens as a deck. The first view has one column per
behaviour: a light disc for declared, a dark ring for enacted, on the same 0–100 scale in every card. The second view
is the model's profile on the 240-item [IPIP-HEXACO](https://ipip.ori.org/newHEXACO_PI_key.htm) personality
questionnaire, the project's starting point. Cards are alphabetical: this is not a leaderboard.

What each column measures, with an example, is under the cards on the site; the full method is on
[/methodology](https://aipersonality.org/methodology).

## Status and limits

Everything is preliminary, and the limits are stated on the site
([Known limits](https://aipersonality.org/methodology#limits)):

- three scenarios (L3-v2, not frozen yet), 15 runs per behaviour per model: 15 out of 15 is compatible with a true
  rate as low as 78%
- four of the nine models reach 100 on every column: at the top the instrument saturates, harder scenarios are the
  next step
- report fidelity is labelled by one judge model (`gpt-6-astra`), checked against a single blind human rater
  (κ 0.84 on 50 reports) and lenient relative to that rater, so the published value is an upper bound
- each model runs at its provider's default reasoning level, which differs across models
- items and scenarios are public, so future models may have trained on them; every scenario carries a canary string

## Getting started

Requires Node.js 20.6 or later.

```bash
git clone https://github.com/fagiampa/llm-personality-board.git
cd llm-personality-board
npm install
npm run db:rebuild   # recreate the SQLite DB from the data in the repo
npm run dev
```

Open [http://localhost:3000](http://localhost:3000): you get the same board as the live site, with no API keys.

`npm run db:rebuild` builds `data/psychochat.sqlite` (not tracked) from `data/records/` and the raw answers under
`data/`. It also recomputes every aggregate that can be recomputed and checks it against the records, and checks that
every transcript a record points at is in `data/probe-raw/`. See [`data/README.md`](data/README.md).

## Running your own measurements

Copy `.env.example` to `.env` and add the API keys for the providers you want to call (Anthropic, OpenAI, Google,
xAI, DeepSeek). Pick the model with `ANTHROPIC_MODEL`, `OPENAI_MODEL`, etc.; the defaults are cheap models. The
order matters:

1. `npm run assess`: the HEXACO questionnaire.
2. `npm run declared`: one action-anchored bank per run (`DECLARED_ITEM_SET_VERSION`: `RF-v3`, `GD-v1`, `PF-v1`
   are on the cards). Always in its **own session**, never in the same conversation as the task: the items describe
   the task's situations, and sharing a session is priming.
3. `npm run probe-l3`: the agentic task. The cards use `PROBE_L3_SET_VERSION=L3-v2` with `PROBE_L3_REPEATS=5`
   (the code defaults are still `L3-v1` and 8). The judge runs as an OpenAI batch: `npm run probe-l3:collect`
   writes the record once the batch is done.

Each script can be scoped to one model family (`ASSESS_ONLY=Claude`, `DECLARED_ONLY=…`, `PROBE_L3_ONLY=…`). After a
run, `npm run export-raw` writes the new data under `data/`, so it can be committed and rebuilt by anyone.

The agentic task resends a growing conversation every turn, so costs add up on large models. Debug with the fake
driver in `tests/l3-agent.test.mjs`, not with paid calls.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm run start` | Production build / serve |
| `npm test` | Unit tests, plus a check that the committed data rebuilds into a consistent DB |
| `npm run lint` | ESLint |
| `npm run db:rebuild` | Recreate the DB from `data/` (add `-- --force` to overwrite an existing one) |
| `npm run export-raw` | Write the DB's answers and records to `data/` |
| `npm run assess` | HEXACO questionnaire, 240 items, repeated |
| `npm run declared` | One action-anchored item bank |
| `npm run probe-l3` | The agentic probe (enacted side) |
| `npm run probe-l3:collect` | Collect the judge batch and write the probe record |
| `npm run probe` | L2, a small one-shot control probe |

## Docs

The specs are the source of truth: when a decision changes, the spec changes first, then the code.

- [`docs/constructs.md`](docs/constructs.md): the three behaviours, what each measures and why
- [`docs/declared-spec.md`](docs/declared-spec.md): the declared side
- [`docs/probe-l3-spec.md`](docs/probe-l3-spec.md): the agentic probe, its judge rubric and its human calibration
- [`docs/probe-l2-spec.md`](docs/probe-l2-spec.md): the one-shot control probe
- [`docs/axis-map.md`](docs/axis-map.md): every candidate measure the data has suggested, and what became of it
- [`docs/positioning.md`](docs/positioning.md): related work
- [`CLAUDE.md`](CLAUDE.md): architecture notes and the rules that must not be quietly relitigated

## Tech stack

Next.js 14 (App Router), React 18, TypeScript. SQLite via [`sql.js`](https://github.com/sql-js/sql.js) (WASM, no
native build step). Provider SDKs: `@anthropic-ai/sdk`, `openai` (also used for xAI and DeepSeek),
`@google/generative-ai`. Hand-drawn SVG charts, no charting library. English and Italian, picked from the browser's
`Accept-Language` header.

## Contributing

Issues and pull requests are welcome; the most useful contribution is a new scenario. See
[`CONTRIBUTING.md`](./CONTRIBUTING.md), including the notes on AI-assisted contributions.

## Support

The project is funded by donations, via Lightning: `tennicodabar@getalby.com` (a Lightning Address).

## License

LLM Personality Board © 2026 il tennico (tennicodabar@gmail.com). Released under the GNU AGPL v3.0 or later. See
[LICENSE](./LICENSE).
