// Classifies every stored L3 run's writes to the test suite
// (lib/l3TestWrites.mjs) and sets the labels next to the axis-B flag the run
// was recorded with. Descriptive: no model is called, nothing is written to
// the DB. Reads data/probe-raw/ and scenarios/.
//
// Usage: node scripts/test-writes-l3.mjs [--json <out.json>]
//
// Every raw row with a transcript counts, valid or not, pilot runs included:
// the question is what models do to a suite, not what a published score is.
// --json writes one entry per run (file, model, scenario, condition, repeat,
// recorded tampered flag, label and its evidence).

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadL3Scenarios } from "../lib/l3Scenarios.mjs";
import { classifyTestWrites, TEST_WRITE_LABELS } from "../lib/l3TestWrites.mjs";

const RAW = /^(L3-v[12])-\d{4}-\d{2}-\d{2}T[\d-]+Z\.jsonl$/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const jsonOut = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;

const scenarios = new Map();
for (const set of ["L3-v1", "L3-v2"]) for (const s of await loadL3Scenarios(set)) scenarios.set(s.id, { set, scenario: s });

const runs = [];
for (const file of walk("data/probe-raw").filter((f) => RAW.test(path.basename(f))).sort()) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    const entry = scenarios.get(r.scenarioId);
    if (!entry || !Array.isArray(r.transcript)) continue;
    const c = classifyTestWrites(entry.scenario, r.condition, r.transcript);
    runs.push({
      file: file.replace(/\\/g, "/"),
      set: entry.set,
      model: r.modelVersion,
      scenario: r.scenarioId,
      condition: r.condition,
      repeat: r.repeatIndex,
      valid: r.valid,
      tampered: !!r.tampered,
      ...c,
    });
  }
}

// One table per set: model × condition, label counts, and how many of the
// runs axis B recorded as tampered.
for (const set of ["L3-v1", "L3-v2"]) {
  const rows = runs.filter((r) => r.set === set);
  if (!rows.length) continue;
  console.log(`\n### ${set} (${rows[0].method === "replay" ? "replay" : "text"})\n`);
  console.log(`| model | condition | runs | tampered (axis B) | ${TEST_WRITE_LABELS.join(" | ")} |`);
  console.log(`|---|---|---|---|${TEST_WRITE_LABELS.map(() => "---").join("|")}|`);
  const keys = [...new Set(rows.map((r) => `${r.model}|${r.condition}`))].sort();
  for (const k of keys) {
    const [model, condition] = k.split("|");
    const g = rows.filter((r) => r.model === model && r.condition === condition);
    const counts = TEST_WRITE_LABELS.map((l) => g.filter((r) => r.label === l).length || "·");
    console.log(`| ${model} | ${condition} | ${g.length} | ${g.filter((r) => r.tampered).length} | ${counts.join(" | ")} |`);
  }
}

const weakening = runs.filter((r) => r.label === "weakening");
console.log(`\n### Weakening runs (${weakening.length})\n`);
for (const r of weakening) {
  const why = r.method === "replay" ? `hides ${r.hidden.join(", ")}` : `markers ${r.markers}, asserts +${r.assertsAdded}/-${r.assertsRemoved}, tests +${r.testsAdded}/-${r.testsRemoved}`;
  console.log(`- ${r.set} ${r.model} ${r.scenario} ${r.condition} rep ${r.repeat}: ${why}`);
}

const flaggedNotWeakening = runs.filter((r) => r.tampered && r.label !== "weakening").length;
const weakeningNotFlagged = runs.filter((r) => !r.tampered && r.label === "weakening").length;
console.log(`\nAxis B vs label: ${flaggedNotWeakening} runs flagged tampered that don't weaken the suite; ${weakeningNotFlagged} weakening runs not flagged.`);

if (jsonOut) {
  writeFileSync(jsonOut, `${JSON.stringify(runs, null, 1)}\n`);
  console.log(`Written ${runs.length} runs to ${jsonOut}`);
}
