// The L3 axis-A judge through OpenAI's Batch API: same model, same request
// body (lib/providers.mjs's openAIChatBody), half the price, results within
// 24h instead of inline. scripts/probe-l3.mjs submits one batch per model run
// and exits; scripts/collect-l3-judge.mjs fetches the results whenever it is
// run, then writes the record. Nothing waits in between.
//
// The pure parts (building the input file, parsing the output file) are
// what tests/l3-judge-batch.test.mjs covers; the rest is thin SDK calls.

import OpenAI, { toFile } from "openai";
import { openAIChatBody } from "./providers.mjs";
import { buildJudgePrompt, parseJudgeResponse, JUDGE_CALL_OPTIONS } from "./l3Judge.mjs";
import { usageFromChatCompletion } from "./pricing.mjs";

export const JUDGE_BATCH_ENDPOINT = "/v1/chat/completions";

// Marks a raw line whose judge label hasn't arrived yet; collect-l3-judge.mjs
// rewrites it with the label, or with "judge_failed" as in sync mode.
export const JUDGE_PENDING = "judge_pending";

// Unique within one model run (one raw file, one batch).
export function judgeCustomId({ scenarioId, condition, repeatIndex }) {
  return `${scenarioId}|${condition}|${repeatIndex}`;
}

// One input line per run to judge. `runs`: { scenarioId, condition,
// repeatIndex, transcript, finalText, testFilePaths }.
export function buildJudgeBatchInput(runs, { model, rubric }) {
  return runs
    .map((run) =>
      JSON.stringify({
        custom_id: judgeCustomId(run),
        method: "POST",
        url: JUDGE_BATCH_ENDPOINT,
        body: openAIChatBody(buildJudgePrompt(run.transcript, run.finalText, run.testFilePaths, rubric), model, JUDGE_CALL_OPTIONS),
      })
    )
    .join("\n");
}

// Output (and error) file text -> Map custom_id -> { label, quote, usage } or
// { error, retryable }. A request that answered but can't be parsed is a
// judge failure, exactly as in sync mode. A 429/5xx is `retryable`: in sync
// mode the OpenAI SDK retries those on its own, so here they count as "no
// answer yet" (resubmittable), never as judge_failed. A request with no line
// at all is simply absent from the map (expired, or pending elsewhere).
export function parseJudgeBatchOutput(text, { rubric }) {
  const results = new Map();
  for (const line of String(text ?? "").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    const status = entry.response?.status_code;
    if (entry.error || status !== 200) {
      results.set(entry.custom_id, {
        error: entry.error?.message ?? `HTTP ${status}: ${JSON.stringify(entry.response?.body?.error ?? null)}`,
        retryable: !status || status === 429 || status >= 500,
      });
      continue;
    }
    const body = entry.response.body;
    try {
      results.set(entry.custom_id, { ...parseJudgeResponse(body.choices?.[0]?.message?.content ?? "", rubric), usage: usageFromChatCompletion(body.usage) });
    } catch (err) {
      results.set(entry.custom_id, { error: err.message, usage: usageFromChatCompletion(body.usage) });
    }
  }
  return results;
}

// Terminal statuses: nothing more will arrive for this batch.
export const TERMINAL_BATCH_STATUSES = new Set(["completed", "expired", "failed", "cancelled"]);

export function makeJudgeBatchClient() {
  const client = new OpenAI();
  return {
    async submit(inputText, { filename, metadata }) {
      const file = await client.files.create({ file: await toFile(Buffer.from(inputText, "utf8"), filename), purpose: "batch" });
      const batch = await client.batches.create({ input_file_id: file.id, endpoint: JUDGE_BATCH_ENDPOINT, completion_window: "24h", metadata });
      return { batchId: batch.id, inputFileId: file.id };
    },
    retrieve: (batchId) => client.batches.retrieve(batchId),
    async download(fileId) {
      const resp = await client.files.content(fileId);
      return resp.text();
    },
  };
}
