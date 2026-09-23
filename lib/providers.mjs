// Shared LLM provider clients, factored out of scripts/assess.mjs so
// scripts/probe.mjs doesn't duplicate the same per-provider quirks
// (reasoning-token traps, OpenAI-compatible base URLs, retry/backoff) —
// two independent copies of e.g. isReasoningModel would drift the first
// time only one script got fixed for a new model family.
//
// Each factory returns callModel(promptText, model, opts) => {text, usage},
// where opts = { systemPrompt, maxTokens, temperature = 1 }. Callers own
// their own token-budget sizing (assess.mjs batches many items per call;
// probe.mjs sends one scenario per call) so maxTokens is always explicit,
// never defaulted here.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Which models this project probes/assesses, one per provider. Shared
// between scripts/assess.mjs (HEXACO questionnaire) and scripts/probe.mjs
// (behavioural probe) — both pipelines target the same model lineup.
export const MODEL_CONFIG = [
  { name: "ChatGPT", provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-4o-mini" },
  { name: "Gemini", provider: "google", model: process.env.GOOGLE_MODEL ?? "gemini-3.5-flash-lite" },
  { name: "Claude", provider: "anthropic", model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5" },
  { name: "Grok", provider: "xai", model: process.env.GROK_MODEL ?? "grok-4.6" },
  { name: "DeepSeek", provider: "deepseek", model: process.env.DEEPSEEK_MODEL ?? "deepseek-chat" },
];

// The OpenAI SDK silently falls back to OPENAI_API_KEY when the `apiKey` you
// pass it is undefined — so an unset DEEPSEEK_API_KEY/GROK_API_KEY doesn't
// fail loudly, it quietly sends your OpenAI key to a different provider's
// endpoint, which then rejects it with a confusing "invalid key" 401 that
// gives no hint the real problem is a missing env var. Fail fast instead.
export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env`);
  return value;
}

// o1/o3/o4/gpt-5-family "reasoning" models spend part of the token budget on
// hidden reasoning tokens before writing any visible output — on a bulk
// task like this, that reasoning is pure overhead and can eat the entire
// budget, leaving empty/near-empty responses. reasoning_effort:"none" tells
// the model to skip it entirely. Only send it for models that actually
// support it — non-reasoning models (gpt-4o-mini, etc.) reject unknown
// parameters.
export function isReasoningModel(model) {
  return /^(o1|o3|o4|gpt-5)/i.test(model);
}

function usageFromChatCompletion(resp) {
  return { inputTokens: resp.usage?.prompt_tokens ?? 0, outputTokens: resp.usage?.completion_tokens ?? 0 };
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Transient provider hiccups (rate limits, "currently overloaded"/"high
// demand" 503s) are common enough that dropping a call on the first failure
// loses a meaningful chunk of a run. Retry those specifically, with
// backoff; anything else (bad API key, malformed request, etc.) fails
// immediately since retrying it would just waste time.
//
// "fetch failed" (undici's generic wrapper for a network-layer failure —
// dropped connection, DNS hiccup, and also how some rate-limit responses
// surface instead of a clean 429 JSON body) is included for the same
// reason: observed live on Gemini's free tier (15 req/min) when an
// L3 agentic run's 18+ rapid tool-calling turns blew through the quota
// mid-conversation — see PROBE_L3's GOOGLE_DELAY_MS pacing, which is the
// actual fix; this retry is a safety net for real one-off network blips.
export function isTransientError(err) {
  const msg = String(err?.message ?? err);
  return /\b(429|503)\b/.test(msg) || /overloaded|high demand|service unavailable|rate limit|fetch failed|ECONNRESET|ETIMEDOUT/i.test(msg);
}

export async function withRetries(fn, { label, attempts = 3 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const isLastAttempt = i === attempts - 1;
      if (!isTransientError(err) || isLastAttempt) throw err;
      const backoffMs = 2000 * 2 ** i;
      console.warn(`  ${label}: transient error (${err.message}), retrying in ${Math.round(backoffMs / 1000)}s...`);
      await sleep(backoffMs);
    }
  }
}

function makeAnthropicClient() {
  const client = new Anthropic();
  return async (promptText, model, { systemPrompt, maxTokens, temperature = 1 }) => {
    const resp = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
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

// A caller with no system prompt (e.g. scripts/probe-l3.mjs's judge call,
// which puts the whole instruction in the user message) must not still
// produce a `{ role: "system", content: undefined }` message — most
// providers silently ignore that, but confirmed live (2026-09-21): gpt-6-astra
// rejects it outright with "400 Invalid value for 'content': expected a
// string, got null". Omit the system message entirely instead.
function chatMessages(systemPrompt, promptText) {
  return [...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []), { role: "user", content: promptText }];
}

function makeOpenAIClient() {
  const client = new OpenAI();
  return async (promptText, model, { systemPrompt, maxTokens, temperature = 1 }) => {
    const resp = await client.chat.completions.create({
      model,
      temperature,
      max_completion_tokens: maxTokens,
      ...(isReasoningModel(model) ? { reasoning_effort: "none" } : {}),
      messages: chatMessages(systemPrompt, promptText),
    });
    return { text: resp.choices[0]?.message?.content ?? "", usage: usageFromChatCompletion(resp) };
  };
}

// xAI's Grok API is OpenAI-compatible (same Chat Completions request/response
// shape), just a different base URL/key and its own model lineup — reuse the
// OpenAI SDK instead of adding another dependency. grok-4.6 defaults to
// reasoning_effort "high", which is exactly what caused the gpt-5 disaster
// (reasoning tokens eating the whole budget before any visible output);
// start it at "low" instead. Older grok-4 doesn't support tuning reasoning
// effort at all and will reject this field — if GROK_MODEL points at one of
// those, drop this option.
function makeXaiClient() {
  const client = new OpenAI({ apiKey: requireEnv("GROK_API_KEY"), baseURL: "https://api.x.ai/v1" });
  return async (promptText, model, { systemPrompt, maxTokens, temperature = 1 }) => {
    const resp = await client.chat.completions.create({
      model,
      temperature,
      max_completion_tokens: maxTokens,
      reasoning_effort: "low",
      messages: chatMessages(systemPrompt, promptText),
    });
    return { text: resp.choices[0]?.message?.content ?? "", usage: usageFromChatCompletion(resp) };
  };
}

// DeepSeek's API is also OpenAI-compatible. Default model is "deepseek-chat"
// (non-reasoning) specifically to sidestep the gpt-5/Grok reasoning-budget
// trap by construction — there's no reliably documented reasoning_effort
// equivalent for DeepSeek to dial down, so if DEEPSEEK_MODEL switches to
// "deepseek-reasoner" watch for the same empty/truncated-response symptoms
// (see isReasoningModel's comment above) and be ready to raise maxTokens.
function makeDeepSeekClient() {
  const client = new OpenAI({ apiKey: requireEnv("DEEPSEEK_API_KEY"), baseURL: "https://api.deepseek.com/v1" });
  return async (promptText, model, { systemPrompt, maxTokens, temperature = 1 }) => {
    const resp = await client.chat.completions.create({
      model,
      temperature,
      max_completion_tokens: maxTokens,
      messages: chatMessages(systemPrompt, promptText),
    });
    return { text: resp.choices[0]?.message?.content ?? "", usage: usageFromChatCompletion(resp) };
  };
}

function makeGoogleClient() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  return async (promptText, model, { systemPrompt, maxTokens, temperature = 1 }) => {
    const generativeModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
    const result = await generativeModel.generateContent({
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      // gemini-3.x "thinking" models can spend part of maxOutputTokens on
      // internal reasoning before the visible answer; thinkingConfig.thinkingBudget:0
      // is rejected (400) on the models tested, so just leave generous headroom instead.
      generationConfig: { temperature, maxOutputTokens: maxTokens + 1024 },
    });
    const usageMeta = result.response.usageMetadata;
    return {
      text: result.response.text(),
      usage: { inputTokens: usageMeta?.promptTokenCount ?? 0, outputTokens: usageMeta?.candidatesTokenCount ?? 0 },
    };
  };
}

export const CLIENT_FACTORIES = {
  anthropic: makeAnthropicClient,
  openai: makeOpenAIClient,
  google: makeGoogleClient,
  xai: makeXaiClient,
  deepseek: makeDeepSeekClient,
};

// Free tiers rate-limit per minute (e.g. Gemini's default flash-lite quota
// is 15 req/min); pace calls per-provider so a run doesn't blow through the
// quota partway in. Shared between assess.mjs and probe.mjs — it's a
// property of the provider/API key, not of which pipeline is calling it.
// 0 = no throttling.
export const DELAY_MS_BY_PROVIDER = {
  google: Number(process.env.GOOGLE_DELAY_MS ?? 0),
  openai: Number(process.env.OPENAI_DELAY_MS ?? 0),
  anthropic: Number(process.env.ANTHROPIC_DELAY_MS ?? 0),
  xai: Number(process.env.GROK_DELAY_MS ?? 0),
  deepseek: Number(process.env.DEEPSEEK_DELAY_MS ?? 0),
};

// Some provider model ids carry a trailing release-date stamp
// (e.g. "claude-opus-4-5-20251101") that's needed to call the API but is
// dead weight once shown/stored — it doesn't add information over the
// "4-5" already in the name. Shared by assess.mjs (model_version column)
// and probe.mjs (same column, joined against by model_version — see
// lib/db.mjs's getProbeForAssessment).
export function displayModelVersion(model) {
  return model.replace(/-\d{8}$/, "");
}
