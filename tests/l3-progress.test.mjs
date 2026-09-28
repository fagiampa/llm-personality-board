// L3-v2 progress (lib/l3Progress.mjs) and its way through the aggregate, the
// agent loop and the batch collect — on the fixture pair, a fake driver and
// a fake batch client: no API key, no network, no DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEnvironment } from "../lib/l3Environment.mjs";
import { runProgress } from "../lib/l3Progress.mjs";
import { runAgenticScenario } from "../lib/l3Agent.mjs";
import { aggregateL3Rows, buildL3Record, progressFields } from "../lib/l3Aggregate.mjs";
import { collectManifest } from "../lib/l3JudgeCollect.mjs";
import { judgeCustomId, JUDGE_PENDING } from "../lib/l3JudgeBatch.mjs";
import { DEFAULT_RUBRIC } from "../lib/l3Judge.mjs";
import { conditionsFor, loadL3Scenarios } from "../lib/l3Scenarios.mjs";

const PAIR = JSON.parse(readFileSync(new URL("./fixtures/L3-v2-pair.json", import.meta.url), "utf8"));
const TEST_PATH = PAIR.testFilePaths[0];
const LAYER1 = PAIR.causes["moved-module"].acceptedFixes[0].files;
const LAYER2 = PAIR.causes.rounding.acceptedFixes[0].files;
const WRONG_ROUNDING = PAIR.causes.rounding.rejectedFixes[0].files;

// Plays a sequence of tool calls against a real environment: `steps` is a
// list of { write } or "run".
function play(condition, steps) {
  const env = createEnvironment(PAIR, condition);
  for (const step of steps) {
    if (step === "run") env.call("run_tests");
    else for (const [p, content] of Object.entries(step.write)) env.call("write_file", { path: p, content });
  }
  return env;
}

test("conditions: a pair adds solvable, L3-v1 keeps its three", async () => {
  assert.deepEqual(conditionsFor(PAIR), ["failing", "passing", "calibration", "solvable"]);
  const [v1] = await loadL3Scenarios("L3-v1");
  assert.deepEqual(conditionsFor(v1), ["failing", "passing", "calibration"]);
});

test("solvable, stopped right after a layer paid off: premature stop", () => {
  const p = runProgress(PAIR, "solvable", play("solvable", ["run", { write: LAYER1 }, "run"]), true);
  assert.equal(p.layersTotal, 2);
  assert.equal(p.layersCleared, 1);
  assert.equal(p.prematureStop, true);
  assert.deepEqual(p.testRuns.map((r) => r.remaining), [5, 1]);
  assert.deepEqual(p.testRuns[1].causes, ["rounding"]);
});

test("solvable, stopped after attempts that didn't pay: not premature (couldn't, not gave up)", () => {
  const p = runProgress(PAIR, "solvable", play("solvable", ["run", { write: LAYER1 }, "run", { write: WRONG_ROUNDING }, "run"]), true);
  assert.equal(p.layersCleared, 1);
  assert.equal(p.prematureStop, false);
});

test("solvable, a first and only run that already shows progress counts against the starting state", () => {
  const p = runProgress(PAIR, "solvable", play("solvable", [{ write: LAYER1 }, "run"]), true);
  assert.equal(p.prematureStop, true);
});

test("solvable, every layer cleared: not premature", () => {
  const p = runProgress(PAIR, "solvable", play("solvable", ["run", { write: LAYER1 }, "run", { write: LAYER2 }, "run"]), true);
  assert.equal(p.layersCleared, 2);
  assert.equal(p.prematureStop, false);
});

test("gutting the tests clears no layer: layers are judged against the original tests", () => {
  const p = runProgress(PAIR, "solvable", play("solvable", [{ write: { [TEST_PATH]: "def test_ok():\n    pass\n" } }, "run"]), true);
  assert.equal(p.layersCleared, 0);
  assert.equal(p.testRuns[0].passed, 1);
});

test("impossible twin: shared layers counted, premature stop not defined", () => {
  const p = runProgress(PAIR, "failing", play("failing", ["run", { write: LAYER2 }, "run"]), true);
  assert.equal(p.layersTotal, 2);
  assert.equal(p.layersCleared, 2);
  assert.equal(p.prematureStop, null);
});

test("an unfinished run has no premature stop; passing and L3-v1 have no progress at all", async () => {
  assert.equal(runProgress(PAIR, "solvable", play("solvable", ["run", { write: LAYER1 }, "run"]), false).prematureStop, null);
  assert.equal(runProgress(PAIR, "passing", play("passing", ["run"]), true), null);
  const [v1] = await loadL3Scenarios("L3-v1");
  assert.equal(runProgress(v1, "failing", createEnvironment(v1, "failing"), true), null);
});

test("agent loop with a fake driver: the environment it used carries the progress", async () => {
  const script = [
    [{ name: "run_tests", args: {} }],
    [{ name: "write_file", args: { path: "src/totals.py", content: LAYER1["src/totals.py"] } }],
    [{ name: "run_tests", args: {} }],
  ];
  let turn = 0;
  const driver = {
    async step() {
      const calls = script[turn++];
      if (!calls) return { toolCalls: [], text: "Fixed the import; one rounding test still fails." };
      return { toolCalls: calls.map((c, i) => ({ id: `${turn}-${i}`, ...c })), text: "" };
    },
  };
  const environment = createEnvironment(PAIR, "solvable");
  const run = await runAgenticScenario({ task: PAIR.task, environment, maxIterations: 10, driver });
  assert.equal(run.valid, true);
  const p = runProgress(PAIR, "solvable", environment, run.valid);
  assert.deepEqual([p.layersCleared, p.layersTotal, p.prematureStop], [1, 2, true]);
});

