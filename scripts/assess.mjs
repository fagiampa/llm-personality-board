// Administers the HEXACO item bank (items/sample/json/items.sample.json) to
// one real model per configured provider, scores the responses, and writes
// each run into the SQLite DB (lib/db.mjs) — one assessments row per
// (model, timestamp) plus every raw per-item, per-repeat answer.
//
// Usage: npm run assess   (reads API keys from .env via `node --env-file`)
//
// This is a pragmatic self-report proxy, not a validated psychometric
// administration: each item is asked ASSESS_REPEATS times at temperature 1
// and the spread across those repeats stands in for the "N somministrazioni"
// confidence band described in the brief. Swap in the real methodology
// (multiple independent prompts/personas, more items per facet, human
// scoring review, etc.) when that separate brief is defined.
//
// Items are sent ASSESS_BATCH_SIZE at a time per prompt (default 40) instead
// of one call per item, to cut round trips ~40x. Each batch is drawn from a
// full shuffle of all 240 items rather than grouped by domain/facet, so a
// batch mixes items from all six domains — this avoids long runs of
// same-facet items back to back, which would let the model anchor on
// whatever rating it just gave instead of judging each statement on its own.

import { readFile, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { upsertAssessment } from "../lib/db.mjs";
import {
  ASSESS_REPEATS as REPEATS,
  ASSESS_MIN_SUCCESS_RATIO as MIN_SUCCESS_RATIO,
} from "../lib/assessConfig.mjs";
import {
  MODEL_CONFIG,
  CLIENT_FACTORIES,
  DELAY_MS_BY_PROVIDER,
  withRetries,
  displayModelVersion,
  sleep,
} from "../lib/providers.mjs";

const ITEMS_PATH = "items/sample/json/items.sample.json";
const BATCH_SIZE = Number(process.env.ASSESS_BATCH_SIZE ?? 40);
// Comma-separated allowlist of model names (matching MODEL_CONFIG[].name) to
// actually (re)assess this run, e.g. ASSESS_ONLY=ChatGPT. Unset = assess all
// configured models, same as before. Models left out keep their existing
// data/mock-scores.json entry untouched, same as a model with no provider.
const ONLY = process.env.ASSESS_ONLY
  ? new Set(process.env.ASSESS_ONLY.split(",").map((s) => s.trim()).filter(Boolean))
  : null;
const DOMAIN_ORDER = ["H", "E", "X", "A", "C", "O"];
const DOMAIN_LABELS = {
  H: "Honesty-Humility",
  E: "Emotionality",
  X: "Extraversion",
  A: "Agreeableness",
  C: "Conscientiousness",
  O: "Openness",
};

const BATCH_SYSTEM_PROMPT =
  "You are completing a personality self-assessment about yourself. " +
  "You will be given a numbered/labeled list of statements. Answer every one, independently — " +
  "do not let earlier answers in the list anchor later ones. " +
  "Output plain text only: no markdown, no bold/asterisks, no bullet points, no numbering, " +
  "no restating the statement, no extra commentary before, between, or after the lines.";

function batchUserPrompt(batchItems) {
  const lines = batchItems.map((item) => `${item.id}: "${item.text_en}"`).join("\n");
  return (
    `${lines}\n\n` +
    "For each statement above, rate how accurately it describes you: " +
    "1 = very inaccurate, 5 = very accurate.\n" +
    "Respond with exactly one plain-text line per statement, in the exact format `id=digit` " +
    "(e.g. H_Sinc_01=3), one id per line, in any order, covering every id listed above and no " +
    "other id. No markdown formatting of any kind (no **bold**, no backticks, no bullets/dashes, " +
    "no numbering)."
  );
}

// Parses a batch response into {item, raw}. For each item, finds its id as a
// substring anywhere in the response and reads the first standalone 1-5
// digit shortly after it — deliberately loose about what sits between the id
// and the digit (`=`, `:`, `-`, parentheses, markdown emphasis, restated
// text, ...) since models don't reliably stick to the requested `id=digit`
// format under batching. The window is capped at the next item id's position
// (not just a fixed character count) so a skipped/answer-less item can never
// "steal" a digit that actually belongs to the next item's line. `raw` is
// null when the id never appears, or no 1-5 digit follows it within the
// window (unparseable/omitted/truncated).
function parseBatchResponse(text, batchItems) {
  const s = String(text);
  const positions = batchItems
    .map((item) => ({ item, idx: s.indexOf(item.id) }))
    .filter((p) => p.idx !== -1)
    .sort((a, b) => a.idx - b.idx);

  const rawById = new Map();
  for (let i = 0; i < positions.length; i++) {
    const { item, idx } = positions[i];
    const nextIdx = i + 1 < positions.length ? positions[i + 1].idx : s.length;
    const windowEnd = Math.min(idx + item.id.length + 40, nextIdx);
    const window = s.slice(idx + item.id.length, windowEnd);
    const m = window.match(/[1-5](?!\d)/);
    rawById.set(item.id, m ? Number(m[0]) : null);
  }
  return batchItems.map((item) => ({ item, raw: rawById.has(item.id) ? rawById.get(item.id) : null }));
}

function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdev(values, avg) {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function toHundredScale(raw1to5) {
  return ((raw1to5 - 1) / 4) * 100;
}

function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

// Generous headroom: models don't reliably stick to bare "id=digit" lines
// under batching (restated item text, markdown, stray commentary all eat
// into the budget despite being told not to) — a tight estimate here was
// silently truncating a big chunk of each batch's answers.
function maxTokensForBatch(batchSize) {
  return Math.max(1000, batchSize * 60);
}

// --- Assessment ---------------------------------------------------------

async function callBatchWithRetries(callBatch, promptText, model, label, systemPrompt = BATCH_SYSTEM_PROMPT) {
  return withRetries(() => callBatch(promptText, model, { systemPrompt, maxTokens: maxTokensForBatch(BATCH_SIZE) }), {
    label,
  });
}

async function assessModel(config, items, callBatch) {
  // domain -> array of 0-100 scores, one per (item, repeat)
  const byDomain = Object.fromEntries(DOMAIN_ORDER.map((d) => [d, []]));
  // item id -> { reverse, answers: [{rep, value}] } — raw 1-5 answers as
  // actually given, before the reverse-score flip, one entry per successful
  // (item, repeat). Backs both item_means and assessment_item_repeats.
  const itemAnswers = new Map();
  const delayMs = DELAY_MS_BY_PROVIDER[config.provider] ?? 0;
  const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };

  for (let rep = 0; rep < REPEATS; rep++) {
    const batches = chunk(shuffle(items), BATCH_SIZE);
    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      let result;
      try {
        result = await callBatchWithRetries(
          callBatch,
          batchUserPrompt(batch),
          config.model,
          `[${config.name}] rep ${rep + 1} batch ${b + 1}/${batches.length}`
        );
      } catch (err) {
        console.warn(`  [${config.name}] rep ${rep + 1} batch ${b + 1}/${batches.length}: request failed — ${err.message}`);
        if (delayMs) await sleep(delayMs);
        continue;
      }

      const { text } = result;
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      usage.calls++;

      const parsed = parseBatchResponse(text, batch);
      const missing = parsed.filter((p) => p.raw === null);
      if (missing.length > batch.length / 2) {
        // Losing more than half a batch is a systemic issue (empty/truncated
        // response, wrong format entirely), not per-line noise — the raw
        // response length narrows down which: near-0 chars usually means the
        // whole token budget got eaten before any visible output, a large
        // length with few matches means the model answered in some other
        // format the parser isn't finding.
        console.warn(
          `  [${config.name}] rep ${rep + 1} batch ${b + 1}/${batches.length}: ${missing.length}/${batch.length} items unparseable — raw response was ${text.length} chars`
        );
      }
      for (const { item, raw } of parsed) {
        if (raw === null) {
          console.warn(`  [${config.name}] ${item.id} rep ${rep + 1}: missing/unparseable in batch response, skipped`);
          continue;
        }
        const scored = item.reverse ? 6 - raw : raw;
        byDomain[item.domain].push(toHundredScale(scored));

        if (!itemAnswers.has(item.id)) itemAnswers.set(item.id, { reverse: item.reverse, answers: [] });
        itemAnswers.get(item.id).answers.push({ rep, value: raw });
      }
      if (delayMs) await sleep(delayMs);
    }
  }

  const totalSamples = DOMAIN_ORDER.reduce((sum, d) => sum + byDomain[d].length, 0);
  if (totalSamples === 0) {
    throw new Error("every batch failed — no items were scored (see warnings above)");
  }
  const expectedSamples = items.length * REPEATS;

  const scores = DOMAIN_ORDER.map((d) => {
    const vals = byDomain[d];
    return vals.length ? Math.round(mean(vals)) : 0;
  });
  const margin = DOMAIN_ORDER.map((d, i) => {
    const vals = byDomain[d];
    if (vals.length < 2) return 8; // not enough repeats to estimate spread — fall back to the illustrative default
    const sem = stdev(vals, mean(vals)) / Math.sqrt(vals.length);
    return Math.min(30, Math.max(2, Math.round(1.96 * sem)));
  });
  const dominantIdx = scores.indexOf(Math.max(...scores));

  const itemMeans = [...itemAnswers.entries()].map(([id, { reverse, answers }]) => ({
    id,
    reverse,
    value: mean(answers.map((a) => a.value)),
  }));
  const itemRepeats = [...itemAnswers.entries()].flatMap(([id, { reverse, answers }]) =>
    answers.map(({ rep, value }) => ({ questionId: id, reverse, repeatIndex: rep, value }))
  );

  return {
    scores,
    margin,
    dominant: DOMAIN_LABELS[DOMAIN_ORDER[dominantIdx]],
    itemMeans,
    itemRepeats,
    usage,
    successRatio: totalSamples / expectedSamples,
  };
}

