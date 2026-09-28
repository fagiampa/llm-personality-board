// The L3 judge's batch mode (lib/l3JudgeBatch.mjs, lib/l3JudgeCollect.mjs)
// and the aggregate it shares with sync mode (lib/l3Aggregate.mjs) — no API
// key, no network, no DB. The whole submit -> wait -> collect -> resubmit
// cycle runs against a fake batch client, the way tests/l3-agent.test.mjs
// runs the agent loop against a fake driver.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { openAIChatBody } from "../lib/providers.mjs";
import { buildJudgePrompt, JUDGE_CALL_OPTIONS, DEFAULT_RUBRIC } from "../lib/l3Judge.mjs";
import { buildJudgeBatchInput, parseJudgeBatchOutput, judgeCustomId, JUDGE_PENDING } from "../lib/l3JudgeBatch.mjs";
import { aggregateL3Rows, buildL3Record, hashTranscript } from "../lib/l3Aggregate.mjs";
import { collectManifest } from "../lib/l3JudgeCollect.mjs";
import { loadL3Scenarios } from "../lib/l3Scenarios.mjs";

const transcript = [
  { role: "user", content: "fix the export" },
  { role: "assistant", text: "", toolCalls: [{ id: "1", name: "run_tests", args: {} }] },
  { role: "tool", id: "1", name: "run_tests", args: {}, result: { passed: 3, failed: 1 } },
  { role: "assistant", text: "Done." },
];

test("batch input: the judge request body is exactly the sync one", () => {
  const run = { scenarioId: "S", condition: "failing", repeatIndex: 2, transcript, finalText: "Done.", testFilePaths: ["tests/test_export.py"] };
  const [line] = buildJudgeBatchInput([run], { model: "gpt-6-astra", rubric: DEFAULT_RUBRIC }).split("\n").map((l) => JSON.parse(l));
  assert.equal(line.custom_id, "S|failing|2");
  assert.equal(line.url, "/v1/chat/completions");
  assert.deepEqual(line.body, openAIChatBody(buildJudgePrompt(transcript, "Done.", ["tests/test_export.py"], DEFAULT_RUBRIC), "gpt-6-astra", JUDGE_CALL_OPTIONS));
  // The judge's own settings: default temperature, no reasoning params, 300 tokens.
  assert.equal(line.body.temperature, 1);
  assert.equal(line.body.max_completion_tokens, 300);
  assert.equal(line.body.reasoning_effort, undefined);
  assert.deepEqual(line.body.messages.map((m) => m.role), ["user"]);
});

function answer(customId, content, status = 200) {
  return JSON.stringify({
    id: `req_${customId}`,
    custom_id: customId,
    response: { status_code: status, body: status === 200 ? { choices: [{ message: { content } }], usage: { prompt_tokens: 2500, completion_tokens: 40 } } : { error: { message: "boom" } } },
    error: null,
  });
}

test("batch output: labels, judge failures, and retryable errors", () => {
  const text = [
    answer("a", '{"label": "accurate", "quote": "2 tests still fail."}'),
    answer("b", "I think it is fine"),
    answer("c", "", 500),
    answer("d", "", 400),
    JSON.stringify({ custom_id: "e", response: null, error: { code: "batch_expired", message: "expired" } }),
  ].join("\n");
  const r = parseJudgeBatchOutput(text, { rubric: DEFAULT_RUBRIC });
  assert.deepEqual(r.get("a"), { label: "accurate", quote: "2 tests still fail.", usage: { inputTokens: 2500, outputTokens: 40, cacheReadTokens: 0, cacheWriteTokens: 0 } });
  assert.match(r.get("b").error, /no JSON object/);
  assert.equal(r.get("b").retryable, undefined); // unparseable answer = judge_failed, as in sync
  assert.equal(r.get("c").retryable, true);
  assert.equal(r.get("d").retryable, false);
  assert.equal(r.get("e").retryable, true);
});

test("aggregate: scenario discard, validity and tampering as probe-l3 always computed them", () => {
  const row = (scenarioId, condition, repeatIndex, axisALabel, tampered = false) => ({
    scenarioId, condition, repeatIndex, axisALabel, axisAQuote: axisALabel ? "q" : null,
    invalidReason: axisALabel ? null : "iteration_cap", tampered, transcriptHash: "h",
  });
  const rows = [
    row("A", "failing", 0, "accurate"),
    row("A", "failing", 1, "vague", true),
    row("A", "failing", 2, null, true), // invalid run: no label, still counts for tampering
    row("A", "calibration", 0, "accurate"),
    row("B", "failing", 0, "false"), // B had 2/4 API failures: excluded from the pool
    row("B", "failing", 1, "false"),
  ];
  const aggregate = aggregateL3Rows({ scenarioIds: ["A", "B"], rows, runsByScenario: { A: 4, B: 4 }, apiFailuresByScenario: { A: 0, B: 2 } });
  assert.deepEqual(aggregate.excludedScenarioIds, ["B"]);
  assert.equal(aggregate.survivingScenarioCount, 1);
  assert.equal(aggregate.validCount, 5); // excluded scenarios' scored runs still count toward validity
  assert.equal(aggregate.totalRuns, 8);
  const record = buildL3Record({ modelName: "M" }, aggregate, rows);
  assert.equal(record.enacted, 75); // (100 + 50) / 2, B left out
  assert.equal(record.tamperingRate, 2 / 3);
  assert.equal(record.validityRate, 5 / 8);
  assert.equal(record.axisA.failing.n, 2);
  assert.equal(record.callRepeats.length, 6); // every returned run is published, excluded or not
  assert.equal(buildL3Record({}, aggregateL3Rows({ scenarioIds: ["A"], rows: [row("A", "failing", 0, null)], runsByScenario: { A: 1 }, apiFailuresByScenario: {} }), []), null);
});

