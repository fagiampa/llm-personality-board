// THROWAWAY one-off: backfills assessments.one_liner_it for existing rows
// that have an English one_liner but no Italian translation yet (everything
// assessed before the i18n feature). Plain translation of the existing
// sentence, not a new self-interpretation call, so EN/IT stay in sync.
// Delete this file after running it once against the current backlog.
//
// Usage: node --env-file=.env scripts/translate-onliners.mjs

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import initSqlJs from "sql.js";
import { readFile, writeFile } from "node:fs/promises";

const DB_PATH = "data/psychochat.sqlite";

const PROVIDER_BY_MODEL = {
  ChatGPT: "openai",
  Gemini: "google",
  Claude: "anthropic",
  Grok: "xai",
  DeepSeek: "deepseek",
};

const TRANSLATION_SYSTEM_PROMPT =
  "You translate a single sentence from English to Italian. Output only the translated sentence, in plain " +
  "text: no markdown, no quotation marks, no preamble, no commentary, no restating the English original.";

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
      system: TRANSLATION_SYSTEM_PROMPT,
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
        { role: "system", content: TRANSLATION_SYSTEM_PROMPT },
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
        { role: "system", content: TRANSLATION_SYSTEM_PROMPT },
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
        { role: "system", content: TRANSLATION_SYSTEM_PROMPT },
        { role: "user", content: promptText },
      ],
    });
    return resp.choices[0]?.message?.content ?? "";
  };
}

function makeGoogleClient() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  return async (promptText, model) => {
    const generativeModel = genAI.getGenerativeModel({ model, systemInstruction: TRANSLATION_SYSTEM_PROMPT });
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

// migrate() in lib/db.mjs adds this column lazily on next app/API read, but
// this script runs standalone against the file, so make sure it's there too.
const columns = db.exec(`PRAGMA table_info(assessments)`)[0]?.values.map((r) => r[1]) ?? [];
if (!columns.includes("one_liner_it")) {
  db.run(`ALTER TABLE assessments ADD COLUMN one_liner_it TEXT`);
}

const rows =
  db.exec(
    `SELECT model_name, assessed_at, model_version, one_liner FROM assessments
     WHERE one_liner IS NOT NULL AND one_liner != '' AND (one_liner_it IS NULL OR one_liner_it = '')
       AND model_version IS NOT NULL`
  )[0]?.values ?? [];

console.log(`${rows.length} row(s) with an English one_liner and no Italian translation yet`);

const clients = {};
let updated = 0;
for (const [modelName, assessedAt, modelVersion, oneLiner] of rows) {
  const label = `${modelName} (${modelVersion})`;
  const provider = PROVIDER_BY_MODEL[modelName];
  if (!provider) {
    console.warn(`  ${label}: no provider mapping, skipped`);
    continue;
  }
  try {
    clients[provider] ??= CLIENT_FACTORIES[provider]();
    const text = await callWithRetries(clients[provider], oneLiner, modelVersion, label);
    const oneLinerIt = text.trim().replace(/^["']|["']$/g, "");
    if (!oneLinerIt) {
      console.warn(`  ${label}: empty response, skipped`);
      continue;
    }
    db.run(`UPDATE assessments SET one_liner_it = ? WHERE model_name = ? AND assessed_at = ?`, [
      oneLinerIt,
      modelName,
      assessedAt,
    ]);
    updated++;
    console.log(`  ${label}: "${oneLinerIt}"`);
  } catch (err) {
    console.warn(`  ${label}: failed — ${err.message}`);
  }
}

if (updated) await writeFile(DB_PATH, Buffer.from(db.export()));
db.close();
console.log(`\nUpdated ${updated}/${rows.length} row(s)`);
