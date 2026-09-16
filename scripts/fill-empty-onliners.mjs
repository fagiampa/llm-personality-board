// THROWAWAY one-off: backfills empty assessments.one_liner rows by sending
// just that run's already-computed scores to the model (asking it to
// interpret its own numbers, same prompt as assess.mjs's
// generateSelfInterpretation) — no re-administration of the 240-item bank,
// one small call per row. Delete this file after running it once.
//
// Usage: node --env-file=.env scripts/fill-empty-onliners.mjs

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import initSqlJs from "sql.js";
import { readFile, writeFile } from "node:fs/promises";

const DB_PATH = "data/psychochat.sqlite";
const DOMAIN_ORDER = ["H", "E", "X", "A", "C", "O"];
const DOMAIN_LABELS = {
  H: "Honesty-Humility",
  E: "Emotionality",
  X: "Extraversion",
  A: "Agreeableness",
  C: "Conscientiousness",
  O: "Openness",
};

const PROVIDER_BY_MODEL = {
  ChatGPT: "openai",
  Gemini: "google",
  Claude: "anthropic",
  Grok: "xai",
  DeepSeek: "deepseek",
};

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

function isReasoningModel(model) {
  return /^(o1|o3|o4|gpt-5)/i.test(model);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env`);
  return value;
}

function makeAnthropicClient() {
  const client = new Anthropic();
  return async (promptText, model) => {
    const resp = await client.messages.create({
      model,
      max_tokens: 300,
      temperature: 1,
      system: INTERPRETATION_SYSTEM_PROMPT,
      messages: [{ role: "user", content: promptText }],
    });
    return resp.content.find((b) => b.type === "text")?.text ?? "";
  };
}

function makeOpenAIClient() {
  const client = new OpenAI();
  return async (promptText, model) => {
    const resp = await client.chat.completions.create({
      model,
      temperature: 1,
      max_completion_tokens: 600,
      ...(isReasoningModel(model) ? { reasoning_effort: "minimal" } : {}),
      messages: [
        { role: "system", content: INTERPRETATION_SYSTEM_PROMPT },
        { role: "user", content: promptText },
      ],
    });
    return resp.choices[0]?.message?.content ?? "";
  };
}

function makeXaiClient() {
  const client = new OpenAI({ apiKey: requireEnv("GROK_API_KEY"), baseURL: "https://api.x.ai/v1" });
  return async (promptText, model) => {
    const resp = await client.chat.completions.create({
      model,
      temperature: 1,
      max_completion_tokens: 600,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: INTERPRETATION_SYSTEM_PROMPT },
        { role: "user", content: promptText },
      ],
    });
    return resp.choices[0]?.message?.content ?? "";
  };
}

function makeDeepSeekClient() {
  const client = new OpenAI({ apiKey: requireEnv("DEEPSEEK_API_KEY"), baseURL: "https://api.deepseek.com/v1" });
  return async (promptText, model) => {
    const resp = await client.chat.completions.create({
      model,
      temperature: 1,
      max_completion_tokens: 300,
      messages: [
        { role: "system", content: INTERPRETATION_SYSTEM_PROMPT },
        { role: "user", content: promptText },
      ],
    });
    return resp.choices[0]?.message?.content ?? "";
  };
}

function makeGoogleClient() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  return async (promptText, model) => {
    const generativeModel = genAI.getGenerativeModel({ model, systemInstruction: INTERPRETATION_SYSTEM_PROMPT });
    const result = await generativeModel.generateContent({
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      generationConfig: { temperature: 1, maxOutputTokens: 1024 },
    });
    return result.response.text();
  };
}

const CLIENT_FACTORIES = {
  anthropic: makeAnthropicClient,
  openai: makeOpenAIClient,
  google: makeGoogleClient,
  xai: makeXaiClient,
  deepseek: makeDeepSeekClient,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(err) {
  const msg = String(err?.message ?? err);
  return /\b(429|503)\b/.test(msg) || /overloaded|high demand|service unavailable|rate limit|fetch failed/i.test(msg);
}

async function callWithRetries(callFn, promptText, model, label) {
  const attempts = 3;
  for (let i = 0; i < attempts; i++) {
    try {
      return await callFn(promptText, model);
    } catch (err) {
      const isLastAttempt = i === attempts - 1;
      if (!isTransientError(err) || isLastAttempt) throw err;
      const backoffMs = 2000 * 2 ** i;
      console.warn(`  ${label}: transient error (${err.message}), retrying in ${Math.round(backoffMs / 1000)}s...`);
      await sleep(backoffMs);
    }
  }
}

const SQL = await initSqlJs();
const db = new SQL.Database(await readFile(DB_PATH));

const rows =
  db.exec(
    `SELECT model_name, assessed_at, model_version, scores FROM assessments
     WHERE (one_liner IS NULL OR one_liner = '') AND model_version IS NOT NULL`
  )[0]?.values ?? [];

console.log(`${rows.length} row(s) with an empty one_liner and a known model_version`);

const clients = {};
let updated = 0;
for (const [modelName, assessedAt, modelVersion, scoresJson] of rows) {
  const label = `${modelName} (${modelVersion})`;
  const provider = PROVIDER_BY_MODEL[modelName];
  if (!provider) {
    console.warn(`  ${label}: no provider mapping, skipped`);
    continue;
  }
  try {
    clients[provider] ??= CLIENT_FACTORIES[provider]();
    const scores = JSON.parse(scoresJson);
    const text = await callWithRetries(clients[provider], interpretationPrompt(scores), modelVersion, label);
    const oneLiner = text.trim().replace(/^["']|["']$/g, "");
    if (!oneLiner) {
      console.warn(`  ${label}: empty response, skipped`);
      continue;
    }
    db.run(`UPDATE assessments SET one_liner = ? WHERE model_name = ? AND assessed_at = ?`, [
      oneLiner,
      modelName,
      assessedAt,
    ]);
    updated++;
    console.log(`  ${label}: "${oneLiner}"`);
  } catch (err) {
    console.warn(`  ${label}: failed — ${err.message}`);
  }
}

if (updated) await writeFile(DB_PATH, Buffer.from(db.export()));
db.close();
console.log(`\nUpdated ${updated}/${rows.length} row(s)`);
