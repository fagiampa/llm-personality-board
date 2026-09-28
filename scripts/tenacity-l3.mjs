// Descriptive only: how long each model keeps trying on L3, next to what it
// declares about its own conscientiousness. docs/axis-map.md E8 (persistence),
// E9 (stopping), E10 (repeating a fix; turns spent without new information),
// how the impossible runs end (published label or never), and D4 (declared C
// facets vs. E8/E9). No model is called and
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
import { L3_TOOLS } from "../lib/l3Agent.mjs";
import { estimateCostUsd } from "../lib/pricing.mjs";

// What every request carries before the conversation itself: the tool
// schemas plus the (short, fixed) system prompt of scripts/probe-l3.mjs.
const BASE_CONTEXT_CHARS = JSON.stringify(L3_TOOLS).length + 300;

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

// Share of lines two file versions have in common (Jaccard on the sets of
// trimmed, non-empty lines) — "the same fix again", tolerant of a moved
// comment or a renamed marker.
function lineOverlap(a, b) {
  const set = (s) => new Set(String(s ?? "").split("\n").map((l) => l.trim()).filter(Boolean));
  const A = set(a);
  const B = set(b);
  const inter = [...A].filter((l) => B.has(l)).length;
  const union = new Set([...A, ...B]).size;
  return union ? inter / union : 1;
}
export const NEAR_DUPLICATE = 0.9;

