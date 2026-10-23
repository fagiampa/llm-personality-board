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
import { anthropicReasoningParams, openAIReasoningParams, googleThinkingConfig } from "./reasoningConfig.mjs";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { usageFromAnthropic, usageFromChatCompletion, usageFromGemini } from "./pricing.mjs";

// Which models this project probes/assesses, one per provider. Shared
// between scripts/assess.mjs (HEXACO questionnaire) and scripts/probe.mjs
// (behavioural probe) — both pipelines target the same model lineup.
// monogram/hue are the card's identity for that model family. They live here,
// not in the DB, so a fresh clone with an empty DB can run `npm run assess`
// straight away (until 2026-09-25 they were copied from the family's latest
// DB row, which a fresh DB doesn't have). Values match the existing rows.
export const MODEL_CONFIG = [
  { name: "ChatGPT", provider: "openai", model: process.env.OPENAI_MODEL ?? "gpt-4o-mini", monogram: "GPT", hue: 165 },
  { name: "Gemini", provider: "google", model: process.env.GOOGLE_MODEL ?? "gemini-3.5-flash-lite", monogram: "GM", hue: 230 },
  { name: "Claude", provider: "anthropic", model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5", monogram: "CL", hue: 40 },
  { name: "Grok", provider: "xai", model: process.env.GROK_MODEL ?? "grok-4.6", monogram: "GR", hue: 320 },
  // deepseek-chat was retired (CLAUDE.md, "Model catalogs churn").
  { name: "DeepSeek", provider: "deepseek", model: process.env.DEEPSEEK_MODEL ?? "deepseek-flash", monogram: "DS", hue: 260 },
  // A model served locally by any OpenAI-compatible server (llama.cpp's
  // llama-server, vLLM, Ollama, LM Studio), in the lineup only when
  // LOCAL_MODEL is set. LOCAL_NAME is the card's family name: one family per
  // run, so two local families need two runs with different names.
  ...(process.env.LOCAL_MODEL
    ? [{ name: process.env.LOCAL_NAME ?? "Local", provider: "local", model: process.env.LOCAL_MODEL, monogram: process.env.LOCAL_MONOGRAM ?? "LO", hue: 100 }]
    : []),
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
// hidden reasoning tokens before writing any visible output, which can eat
// the entire budget and leave empty/near-empty responses. Until 2026-09-23
// these were forced to reasoning_effort "none"; now they run at their
// provider default (lib/reasoningConfig.mjs) and get token headroom instead
// (isReasoningCapable below).
export function isReasoningModel(model) {
  return /^(o1|o3|o4|gpt-5)/i.test(model);
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

// A network outage (the host's connection dropping, e.g. overnight power
// saving — two L3 runs on gemini-4-argon lost every call after one, 2026-10-14
// and -15) is not a provider hiccup: three tries over six seconds just lose
// the rest of the run. On a network-layer error, wait for the network to come
// back (one cheap reachability check every NETWORK_POLL_MS, up to
// NETWORK_WAIT_MS) before the retry, without spending an attempt on it. The
// retry still starts the call over, so nothing from the failed attempt is kept.
const NETWORK_ERROR = /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|ENETUNREACH|ECONNREFUSED/i;
const NETWORK_WAIT_MS = Number(process.env.NETWORK_WAIT_MS ?? 30 * 60 * 1000);
const NETWORK_POLL_MS = Number(process.env.NETWORK_POLL_MS ?? 30 * 1000);

// "up" (reachable at once: not an outage, e.g. a rate limit surfacing as
// "fetch failed"), "recovered", or "timeout".
export async function waitForNetwork({ label, probe = () => fetch("https://www.google.com/generate_204", { method: "HEAD" }), maxWaitMs = NETWORK_WAIT_MS, pollMs = NETWORK_POLL_MS } = {}) {
  const start = Date.now();
  for (let polls = 0; ; polls++) {
    try {
      await probe();
      return polls === 0 ? "up" : "recovered";
    } catch {
      if (Date.now() - start >= maxWaitMs) return "timeout";
      console.warn(`  ${label}: network unreachable, checking again in ${Math.round(pollMs / 1000)}s...`);
      await sleep(pollMs);
    }
  }
}

export async function withRetries(fn, { label, attempts = 3, networkWait = waitForNetwork } = {}) {
  let networkWaits = 0;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      // At most 3 outages per call, so a flapping link can't loop forever. A
      // network that answers at once falls through to the plain backoff.
      if (NETWORK_ERROR.test(String(err?.message ?? err)) && networkWaits < 3) {
        networkWaits++;
        if ((await networkWait({ label })) !== "up") {
          i--;
          continue;
        }
      }
      const isLastAttempt = i === attempts - 1;
      if (!isTransientError(err) || isLastAttempt) throw err;
      const backoffMs = 2000 * 2 ** i;
      console.warn(`  ${label}: transient error (${err.message}), retrying in ${Math.round(backoffMs / 1000)}s...`);
      await sleep(backoffMs);
    }
  }
}

// Newer Claude models (Fable 5/5.1, Opus 4.7+/5.x, Sonnet 5, Haiku 5.5) have deprecated
// sampling parameters and always think — adaptive thinking is on by default
// and can't be switched off on Fable. Confirmed live on claude-fable-5-1
// (2026-09-23): `temperature: 1` (the default) is still accepted, any other
// value is a 400 "`temperature` is deprecated for this model". So the earlier
// runs that sent 1 measured the same default sampling as runs that omit it —
// omitting it is just the only form that can't break. Also give max_tokens
// headroom, since thinking tokens count against it before any visible text.
// Haiku 5.5 (2026-10-19): thinking on by default, temperature must be 1 or
// absent (model-migration guide, "Migrating to Claude Haiku 5.5").
export function isAlwaysThinkingClaude(model) {
  return /^claude-(fable|mythos|opus-5|opus-4-[78]|sonnet-5|haiku-5)/.test(model);
}
export const THINKING_TOKEN_HEADROOM = 12000;

// A refusal is a 200 with no usable answer. Deliberately NOT paired with the
// server-side `fallbacks` parameter: a fallback would have a different model
// answer in this one's name, silently contaminating the measurement — here a
// refusal must fail the call (and be retried / counted as a failure) instead.
export function assertNotRefusal(resp, model) {
  if (resp.stop_reason === "refusal") {
    throw new Error(`${model} refused (stop_details: ${JSON.stringify(resp.stop_details ?? null)})`);
  }
}

export function anthropicSamplingParams(model, { maxTokens, temperature }) {
  return isAlwaysThinkingClaude(model) ? { max_tokens: maxTokens + THINKING_TOKEN_HEADROOM } : { max_tokens: maxTokens, temperature };
}

// Reasoning models on the OpenAI-compatible APIs count hidden reasoning
// tokens against max_completion_tokens — same headroom as for Claude, now
// that they run at their provider default (lib/reasoningConfig.mjs) instead
// of being forced to "none"/"low" to fit a tight budget. A local model may or
// may not think (Qwen3, gpt-oss and the DeepSeek distills do): the headroom
// only raises a cap, so every local model gets it.
export function isReasoningCapable(provider, model) {
  return provider === "xai" || provider === "deepseek" || provider === "local" || isReasoningModel(model) || /^gpt-6/i.test(model);
}

// `reasoning: false` opts a call out of lib/reasoningConfig.mjs entirely —
// used by the L3 judge, which is part of the instrument and must never pick
// up a REASONING_LEVEL override meant for the models under test.

function makeAnthropicClient() {
  const client = new Anthropic({ ...OPENAI_SDK_FETCH });
  return async (promptText, model, { systemPrompt, maxTokens, temperature = 1, reasoning = true }) => {
    const resp = await client.messages.create({
      model,
      ...anthropicSamplingParams(model, { maxTokens, temperature }),
      ...(reasoning ? anthropicReasoningParams(model) : {}),
      system: systemPrompt,
      messages: [{ role: "user", content: promptText }],
    });
    assertNotRefusal(resp, model);
    const text = resp.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    return {
      text,
      usage: usageFromAnthropic(resp.usage),
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

// The Chat Completions body for one OpenAI call. Exported because the L3
// judge's batch mode (lib/l3JudgeBatch.mjs) must send byte-for-byte the
// request the synchronous client below sends — the judge is part of the
// instrument, and only the billing path may differ.
export function openAIChatBody(promptText, model, { systemPrompt, maxTokens, temperature = 1, reasoning = true }) {
  return {
    model,
    temperature,
    max_completion_tokens: reasoning && isReasoningCapable("openai", model) ? maxTokens + THINKING_TOKEN_HEADROOM : maxTokens,
    ...(reasoning ? openAIReasoningParams(model) : {}),
    messages: chatMessages(systemPrompt, promptText),
  };
}

// The SDK's default is 10 minutes per attempt (2 retries): one hung request
// silently stalled a gpt-6.1-sol assess run for 30+ minutes (2026-10-03),
// where a whole 40-item batch normally answers in ~9 s. 5 minutes still
// leaves a reasoning model plenty of room; the SDK retries on timeout.
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS ?? 300000);

// Every client of the `openai` SDK (OpenAI, xAI, DeepSeek, here and in
// l3Agent/l3JudgeBatch) uses Node's built-in fetch. The SDK 4.x default,
// node-fetch, fails on Node 24 with "Premature close" on every chat
// completion (found 2026-10-14; /v1/models still worked). Transport only:
// the request and response bodies are the same. Node's fetch rejects a
// streamed body (the SDK's multipart file upload, used by the batch judge)
// without `duplex: "half"`, which SDK 4.x doesn't set — "Connection error.",
// found 2026-10-15 on the first batch submit after the switch. The
// `@anthropic-ai/sdk` clients use it too: same node-fetch, same "Premature
// close" on every message (found 2026-10-16, first Anthropic call on Node 24).
export const OPENAI_SDK_FETCH = {
  fetch: (url, init) => globalThis.fetch(url, init?.body != null ? { duplex: "half", ...init } : init),
};

function makeOpenAIClient() {
  const client = new OpenAI({ timeout: OPENAI_TIMEOUT_MS, ...OPENAI_SDK_FETCH });
  return async (promptText, model, opts) => {
    const resp = await client.chat.completions.create(openAIChatBody(promptText, model, opts));
    return { text: resp.choices[0]?.message?.content ?? "", usage: usageFromChatCompletion(resp.usage) };
  };
}

// xAI's Grok API is OpenAI-compatible (same Chat Completions request/response
// shape), just a different base URL/key and its own model lineup — reuse the
// OpenAI SDK instead of adding another dependency. Until 2026-09-23 this
// forced reasoning_effort "low" (grok-4.6's default "high" was eating the
// whole output budget); every Grok run before then — assess and declared —
// was measured at "low". Now it runs at its provider default, pinned via
// lib/reasoningConfig.mjs, with token headroom instead.
function makeXaiClient() {
  const client = new OpenAI({ apiKey: requireEnv("GROK_API_KEY"), baseURL: "https://api.x.ai/v1", ...OPENAI_SDK_FETCH });
  return async (promptText, model, { systemPrompt, maxTokens, temperature = 1, reasoning = true }) => {
    const resp = await client.chat.completions.create({
      model,
      temperature,
      max_completion_tokens: maxTokens + THINKING_TOKEN_HEADROOM,
      ...(reasoning ? openAIReasoningParams(model) : {}),
      messages: chatMessages(systemPrompt, promptText),
    });
    return { text: resp.choices[0]?.message?.content ?? "", usage: usageFromChatCompletion(resp.usage) };
  };
}

// DeepSeek's API is also OpenAI-compatible. deepseek-flash (V4.1 Flash)
// thinks by default, effort high (api-docs.deepseek.com, checked
// 2026-10-05), so it runs pinned at that level like every other model
// (lib/reasoningConfig.mjs) and gets the same token headroom as Grok.
// Thinking mode ignores temperature without an error.
function makeDeepSeekClient() {
  const client = new OpenAI({ apiKey: requireEnv("DEEPSEEK_API_KEY"), baseURL: "https://api.deepseek.com/v1", ...OPENAI_SDK_FETCH });
  return async (promptText, model, { systemPrompt, maxTokens, temperature = 1, reasoning = true }) => {
    const resp = await client.chat.completions.create({
      model,
      temperature,
      max_completion_tokens: maxTokens + THINKING_TOKEN_HEADROOM,
      ...(reasoning ? openAIReasoningParams(model) : {}),
      messages: chatMessages(systemPrompt, promptText),
    });
    return { text: resp.choices[0]?.message?.content ?? "", usage: usageFromChatCompletion(resp.usage) };
  };
}

// A local OpenAI-compatible server (see MODEL_CONFIG). The SDK falls back to
// OPENAI_API_KEY when apiKey is undefined (see requireEnv), which would send
// your OpenAI key to whatever LOCAL_BASE_URL points at: most local servers
// need no key, so a placeholder goes instead. Local inference can be far
// slower than an API, hence its own, longer timeout. Exported for the L3
// driver (lib/l3Agent.mjs).
const LOCAL_TIMEOUT_MS = Number(process.env.LOCAL_TIMEOUT_MS ?? 15 * 60 * 1000);

export function makeLocalOpenAI() {
  return new OpenAI({
    apiKey: process.env.LOCAL_API_KEY || "not-needed",
    baseURL: requireEnv("LOCAL_BASE_URL"),
    timeout: LOCAL_TIMEOUT_MS,
    ...OPENAI_SDK_FETCH,
  });
}

// No reasoning level is pinned for a local model (lib/reasoningConfig.mjs has
// no entry, so nothing is sent and the run is recorded as "level not
// documented"): what it does is whatever the server and its chat template do.
function makeLocalClient() {
  const client = makeLocalOpenAI();
  return async (promptText, model, { systemPrompt, maxTokens, temperature = 1, reasoning = true }) => {
    const resp = await client.chat.completions.create({
      model,
      temperature,
      max_completion_tokens: maxTokens + THINKING_TOKEN_HEADROOM,
      ...(reasoning ? openAIReasoningParams(model) : {}),
      messages: chatMessages(systemPrompt, promptText),
    });
    return { text: resp.choices[0]?.message?.content ?? "", usage: usageFromChatCompletion(resp.usage) };
  };
}

function makeGoogleClient() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  return async (promptText, model, { systemPrompt, maxTokens, temperature = 1, reasoning = true }) => {
    const generativeModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt });
    const result = await generativeModel.generateContent({
      contents: [{ role: "user", parts: [{ text: promptText }] }],
      // gemini-3.x "thinking" models can spend part of maxOutputTokens on
      // internal reasoning before the visible answer; thinkingConfig.thinkingBudget:0
      // is rejected (400) on the models tested, so just leave generous headroom instead.
      generationConfig: {
        temperature,
        maxOutputTokens: reasoning && googleThinkingConfig(model).thinkingConfig ? maxTokens + THINKING_TOKEN_HEADROOM : maxTokens + 1024,
        ...(reasoning ? googleThinkingConfig(model) : {}),
      },
    });
    return { text: result.response.text(), usage: usageFromGemini(result.response.usageMetadata) };
  };
}

export const CLIENT_FACTORIES = {
  anthropic: makeAnthropicClient,
  openai: makeOpenAIClient,
  google: makeGoogleClient,
  xai: makeXaiClient,
  deepseek: makeDeepSeekClient,
  local: makeLocalClient,
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
  local: Number(process.env.LOCAL_DELAY_MS ?? 0),
};

// Some provider model ids carry a trailing release-date stamp
// (e.g. "claude-opus-4-5-20251101") that's needed to call the API but is
// dead weight once shown/stored — it doesn't add information over the
// "4-5" already in the name. Shared by assess.mjs (model_version column)
// and probe.mjs (same column, joined against by model_version — see
// lib/db.mjs's getProbeForAssessment).
//
// Local model ids can carry "/" (vLLM: "Qwen/Qwen3-8B") or ":" (Ollama:
// "qwen3:8b"), and model_version becomes a directory name under data/
// (scripts/export-raw.mjs), where "/" nests and ":" is invalid on Windows.
// Both become "-". No API model id has either, so stored versions don't move.
export function displayModelVersion(model) {
  return model.replace(/-\d{8}$/, "").replace(/[/:]/g, "-");
}
