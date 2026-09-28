// Collecting an L3 judge batch (lib/l3JudgeBatch.mjs): download, label the
// raw JSONL, write the record. The logic behind scripts/collect-l3-judge.mjs,
// here so tests/l3-judge-batch.test.mjs can drive it end to end with a fake
// client and no DB, the way tests/l3-agent.test.mjs drives the agent loop.

import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { loadL3Scenarios, testFilePathsFor } from "./l3Scenarios.mjs";
import { emptyUsage, addUsage, describeUsage } from "./pricing.mjs";
import { hashTranscript, aggregateL3Rows, buildL3Record, progressFields, describeProgress } from "./l3Aggregate.mjs";
import { JUDGE_PENDING, TERMINAL_BATCH_STATUSES, judgeCustomId, buildJudgeBatchInput, parseJudgeBatchOutput } from "./l3JudgeBatch.mjs";
import { PUBLISHED_L3_CONDITION } from "./probeL3Config.mjs";
import { withRetries } from "./providers.mjs";

async function readJsonl(file) {
  return (await readFile(file, "utf8"))
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

// Temp file + rename, so a crash never leaves a half-written raw file.
async function writeAtomic(file, text) {
  await writeFile(`${file}.tmp`, text);
  await rename(`${file}.tmp`, file);
}

async function saveManifest(manifestPath, manifest) {
  await writeAtomic(manifestPath, JSON.stringify(manifest, null, 1) + "\n");
}

async function submitBatch(client, manifest, manifestPath, lines, ids, label) {
  const scenarios = Object.fromEntries((await loadL3Scenarios(manifest.meta.probeId)).map((s) => [s.id, s]));
  const wanted = new Set(ids);
  const runs = lines
    .filter((l) => wanted.has(judgeCustomId(l)))
    .map((l) => {
      const s = scenarios[l.scenarioId];
      return { ...l, testFilePaths: testFilePathsFor(s, l.condition) };
    });
  const stem = manifestPath.replace(/\.judge-batch\.json$/, "");
  const n = manifest.batches.length + 1;
  // Rebuilt from the raw file: after a failed submit in probe-l3 this
  // rewrites input-1 with the same bytes probe-l3 wrote there.
  const inputFile = `${stem}.judge-batch-input-${n}.jsonl`;
  const inputText = buildJudgeBatchInput(runs, { model: manifest.meta.judge.model, rubric: manifest.meta.judgeRubric });
  await writeFile(inputFile, inputText + "\n");
  const { batchId, inputFileId } = await withRetries(
    () =>
      client.submit(inputText, {
        filename: path.basename(inputFile),
        metadata: { project: "psychochat", model: manifest.model, assessedAt: manifest.meta.assessedAt },
      }),
    { label: `${label} submit` }
  );
  manifest.batches.push({ batchId, inputFileId, inputFile: path.basename(inputFile), customIds: ids, submittedAt: new Date().toISOString() });
  await saveManifest(manifestPath, manifest);
  console.log(`${label}: ${ids.length} runs sent to the judge as batch ${batchId}.`);
}

// One manifest, one step forward. `client`: makeJudgeBatchClient() or a
// test fake with the same { submit, retrieve, download }. `upsert`: the DB
// write (lib/db.mjs's upsertL3ProbeRun), injected so tests never touch the DB.
// Returns the manifest's status afterwards.
export async function collectManifest(client, manifestPath, { resubmit = false, acceptMissing = false, upsert }) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const label = `[${manifest.configName} ${manifest.meta.assessedAt}]`;
  if (manifest.status !== "submitted") return manifest.status;
  const stem = manifestPath.replace(/\.judge-batch\.json$/, "");
  const lines = await readJsonl(manifest.rawLog);
  const pendingIds = lines.filter((l) => l.invalidReason === JUDGE_PENDING).map(judgeCustomId);

  // 1. Download whatever has finished, before anything else can go wrong.
  let inProgress = false;
  for (const [i, batch] of manifest.batches.entries()) {
    if (batch.saved) continue;
    const b = await client.retrieve(batch.batchId);
    batch.status = b.status;
    batch.requestCounts = b.request_counts;
    if (!TERMINAL_BATCH_STATUSES.has(b.status)) {
      const c = b.request_counts;
      console.log(`${label}: batch ${batch.batchId} is ${b.status}${c ? ` (${c.completed}/${c.total} done, ${c.failed} failed)` : ""} — try again later.`);
      inProgress = true;
      continue;
    }
    if (b.status === "failed") console.warn(`${label}: batch ${batch.batchId} failed — ${JSON.stringify(b.errors?.data ?? null)}`);
    if (b.output_file_id) {
      batch.outputFile = path.basename(`${stem}.judge-batch-output-${i + 1}.jsonl`);
      await writeFile(`${stem}.judge-batch-output-${i + 1}.jsonl`, await client.download(b.output_file_id));
    }
    if (b.error_file_id) {
      batch.errorFile = path.basename(`${stem}.judge-batch-errors-${i + 1}.jsonl`);
      await writeFile(`${stem}.judge-batch-errors-${i + 1}.jsonl`, await client.download(b.error_file_id));
    }
    batch.saved = true;
    await saveManifest(manifestPath, manifest);
  }
  if (inProgress) {
    await saveManifest(manifestPath, manifest);
    return manifest.status;
  }

  // 2. Every answer so far, later batches (resubmissions) winning.
  const results = new Map();
  const judgeUsage = emptyUsage();
  for (const batch of manifest.batches) {
    for (const file of [batch.outputFile, batch.errorFile].filter(Boolean)) {
      const text = await readFile(path.join(path.dirname(stem), file), "utf8");
      for (const [id, r] of parseJudgeBatchOutput(text, { rubric: manifest.meta.judgeRubric })) {
        addUsage(judgeUsage, r.usage);
        results.set(id, { ...r, batchId: batch.batchId });
      }
    }
  }

  const missing = pendingIds.filter((id) => !results.has(id) || results.get(id).retryable);
  if (missing.length) {
    if (manifest.batches.length === 0 || resubmit) {
      await submitBatch(client, manifest, manifestPath, lines, missing, label);
      return manifest.status;
    }
    if (!acceptMissing) {
      console.warn(
        `${label}: ${missing.length} runs have no judge answer (batch expired or cancelled). Re-run with --resubmit to send them again, or --accept-missing to count them as judge_failed.`
      );
      return manifest.status;
    }
  }

  // 3. Labels into the raw file, same fields a sync run writes.
  for (const line of lines) {
    if (line.invalidReason !== JUDGE_PENDING) continue;
    const id = judgeCustomId(line);
    const r = results.get(id);
    if (r?.label) {
      line.valid = true;
      line.invalidReason = null;
      line.axisALabel = r.label;
      line.axisAQuote = r.quote;
    } else {
      console.warn(`${label} ${id}: judge failed — ${r?.error ?? "no answer"}`);
      line.invalidReason = "judge_failed";
    }
    if (r) line.judgeBatchId = r.batchId;
  }
  await writeAtomic(manifest.rawLog, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  console.log(`${label}: judge usage ${describeUsage(manifest.meta.judge.model, judgeUsage, { tier: "batch" })}`);

  // 4. The record — same aggregate as a sync run (lib/l3Aggregate.mjs).
  const rows = lines.map((l) => ({
    scenarioId: l.scenarioId,
    condition: l.condition,
    repeatIndex: l.repeatIndex,
    axisALabel: l.axisALabel,
    axisAQuote: l.axisAQuote,
    invalidReason: l.invalidReason,
    tampered: l.tampered,
    transcriptHash: hashTranscript(l.transcript),
    ...progressFields(l.layersTotal == null ? null : l),
  }));
  const { scenarioIds, runsByScenario, apiFailuresByScenario } = manifest;
  const aggregate = aggregateL3Rows({ scenarioIds, rows, runsByScenario, apiFailuresByScenario });
  for (const id of aggregate.excludedScenarioIds) {
    console.warn(`${label} ${id}: excluded from the aggregate — ${apiFailuresByScenario[id]}/${runsByScenario[id]} runs failed outright`);
  }
  const record = buildL3Record(manifest.meta, aggregate, rows);
  if (record) {
    await upsert(record);
    if (record.progress) console.log(`${label}: ${describeProgress(record.progress)}`);
    console.log(
      `${label}: enacted=${record.enacted.toFixed(1)} tampering=${(record.tamperingRate * 100).toFixed(0)}% validity=${(record.validityRate * 100).toFixed(0)}% — written to data/psychochat.sqlite`
    );
  } else {
    console.warn(`${label}: discarded — 0 valid "${PUBLISHED_L3_CONDITION}" runs, no data to score enacted from (not the same as a bad score).`);
  }
  manifest.status = record ? "collected" : "discarded";
  manifest.collectedAt = new Date().toISOString();
  await saveManifest(manifestPath, manifest);
  return manifest.status;
}