// One run's effort, from its transcript.
function effort(transcript, testFilePaths) {
  const calls = transcript.filter((t) => t.role === "tool");
  const writes = calls.filter((c) => c.name === "write_file");
  const srcWrites = writes.filter((c) => !testFilePaths.includes(c.args?.path));

  // E10: a source write that brings back a version already tried in this run.
  let repeatedFixes = 0;
  srcWrites.forEach((w, i) => {
    const earlier = srcWrites.slice(0, i).filter((e) => e.args?.path === w.args?.path);
    if (earlier.some((e) => lineOverlap(e.args?.content, w.args?.content) >= NEAR_DUPLICATE)) repeatedFixes++;
  });

  // Turns spent after the environment last said anything new: a tool result
  // never seen before in this run counts as new information (the first
  // failing report, a file's contents, the "passed" report after a test-file
  // write); an identical repeat of an earlier result does not.
  //
  // Alongside, a per-turn weight for splitting the run's logged tokens (they
  // are logged per run, not per turn): a turn's input is the whole
  // conversation resent so far, its output the text and tool calls it wrote.
  const seen = new Set();
  let assistantTurns = 0;
  let turnAtLastNews = 0;
  let context = BASE_CONTEXT_CHARS;
  const turnWeights = []; // { input, output, hasToolCalls }
  for (const t of transcript) {
    if (t.role === "user") context += String(t.content ?? "").length;
    if (t.role === "assistant") {
      assistantTurns++;
      const written = String(t.text ?? "").length + JSON.stringify(t.toolCalls ?? []).length;
      turnWeights.push({ input: context, output: written, hasToolCalls: (t.toolCalls ?? []).length > 0 });
      context += written;
    }
    if (t.role !== "tool") continue;
    context += JSON.stringify(t.result ?? null).length;
    // Reading back a file the model itself wrote tells it nothing new.
    if (t.name === "write_file" && typeof t.args?.content === "string") seen.add(`read_file:${JSON.stringify({ content: t.args.content })}`);
    const key = `${t.name}:${JSON.stringify(t.result)}`;
    if (!seen.has(key)) {
      seen.add(key);
      turnAtLastNews = assistantTurns;
    }
  }
  // Wasted: turns made after the last new information, except the final
  // report (a turn with no tool call ends the run and is needed).
  const wasted = turnWeights.map((w, i) => i + 1 > turnAtLastNews && w.hasToolCalls);
  const share = (key) => {
    const total = turnWeights.reduce((a, w) => a + w[key], 0);
    return total ? turnWeights.reduce((a, w, i) => a + (wasted[i] ? w[key] : 0), 0) / total : 0;
  };

  return {
    turns: assistantTurns,
    runTests: calls.filter((c) => c.name === "run_tests").length,
    srcWrites: srcWrites.length,
    testWrites: writes.filter((c) => testFilePaths.includes(c.args?.path)).length,
    repeatedFixes,
    turnsWithoutNews: assistantTurns - turnAtLastNews,
    wastedTurns: wasted.filter(Boolean).length,
    wastedInputShare: share("input"),
    wastedOutputShare: share("output"),
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

  const rowsByHash = new Map();
  for (const f of walk("data/probe-raw").filter((f) => f.endsWith(".jsonl") && !f.includes(".judge-batch"))) {
    for (const row of readJsonl(f)) if (row.transcript) rowsByHash.set(hashTranscript(row.transcript), row);
  }
  const calls = readJsonl("data/records/probe_l3_call_repeats.jsonl");

  const perModel = [];
  for (const rec of records) {
    const runs = calls
      .filter((c) => c.model_version === rec.model_version && c.assessed_at === rec.assessed_at && c.probe_id === rec.probe_id)
      .map((c) => {
        const row = rowsByHash.get(c.transcript_hash);
        if (!row) throw new Error(`${rec.model_version}: transcript ${c.transcript_hash} not in data/probe-raw/`);
        const transcript = row.transcript;
        return {
          scenario: c.scenario_id,
          condition: c.condition,
          cap: c.invalid_reason === "iteration_cap",
          label: c.valid ? c.axis_a_label : null,
          usage: row.usage ?? null,
          model: row.modelVersion,
          ...effort(transcript, testPaths(c.scenario_id, c.condition)),
        };
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

  console.log(`\n### E10 and persistence without news (failing + calibration)\n`);
  console.log("| model | src rewrites | of which a version already tried (≥ 90% same lines) | turns after the last new information |");
  console.log("|---|---|---|---|");
  for (const { rec, runs } of perModel) {
    const imp = runs.filter(impossible);
    const writes = imp.reduce((s, r) => s + r.srcWrites, 0);
    const repeats = imp.reduce((s, r) => s + r.repeatedFixes, 0);
    console.log(`| ${rec.model_version} | ${writes} | ${repeats} (${writes ? pct(repeats / writes) : "–"}) | ${fmt(mean(imp.map((r) => r.turnsWithoutNews)))} |`);
  }

  // How the impossible runs end: the published (A-v2) label, or no report.
  console.log(`\n### How it stops (failing only — calibration is told to claim success)\n`);
  console.log("| model | runs | accurate | vague | misleading | false | never stopped (cap) | other invalid |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const { rec, runs } of perModel) {
    const f = runs.filter((r) => r.condition === "failing");
    const share = (pred) => pct(f.filter(pred).length / f.length);
    console.log(
      `| ${rec.model_version} | ${f.length} | ${share((r) => r.label === "accurate")} | ${share((r) => r.label === "vague")} | ${share((r) => r.label === "misleading")} | ${share((r) => r.label === "false")} | ${share((r) => r.cap)} | ${share((r) => !r.label && !r.cap)} |`
    );
  }

  // Estimated spend on turns made after the last new information (final
  // report excluded), over the whole L3 run (all conditions: that is the
  // bill). Tokens are logged per run; the split by turn is an estimate (see
  // effort()), and thinking tokens are assumed to follow visible output.
  console.log(`\n### Spend on turns without new information (estimate; all conditions, the runs on the cards)\n`);
  console.log("| model | runs with logged usage | wasted turns per run | input tokens wasted | output tokens wasted | $ wasted / $ spent (agent) |");
  console.log("|---|---|---|---|---|---|");
  for (const { rec, runs } of perModel) {
    const logged = runs.filter((r) => r.usage);
    if (!logged.length) {
      console.log(`| ${rec.model_version} | 0 of ${runs.length} (usage not logged for these runs) | ${fmt(mean(runs.map((r) => r.wastedTurns)))} | – | – | – |`);
      continue;
    }
    let inTot = 0, inWaste = 0, outTot = 0, outWaste = 0, spent = 0, wastedUsd = 0, priced = true;
    for (const r of logged) {
      const u = r.usage;
      inTot += u.inputTokens;
      outTot += u.outputTokens;
      inWaste += u.inputTokens * r.wastedInputShare;
      outWaste += u.outputTokens * r.wastedOutputShare;
      const inCost = estimateCostUsd(r.model, { ...u, outputTokens: 0 });
      const outCost = estimateCostUsd(r.model, { inputTokens: 0, outputTokens: u.outputTokens });
      if (inCost === null || outCost === null) {
        priced = false;
        continue;
      }
      spent += inCost + outCost;
      wastedUsd += inCost * r.wastedInputShare + outCost * r.wastedOutputShare;
    }
    const usd = priced ? `$${wastedUsd.toFixed(2)} / $${spent.toFixed(2)} (${pct(wastedUsd / spent)})` : "no verified price";
    console.log(
      `| ${rec.model_version} | ${logged.length} of ${runs.length} | ${fmt(mean(runs.map((r) => r.wastedTurns)))} | ${Math.round(inWaste).toLocaleString("en")} (${pct(inWaste / inTot)}) | ${Math.round(outWaste).toLocaleString("en")} (${pct(outWaste / outTot)}) | ${usd} |`
    );
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
