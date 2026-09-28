// Descriptive only: how long each model keeps trying on L3, next to what it
// declares about its own conscientiousness. docs/axis-map.md E8 (persistence),
// E9 (stopping) and D4 (declared C facets vs. E8/E9). No model is called and
// nothing is written — it reads data/records/ and data/probe-raw/ and prints
// markdown tables.
//
// Usage: node scripts/tenacity-l3.mjs
//
// Runs: the ones the cards show — per model_version, the latest complete
// L3-v1 record under the published rubric — located by transcript hash, the
// way scripts/rebuild-db.mjs checks them, so a record assembled from several
// raw files is still found whole. Declared facets: the latest assess run of
// the same model_version, from its per-item answers.
//
// Not a score, and not on the cards (axis-map, "Keep descriptive"). On L3-v1
// every `failing`/`calibration` task is impossible by design and scenario 001
// ignores even a correct fix (axis-map I5): here persistence mostly means not
// stopping, and it needs a solvable-but-hard scenario before it can mean
// diligence.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import initSqlJs from "sql.js";
import { hashTranscript } from "../lib/l3Aggregate.mjs";
import { loadL3Scenarios } from "../lib/l3Scenarios.mjs";
import { PROBE_L3_SET_VERSION, PUBLISHED_L3_RUBRIC, isCompleteL3Run } from "../lib/probeL3Config.mjs";

const readJsonl = (f) =>
  readFileSync(f, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const fmt = (x, digits = 1) => (Number.isNaN(x) ? "–" : x.toFixed(digits));
const pct = (x) => (Number.isNaN(x) ? "–" : `${Math.round(100 * x)}%`);

// One run's effort, from its transcript.
function effort(transcript, testFilePaths) {
  const calls = transcript.filter((t) => t.role === "tool");
  const writes = calls.filter((c) => c.name === "write_file");
  return {
    turns: transcript.filter((t) => t.role === "assistant").length,
    runTests: calls.filter((c) => c.name === "run_tests").length,
    srcWrites: writes.filter((c) => !testFilePaths.includes(c.args?.path)).length,
    testWrites: writes.filter((c) => testFilePaths.includes(c.args?.path)).length,
  };
}

async function declaredFacets(modelVersion) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync("data/psychochat.sqlite"));
  try {
    const latest = db.exec(`SELECT max(assessed_at) FROM assessment_item_repeats WHERE model_version = ?`, [modelVersion])[0]?.values[0][0];
    if (!latest) return {};
    const items = Object.fromEntries(JSON.parse(readFileSync("items/sample/json/items.sample.json", "utf8")).items.map((i) => [i.id, i]));
    const byFacet = {};
    for (const [q, v] of db.exec(`SELECT question_id, value FROM assessment_item_repeats WHERE model_version = ? AND assessed_at = ?`, [modelVersion, latest])[0].values) {
      const it = items[q];
      if (it.domain !== "C") continue;
      (byFacet[it.facet] ??= []).push((((it.reverse ? 6 - v : v) - 1) / 4) * 100);
    }
    return Object.fromEntries(Object.entries(byFacet).map(([f, a]) => [f, mean(a)]));
  } finally {
    db.close();
  }
}

async function main() {
  const scenarios = Object.fromEntries((await loadL3Scenarios(PROBE_L3_SET_VERSION)).map((s) => [s.id, s]));
  const testPaths = (scenarioId, condition) => (condition === "passing" ? scenarios[scenarioId].passing : scenarios[scenarioId].failing).testFilePaths;

  // The record each card shows.
  const shown = new Map();
  for (const r of readJsonl("data/records/probe_l3_runs.jsonl")) {
    if (r.probe_id !== PROBE_L3_SET_VERSION || r.judge_rubric !== PUBLISHED_L3_RUBRIC) continue;
    const prev = shown.get(r.model_version);
    if (!prev || r.assessed_at > prev.assessed_at) shown.set(r.model_version, r);
  }
  const records = [...shown.values()].filter((r) => isCompleteL3Run(r.probe_id, r.scenario_count)).sort((a, b) => a.model_version.localeCompare(b.model_version));

  const transcriptsByHash = new Map();
  for (const f of walk("data/probe-raw").filter((f) => f.endsWith(".jsonl") && !f.includes(".judge-batch"))) {
    for (const row of readJsonl(f)) if (row.transcript) transcriptsByHash.set(hashTranscript(row.transcript), row.transcript);
  }
  const calls = readJsonl("data/records/probe_l3_call_repeats.jsonl");

  const perModel = [];
  for (const rec of records) {
    const runs = calls
      .filter((c) => c.model_version === rec.model_version && c.assessed_at === rec.assessed_at && c.probe_id === rec.probe_id)
      .map((c) => {
        const transcript = transcriptsByHash.get(c.transcript_hash);
        if (!transcript) throw new Error(`${rec.model_version}: transcript ${c.transcript_hash} not in data/probe-raw/`);
        return { scenario: c.scenario_id, condition: c.condition, cap: c.invalid_reason === "iteration_cap", ...effort(transcript, testPaths(c.scenario_id, c.condition)) };
      });
    perModel.push({ rec, runs, facets: await declaredFacets(rec.model_version) });
  }

  const impossible = (r) => r.condition !== "passing";
  console.log(`### E8/E9 — effort on the impossible conditions (failing + calibration), L3-v1, the runs on the cards\n`);
  console.log("| model | reasoning | runs | turns | run_tests | src rewrites | test-file writes | hit the 20-turn cap | turns when solvable (passing) |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const { rec, runs } of perModel) {
    const imp = runs.filter(impossible);
    const pass = runs.filter((r) => !impossible(r));
    console.log(
      `| ${rec.model_version} | ${rec.reasoning_level ?? "–"} | ${imp.length} | ${fmt(mean(imp.map((r) => r.turns)))} | ${fmt(mean(imp.map((r) => r.runTests)))} | ${fmt(mean(imp.map((r) => r.srcWrites)))} | ${fmt(mean(imp.map((r) => r.testWrites)))} | ${pct(mean(imp.map((r) => (r.cap ? 1 : 0))))} | ${fmt(mean(pass.map((r) => r.turns)))} |`
    );
  }

  const ids = Object.keys(scenarios).sort();
  console.log(`\n### Cap rate by scenario (failing + calibration)\n`);
  console.log(`| model | ${ids.join(" | ")} |`);
  console.log(`|---|${ids.map(() => "---").join("|")}|`);
  for (const { rec, runs } of perModel) {
    console.log(`| ${rec.model_version} | ${ids.map((id) => pct(mean(runs.filter((r) => r.scenario === id && impossible(r)).map((r) => (r.cap ? 1 : 0))))).join(" | ")} |`);
  }

  console.log(`\n### D4 — declared C facets (generic HEXACO, 0–100) next to enacted effort\n`);
  console.log("| model | Diligence | Prudence | Organization | Perfectionism | src rewrites | cap rate |");
  console.log("|---|---|---|---|---|---|---|");
  for (const { rec, runs, facets } of perModel) {
    const imp = runs.filter(impossible);
    console.log(
      `| ${rec.model_version} | ${fmt(facets.Diligence ?? NaN, 0)} | ${fmt(facets.Prudence ?? NaN, 0)} | ${fmt(facets.Organization ?? NaN, 0)} | ${fmt(facets.Perfectionism ?? NaN, 0)} | ${fmt(mean(imp.map((r) => r.srcWrites)))} | ${pct(mean(imp.map((r) => (r.cap ? 1 : 0))))} |`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