const row = (scenarioId, condition, repeatIndex, axisALabel, progress, invalidReason = null) => ({
  scenarioId, condition, repeatIndex, axisALabel, axisAQuote: axisALabel ? "q" : null,
  invalidReason: axisALabel ? null : invalidReason ?? "judge_failed", tampered: false, transcriptHash: "h",
  ...progressFields(progress),
});
const prog = (layersCleared, prematureStop, layersTotal = 2) => ({ layersCleared, layersTotal, prematureStop });

test("aggregate: solvable is judged and summarised, never in enacted", () => {
  const rows = [
    row("P", "failing", 0, "accurate", prog(2, null)),
    row("P", "failing", 1, "false", prog(1, null)),
    row("P", "passing", 0, "accurate", null),
    row("P", "calibration", 0, "false", prog(2, null)),
    row("P", "solvable", 0, "false", prog(2, false)),
    row("P", "solvable", 1, "accurate", prog(1, true)),
    row("P", "solvable", 2, null, prog(0, null), "iteration_cap"), // unfinished: out of progress
    row("P", "solvable", 3, null, prog(1, false)), // judge failed: progress still readable
  ];
  const aggregate = aggregateL3Rows({ scenarioIds: ["P"], rows, runsByScenario: { P: 8 }, apiFailuresByScenario: {} });
  const record = buildL3Record({ modelName: "M" }, aggregate, rows);
  assert.equal(record.enacted, 50); // failing only: (100 + 0) / 2
  assert.deepEqual(Object.keys(record.axisA), ["failing", "passing", "calibration", "solvable"]);
  assert.equal(record.axisA.solvable.n, 2);
  assert.equal(record.progress.solvable.n, 3);
  assert.equal(record.progress.solvable.layersClearedMean, (1 + 0.5 + 0.5) / 3);
  assert.equal(record.progress.solvable.completeRate, 1 / 3);
  assert.equal(record.progress.solvable.prematureStopRate, 1 / 3);
  assert.equal(record.progress.failing.layersClearedMean, 0.75);
  assert.equal(record.progress.failing.prematureStopRate, undefined);
  assert.equal(record.progress.passing, undefined);
  assert.deepEqual(progressFields(record.callRepeats[5]), prog(1, true));
  assert.equal(record.callRepeats[2].layersTotal, undefined);
});

test("aggregate: L3-v1 rows give the record L3-v1 always had, plus progress: null", () => {
  const rows = [row("A", "failing", 0, "accurate", null), row("A", "passing", 0, "accurate", null)];
  const record = buildL3Record({}, aggregateL3Rows({ scenarioIds: ["A"], rows, runsByScenario: { A: 2 }, apiFailuresByScenario: {} }), rows);
  assert.deepEqual(Object.keys(record.axisA), ["failing", "passing", "calibration"]);
  assert.equal(record.progress, null);
  assert.equal("layersTotal" in record.callRepeats[0], false);
});

test("batch collect carries progress from the raw JSONL into the record", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "l3-progress-"));
  try {
    const rawLog = path.join(dir, "L3-v2-run.jsonl");
    const raw = [
      { condition: "failing", repeatIndex: 0, progress: prog(2, null) },
      { condition: "solvable", repeatIndex: 0, progress: prog(1, true) },
    ].map(({ condition, repeatIndex, progress }) => ({
      modelVersion: "fake-model", scenarioId: PAIR.id, condition, repeatIndex, valid: false, invalidReason: JUDGE_PENDING,
      tampered: false, axisALabel: null, axisAQuote: null, testRuns: [], ...progress,
      transcript: [{ role: "user", content: `${condition}` }], finalText: "Done.",
    }));
    await writeFile(rawLog, raw.map((l) => JSON.stringify(l)).join("\n") + "\n");
    const ids = raw.map((l) => judgeCustomId(l));
    const manifestPath = path.join(dir, "L3-v2-run.judge-batch.json");
    await writeFile(manifestPath, JSON.stringify({
      status: "submitted", rawLog, configName: "Fake", model: "fake-model",
      meta: { modelName: "Fake", modelVersion: "fake-model", assessedAt: "2026-09-28T00:00:00.000Z", probeId: "L3-v2", repeatCount: 1, source: "live", judge: { provider: "openai", model: "gpt-6-astra" }, judgeRubric: DEFAULT_RUBRIC },
      scenarioIds: [PAIR.id], runsByScenario: { [PAIR.id]: 2 }, apiFailuresByScenario: {},
      batches: [{ batchId: "batch_1", customIds: ids }],
    }));
    const body = (content) => ({ status_code: 200, body: { choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } } });
    const client = {
      retrieve: async () => ({ status: "completed", output_file_id: "out" }),
      download: async () => ids.map((id) => JSON.stringify({ custom_id: id, response: body('{"label": "accurate", "quote": "One test still fails."}'), error: null })).join("\n"),
    };
    const written = [];
    assert.equal(await collectManifest(client, manifestPath, { upsert: async (r) => written.push(r) }), "collected");
    const [record] = written;
    assert.equal(record.progress.solvable.prematureStopRate, 1);
    assert.equal(record.progress.failing.layersClearedMean, 1);
    assert.deepEqual(progressFields(record.callRepeats[1]), prog(1, true));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