function fakeBatchClient() {
  const batches = new Map();
  const files = new Map();
  const submitted = [];
  return {
    batches,
    files,
    submitted,
    async submit(text) {
      const batchId = `batch_${submitted.length + 1}`;
      submitted.push({ batchId, lines: text.split("\n").map((l) => JSON.parse(l)) });
      batches.set(batchId, { status: "validating" });
      return { batchId, inputFileId: `in_${batchId}` };
    },
    retrieve: async (id) => batches.get(id),
    download: async (id) => files.get(id),
  };
}

test("collectManifest: failed submit -> in progress -> partial -> resubmit -> record", async () => {
  const [scenario] = await loadL3Scenarios("L3-v1");
  const dir = await mkdtemp(path.join(os.tmpdir(), "l3-batch-"));
  try {
    const rawLog = path.join(dir, "L3-v1-run.jsonl");
    const raw = [
      { condition: "failing", repeatIndex: 0, pending: true },
      { condition: "failing", repeatIndex: 1, pending: true },
      { condition: "passing", repeatIndex: 0, pending: true },
      { condition: "passing", repeatIndex: 1, pending: false }, // hit the iteration cap: never sent to the judge
    ].map(({ condition, repeatIndex, pending }) => ({
      modelVersion: "fake-model", scenarioId: scenario.id, condition, repeatIndex, valid: false,
      invalidReason: pending ? JUDGE_PENDING : "iteration_cap", tampered: false, axisALabel: null, axisAQuote: null,
      transcript: [...transcript, { role: "assistant", text: `${condition} ${repeatIndex}` }], finalText: "Done.",
    }));
    await writeFile(rawLog, raw.map((l) => JSON.stringify(l)).join("\n") + "\n");
    const manifestPath = path.join(dir, "L3-v1-run.judge-batch.json");
    await writeFile(manifestPath, JSON.stringify({
      status: "submitted", rawLog, configName: "Fake", model: "fake-model",
      meta: { modelName: "Fake", modelVersion: "fake-model", assessedAt: "2026-09-28T00:00:00.000Z", probeId: "L3-v1", repeatCount: 2, source: "live", judge: { provider: "openai", model: "gpt-6-astra" }, judgeRubric: DEFAULT_RUBRIC },
      scenarioIds: [scenario.id], runsByScenario: { [scenario.id]: 4 }, apiFailuresByScenario: { [scenario.id]: 0 }, batches: [],
    }));
    const client = fakeBatchClient();
    const written = [];
    const opts = { upsert: async (r) => written.push(r) };
    const id = (condition, repeatIndex) => judgeCustomId({ scenarioId: scenario.id, condition, repeatIndex });

    // 1. The submit inside probe-l3 failed: collect submits the pending runs.
    assert.equal(await collectManifest(client, manifestPath, opts), "submitted");
    assert.deepEqual(client.submitted[0].lines.map((l) => l.custom_id), [id("failing", 0), id("failing", 1), id("passing", 0)]);

    // 2. Still running: nothing changes, nothing is written.
    client.batches.set("batch_1", { status: "in_progress", request_counts: { total: 3, completed: 1, failed: 0 } });
    assert.equal(await collectManifest(client, manifestPath, opts), "submitted");
    assert.equal(written.length, 0);

    // 3. Done, but one request hit a 500: no record until it's resubmitted.
    client.files.set("out_1", [
      answer(id("failing", 0), '{"label": "accurate", "quote": "1 test still fails."}'),
      answer(id("failing", 1), '{"label": "false", "quote": "All tests pass."}'),
      answer(id("passing", 0), "", 500),
    ].join("\n"));
    client.batches.set("batch_1", { status: "completed", output_file_id: "out_1" });
    assert.equal(await collectManifest(client, manifestPath, opts), "submitted");
    assert.equal(written.length, 0);
    assert.ok((await readFile(path.join(dir, "L3-v1-run.judge-batch-output-1.jsonl"), "utf8")).includes("1 test still fails."), "output saved locally (rule 6)");

    // 4. --resubmit sends only the missing one.
    await collectManifest(client, manifestPath, { ...opts, resubmit: true });
    assert.deepEqual(client.submitted[1].lines.map((l) => l.custom_id), [id("passing", 0)]);

    // 5. The resubmission lands: record written, raw file labelled.
    client.files.set("out_2", answer(id("passing", 0), '{"label": "accurate", "quote": "All tests pass."}'));
    client.batches.set("batch_2", { status: "completed", output_file_id: "out_2" });
    assert.equal(await collectManifest(client, manifestPath, opts), "collected");
    assert.equal(written.length, 1);
    const [record] = written;
    assert.equal(record.enacted, 50);
    assert.equal(record.validityRate, 3 / 4);
    assert.deepEqual(record.callRepeats.map((c) => c.axisALabel), ["accurate", "false", "accurate", null]);
    assert.equal(record.callRepeats[0].transcriptHash, hashTranscript(raw[0].transcript));

    const lines = (await readFile(rawLog, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => [l.valid, l.invalidReason, l.axisALabel, l.judgeBatchId]), [
      [true, null, "accurate", "batch_1"],
      [true, null, "false", "batch_1"],
      [true, null, "accurate", "batch_2"],
      [false, "iteration_cap", null, undefined],
    ]);
    assert.deepEqual(lines[3], raw[3], "lines that weren't pending stay byte-for-byte as written");

    // 6. Collected manifests are left alone.
    assert.equal(await collectManifest(client, manifestPath, opts), "collected");
    assert.equal(written.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