// No self-description any more (2026-09-25): the model-written one-liner
// and its Italian translation cost two extra calls per model per run and
// didn't serve the measure; the card no longer shows one. New rows store an
// empty one_liner (the column is NOT NULL) and no one_liner_it — never the
// previous run's sentence, which described different scores.

// Mirrors everything printed via console.log/warn/error to a file for the
// rest of the process, in addition to the terminal — so the per-model usage
// summary (and every warning/error) survives after the terminal scrollback
// is gone. Patches the global console rather than threading a logger through
// every call site, since this is a standalone CLI script, not app code.
async function tapConsoleToLogFile(assessedAt) {
  await mkdir("data/logs", { recursive: true });
  const logPath = path.resolve(`data/logs/assess-${assessedAt.replace(/[:.]/g, "-")}.log`);
  const stream = createWriteStream(logPath, { flags: "a" });
  for (const method of ["log", "warn", "error"]) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      original(...args);
      const line = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
      stream.write(`${line}\n`);
    };
  }
  return logPath;
}

async function main() {
  const itemsRaw = JSON.parse(await readFile(path.resolve(ITEMS_PATH), "utf8"));
  const items = itemsRaw.items;

  const assessedAt = new Date().toISOString();
  const logPath = await tapConsoleToLogFile(assessedAt);
  console.log(`Logging this run to ${logPath}`);
  const clients = {};
  let written = 0;

  for (const config of MODEL_CONFIG) {
    if (ONLY && !ONLY.has(config.name)) {
      console.log(`Skipping ${config.name}: excluded via ASSESS_ONLY, DB entry unchanged.`);
      continue;
    }
    if (!config.provider) {
      console.log(`Skipping ${config.name}: no provider configured, DB entry unchanged.`);
      continue;
    }

    console.log(`Assessing ${config.name} via ${config.provider} (${config.model})...`);
    try {
      clients[config.provider] ??= CLIENT_FACTORIES[config.provider]();
      const {
        scores,
        margin,
        dominant,
        itemMeans,
        itemRepeats,
        usage: assessUsage,
        successRatio,
      } = await assessModel(config, items, clients[config.provider]);
      if (successRatio < MIN_SUCCESS_RATIO) {
        console.warn(
          `  [${config.name}] discarded: only ${(successRatio * 100).toFixed(1)}% of expected samples collected ` +
            `(need ${(MIN_SUCCESS_RATIO * 100).toFixed(0)}%) — keeping the previous live version, DB entry unchanged.`
        );
        continue;
      }
      const totalUsage = assessUsage;
      console.log(
        `  [${config.name}] usage: ${totalUsage.inputTokens} input + ${totalUsage.outputTokens} output tokens across ${totalUsage.calls} calls`
      );
      await upsertAssessment({
        modelName: config.name,
        assessedAt,
        modelVersion: displayModelVersion(config.model),
        monogram: config.monogram,
        hue: config.hue,
        scores,
        margin,
        oneLiner: "",
        dominant,
        source: "live",
        itemMeans,
        itemRepeats,
      });
      written++;
    } catch (err) {
      // A broken client (e.g. missing API key) must not abort the whole
      // run — leave this model's existing DB entry untouched and move on so
      // the other providers still get assessed and written.
      console.warn(`  [${config.name}] client setup failed, DB entry unchanged — ${err.message}`);
    }
  }

  console.log(`\nWrote ${written} new assessment run(s) to data/psychochat.sqlite`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
