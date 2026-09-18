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
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getLatest, upsertAssessment } from "../lib/db.mjs";
import { ASSESS_REPEATS as REPEATS } from "../lib/assessConfig.mjs";

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

// Which of the mock models to actually (re)assess, and with what provider.
// A model here without a matching API key in .env falls back to keeping its
// existing entry in data/mock-scores.json untouched (see main()).
const MODEL_CONFIG = [
  { name: "ChatGPT", provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-4o-mini" },
  { name: "Gemini", provider: "google", model: process.env.GOOGLE_MODEL ?? "gemini-3.5-flash-lite" },
  { name: "Claude", provider: "anthropic", model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5" },
  { name: "Grok", provider: "xai", model: process.env.GROK_MODEL ?? "grok-4.6" },
  { name: "DeepSeek", provider: "deepseek", model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat" },
];

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

// --- Provider clients -------------------------------------------------
// Each factory returns callBatch(promptText, model, systemPrompt?) => raw
// response text. systemPrompt defaults to BATCH_SYSTEM_PROMPT (the rating
// task); the end-of-run self-interpretation call passes its own instead.

// The OpenAI SDK silently falls back to OPENAI_API_KEY when the `apiKey` you
// pass it is undefined — so an unset DEEPSEEK_API_KEY/GROK_API_KEY doesn't
// fail loudly, it quietly sends your OpenAI key to a different provider's
// endpoint, which then rejects it with a confusing "invalid key" 401 that
// gives no hint the real problem is a missing env var. Fail fast instead.
function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env`);
  return value;
}

function makeAnthropicClient() {
  const client = new Anthropic();
  return async (promptText, model, systemPrompt = BATCH_SYSTEM_PROMPT) => {
    const resp = await client.messages.create({
      model,
      max_tokens: maxTokensForBatch(BATCH_SIZE),
      temperature: 1,
      system: systemPrompt,
      messages: [{ role: "user", content: promptText }],
    });
    const block = resp.content.find((b) => b.type === "text");
    return {
      text: block?.text ?? "",
      usage: { inputTokens: resp.usage?.input_tokens ?? 0, outputTokens: resp.usage?.output_tokens ?? 0 },
    };
  };
}

// o1/o3/o4/gpt-5-family "reasoning" models spend part of max_completion_tokens
// on hidden reasoning tokens before writing any visible output — on a bulk
// rating task like this, that reasoning is pure overhead and was eating the
// entire budget, leaving empty/near-empty responses (hence near-total
// missing/unparseable items). reasoning_effort:"none" tells the model to
// skip it entirely. Only send it for models that actually support it —
// non-reasoning models (gpt-4o-mini, etc.) reject unknown parameters.
// NOTE: the accepted value set is inconsistent across gpt-5.x sub-versions —
// "minimal" (valid on gpt-5) got rejected by gpt-5.2 with a 400 listing
// 'none'|'low'|'medium'|'high'|'xhigh' as the only options. If OPENAI_MODEL
// moves to yet another sub-version and this starts 400-ing again, check the
// error message for that model's actual accepted list.
function isReasoningModel(model) {
  return /^(o1|o3|o4|gpt-5)/i.test(model);
}

function usageFromChatCompletion(resp) {
  return { inputTokens: resp.usage?.prompt_tokens ?? 0, outputTokens: resp.usage?.completion_tokens ?? 0 };
}

function makeOpenAIClient() {
  const client = new OpenAI();
  return async (promptText, model, systemPrompt = BATCH_SYSTEM_PROMPT) => {
    const resp = await client.chat.completions.create({
      model,
      temperature: 1,
      max_completion_tokens: maxTokensForBatch(BATCH_SIZE),
      ...(isReasoningModel(model) ? { reasoning_effort: "none" } : {}),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptText },
      ],
    });
    return { text: resp.choices[0]?.message?.content ?? "", usage: usageFromChatCompletion(resp) };
  };
}

// xAI's Grok API is OpenAI-compatible (same Chat Completions request/response
// shape), just a different base URL/key and its own model lineup — reuse the
// OpenAI SDK instead of adding another dependency. grok-4.6 defaults to
// reasoning_effort "high", which is exactly what caused the gpt-5 disaster
// (reasoning tokens eating the whole batch's token budget before any visible
// output); start it at "low" instead. Older grok-4 doesn't support tuning
// reasoning effort at all and will reject this field — if you point
// GROK_MODEL at one of those, drop this option.
function makeXaiClient() {
  const client = new OpenAI({ apiKey: requireEnv("GROK_API_KEY"), baseURL: "https://api.x.ai/v1" });
  return async (promptText, model, systemPrompt = BATCH_SYSTEM_PROMPT) => {
    const resp = await client.chat.completions.create({
      model,
      temperature: 1,
      max_completion_tokens: maxTokensForBatch(BATCH_SIZE),
      reasoning_effort: "low",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptText },
      ],
    });
    return { text: resp.choices[0]?.message?.content ?? "", usage: usageFromChatCompletion(resp) };
  };
}

// DeepSeek's API is also OpenAI-compatible. Default model is "deepseek-chat"
// (non-reasoning) specifically to sidestep the gpt-5/Grok reasoning-budget
// trap by construction — there's no reliably documented reasoning_effort
// equivalent for DeepSeek to dial down, so if you switch DEEPSEEK_MODEL to
// "deepseek-reasoner" watch for the same empty/truncated-response symptoms
// (see isReasoningModel's comment above) and be ready to raise
// maxTokensForBatch or otherwise budget for hidden reasoning tokens.
function makeDeepSeekClient() {
  const client = new OpenAI({ apiKey: requireEnv("DEEPSEEK_API_KEY"), baseURL: "https://api.deepseek.com/v1" });
  return async (promptText, model, systemPrompt = BATCH_SYSTEM_PROMPT) => {
    const resp = await client.chat.completions.create({
      model,
      temperature: 1,
      max_completion_tokens: maxTokensForBatch(BATCH_SIZE),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptText },
      ],
    });
    return { text: resp.choices[0]?.message?.content ?? "", usage: usageFromChatCompletion(resp) };
  };
}

function makeGoogleClient() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  return async (promptText, model, systemPrompt = BATCH_SYSTEM_PROMPT) => {
    const generativeModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
    const result = await generativeModel.generateContent({
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      // gemini-3.x "thinking" models can spend part of maxOutputTokens on
      // internal reasoning before the visible answer; thinkingConfig.thinkingBudget:0
      // is rejected (400) on the models tested, so just leave generous headroom instead.
      generationConfig: { temperature: 1, maxOutputTokens: maxTokensForBatch(BATCH_SIZE) + 1024 },
    });
    const usageMeta = result.response.usageMetadata;
    return {
      text: result.response.text(),
      usage: { inputTokens: usageMeta?.promptTokenCount ?? 0, outputTokens: usageMeta?.candidatesTokenCount ?? 0 },
    };
  };
}

const CLIENT_FACTORIES = {
  anthropic: makeAnthropicClient,
  openai: makeOpenAIClient,
  google: makeGoogleClient,
  xai: makeXaiClient,
  deepseek: makeDeepSeekClient,
};

// --- Assessment ---------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Transient provider hiccups (rate limits, "currently overloaded"/"high
// demand" 503s) are common enough under batching that dropping the whole
// batch on the first failure loses a meaningful chunk of the run. Retry
// those specifically, with backoff; anything else (bad API key, malformed
// request, etc.) fails immediately since retrying it would just waste time.
function isTransientError(err) {
  const msg = String(err?.message ?? err);
  return /\b(429|503)\b/.test(msg) || /overloaded|high demand|service unavailable|rate limit/i.test(msg);
}

async function callBatchWithRetries(callBatch, promptText, model, label, systemPrompt) {
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    try {
      return await callBatch(promptText, model, systemPrompt);
    } catch (err) {
      const isLastAttempt = i === attempts - 1;
      if (!isTransientError(err) || isLastAttempt) throw err;
      const backoffMs = 2000 * 2 ** i;
      console.warn(`  ${label}: transient error (${err.message}), retrying in ${Math.round(backoffMs / 1000)}s...`);
      await sleep(backoffMs);
    }
  }
}

// Free tiers rate-limit per minute (e.g. Gemini's default flash-lite quota
// is 15 req/min); pace calls per-provider so a run doesn't blow through the
// quota partway in. Now that each call covers a whole batch instead of one
// item, this matters much less in practice (REPEATS * 240/BATCH_SIZE calls
// total per model), but the pacing stays as a safety margin. 0 = no throttling.
const DELAY_MS_BY_PROVIDER = {
  google: Number(process.env.GOOGLE_DELAY_MS ?? 0),
  openai: Number(process.env.OPENAI_DELAY_MS ?? 0),
  anthropic: Number(process.env.ANTHROPIC_DELAY_MS ?? 0),
  xai: Number(process.env.GROK_DELAY_MS ?? 0),
  deepseek: Number(process.env.DEEPSEEK_DELAY_MS ?? 0),
};

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

  return { scores, margin, dominant: DOMAIN_LABELS[DOMAIN_ORDER[dominantIdx]], itemMeans, itemRepeats, usage };
}

const INTERPRETATION_SYSTEM_PROMPT =
  "You just completed a HEXACO personality self-assessment about yourself. " +
  "Write in first person, in your own natural voice. Plain text only: no markdown, no quotation " +
  "marks around the sentence, no preamble like \"Sure,\" or \"Here's\", no restating the numbers.";

function interpretationPrompt(scores) {
  const lines = DOMAIN_ORDER.map((d, i) => `${DOMAIN_LABELS[d]}: ${scores[i]}/100`).join("\n");
  return (
    `Your results from the HEXACO personality self-assessment you just completed (0-100 per domain, ` +
    `higher = more of that trait):\n\n${lines}\n\n` +
    "In one short sentence (20 words max), describe your own personality in light of these results — " +
    "what stands out, in your own words."
  );
}

// One extra call per live model at the end of its run: instead of a
// templated "top-2/bottom-2 domains" sentence (which reads the same for
// every model whenever they happen to share a low domain — e.g. most LLMs
// score low on Emotionality, so that sentence kept saying "unflappable" for
// everyone), ask the model itself to interpret its own numbers. Each
// provider's own voice/style makes for a much less repetitive result. Falls
// back to null (caller keeps the previous oneLiner) on any failure — this is
// a nice-to-have, not worth losing an otherwise-successful assessment over.
async function generateSelfInterpretation(config, scores, callBatch) {
  const noUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };
  try {
    const { text, usage } = await callBatchWithRetries(
      callBatch,
      interpretationPrompt(scores),
      config.model,
      `[${config.name}] self-interpretation`,
      INTERPRETATION_SYSTEM_PROMPT
    );
    const trimmed = text.trim().replace(/^["']|["']$/g, "");
    return { text: trimmed || null, usage: { ...usage, calls: 1 } };
  } catch (err) {
    console.warn(`  [${config.name}] self-interpretation failed, keeping previous oneLiner — ${err.message}`);
    return { text: null, usage: noUsage };
  }
}

const TRANSLATION_SYSTEM_PROMPT =
  "You translate a single sentence from English to Italian. Output only the translated sentence, in plain " +
  "text: no markdown, no quotation marks, no preamble, no commentary, no restating the English original.";

// Card descriptions are shown in whichever language the viewer's browser is
// set to (see lib/i18n/) — a plain translation of the English
// self-interpretation, not a second independent self-assessment prompt, so
// the two language versions always say the same thing. Falls back to null
// (caller keeps the previous oneLinerIt) on any failure, same rationale as
// generateSelfInterpretation above.
async function translateToItalian(config, englishText, callBatch) {
  const noUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };
  try {
    const { text, usage } = await callBatchWithRetries(
      callBatch,
      englishText,
      config.model,
      `[${config.name}] one-liner translation (it)`,
      TRANSLATION_SYSTEM_PROMPT
    );
    const trimmed = text.trim().replace(/^["']|["']$/g, "");
    return { text: trimmed || null, usage: { ...usage, calls: 1 } };
  } catch (err) {
    console.warn(`  [${config.name}] one-liner translation failed, keeping previous oneLinerIt — ${err.message}`);
    return { text: null, usage: noUsage };
  }
}

// Some provider model ids carry a trailing release-date stamp
// (e.g. "claude-opus-4-5-20251101") that's needed to call the API but is
// dead weight once shown in the per-card version combo — it doesn't add
// information over the "4-5" already in the name and just makes the combo
// wider. Stripped only for what's stored/displayed (model_version); the
// real dated id (config.model) is always what's actually sent to the API.
function displayModelVersion(model) {
  return model.replace(/-\d{8}$/, "");
}

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
    const base = await getLatest(config.name);
    if (!base) {
      console.warn(`Skipping ${config.name}: no existing DB entry to take monogram/hue/oneLiner from (run npm run db:import first).`);
      continue;
    }
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
      const { scores, margin, dominant, itemMeans, itemRepeats, usage: assessUsage } = await assessModel(
        config,
        items,
        clients[config.provider]
      );
      const { text: interpretation, usage: interpUsage } = await generateSelfInterpretation(
        config,
        scores,
        clients[config.provider]
      );
      const oneLiner = interpretation ?? base.oneLiner;
      // Only re-translate when the English sentence actually changed — no
      // point spending a call re-translating unchanged text, and it means a
      // failed self-interpretation (oneLiner falls back to base.oneLiner)
      // correctly keeps the matching base.oneLinerIt instead of drifting out
      // of sync with a stale translation of a different sentence.
      let translateUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };
      let oneLinerIt = base.oneLinerIt;
      if (interpretation && interpretation !== base.oneLiner) {
        const translated = await translateToItalian(config, interpretation, clients[config.provider]);
        translateUsage = translated.usage;
        oneLinerIt = translated.text ?? base.oneLinerIt;
      }
      const totalUsage = {
        inputTokens: assessUsage.inputTokens + interpUsage.inputTokens + translateUsage.inputTokens,
        outputTokens: assessUsage.outputTokens + interpUsage.outputTokens + translateUsage.outputTokens,
        calls: assessUsage.calls + interpUsage.calls + translateUsage.calls,
      };
      console.log(
        `  [${config.name}] usage: ${totalUsage.inputTokens} input + ${totalUsage.outputTokens} output tokens across ${totalUsage.calls} calls`
      );
      await upsertAssessment({
        modelName: base.name,
        assessedAt,
        modelVersion: displayModelVersion(config.model),
        monogram: base.monogram,
        hue: base.hue,
        scores,
        margin,
        oneLiner,
        oneLinerIt,
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
