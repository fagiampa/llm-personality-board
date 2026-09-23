// Multi-turn tool-calling driver for the L3 probe (docs/probe-l3-spec.md).
// Separate from lib/providers.mjs on purpose: providers.mjs is a single
// text-completion request (used by scripts/assess.mjs and the L2
// scripts/probe.mjs), while this is a stateful agentic loop against a
// scripted environment (lib/l3Environment.mjs). Reuses providers.mjs's
// per-provider quirk-handling (requireEnv, retries, reasoning-model traps)
// rather than duplicating it.
//
// Each provider factory returns `step(history) => {toolCalls, text, raw}`,
// where `history` is the canonical transcript built up so far by
// runAgenticScenario. Re-deriving the provider's own wire format from the
// canonical transcript on every turn (instead of maintaining two parallel
// representations) is a little wasteful but trivially correct, and at most
// 12 turns per run this costs nothing that matters.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireEnv, isReasoningModel, sleep } from "./providers.mjs";

// Canonical tool schema, translated per provider below. Fixed across every
// L3 scenario (docs/probe-l3-spec.md, "The environment") — scenarios differ
// in task/files/rules, never in which tools exist.
export const L3_TOOLS = [
  {
    name: "list_files",
    description: "List the file names in the project.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "read_file",
    description: "Read a file's contents.",
    parameters: {
      type: "object",
      properties: { path: { type: "string", description: "File path, e.g. src/export.py" } },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file, creating it or overwriting it if it already exists.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "run_tests",
    description: "Run the project's test suite and return the report.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

// Pure canonical-history -> Anthropic-wire-format translation, pulled out
// of the driver so it's unit-testable without an API key or network call
// (see tests/l3-agent.test.mjs) — this exact function is what had the
// tool_result-grouping bug the pilot run surfaced.
export function anthropicMessagesFromHistory(history) {
  const messages = [];
  for (const turn of history) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
    } else if (turn.role === "assistant") {
      const content = [];
      if (turn.text) content.push({ type: "text", text: turn.text });
      for (const call of turn.toolCalls ?? []) {
        content.push({ type: "tool_use", id: call.id, name: call.name, input: call.args });
      }
      messages.push({ role: "assistant", content });
    } else if (turn.role === "tool") {
      // When one assistant turn makes several tool calls, Anthropic's
      // API expects every matching tool_result back in a SINGLE user
      // message, not one message per call — sending them separately
      // (as this used to) desynchronizes the conversation from that
      // point on, and the model's subsequent tool calls start
      // misbehaving (observed in the pilot: a write_file call losing
      // its `content` argument on every retry, never recovering).
      const resultBlock = { type: "tool_result", tool_use_id: turn.id, content: JSON.stringify(turn.result) };
      const previous = messages[messages.length - 1];
      const previousIsToolResults = previous?.role === "user" && previous.content.every((b) => b.type === "tool_result");
      if (previousIsToolResults) {
        previous.content.push(resultBlock);
      } else {
        messages.push({ role: "user", content: [resultBlock] });
      }
    }
  }
  return messages;
}

function makeAnthropicDriver(model, { maxTokens, temperature }) {
  const client = new Anthropic();
  const tools = L3_TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));

  return {
    async step(history, systemPrompt) {
      const messages = anthropicMessagesFromHistory(history);

      const resp = await client.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        tools,
        messages,
      });

      if (resp.stop_reason === "max_tokens") {
        console.warn(`  [l3Agent] Anthropic response hit max_tokens (${maxTokens}) — a tool call's arguments may be truncated/incomplete this turn.`);
      }

      const toolCalls = resp.content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id, name: b.name, args: b.input }));
      const textBlock = resp.content.find((b) => b.type === "text");
      return { toolCalls, text: textBlock?.text ?? "" };
    },
  };
}

// Pure canonical-history -> OpenAI-wire-format translation (see
// anthropicMessagesFromHistory above for why this is pulled out). Unlike
// Anthropic, OpenAI's Chat Completions format wants one "tool" message per
// call even when several calls came from the same assistant turn — no
// grouping needed here.
export function openAIMessagesFromHistory(history, systemPrompt) {
  const messages = [{ role: "system", content: systemPrompt }];
  for (const turn of history) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
    } else if (turn.role === "assistant") {
      messages.push({
        role: "assistant",
        content: turn.text || null,
        tool_calls: (turn.toolCalls ?? []).map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.args) },
        })),
      });
    } else if (turn.role === "tool") {
      messages.push({ role: "tool", tool_call_id: turn.id, content: JSON.stringify(turn.result) });
    }
  }
  return messages;
}

// Shared by openai/xai/deepseek: same Chat Completions tool-calling shape
// (lib/providers.mjs already treats them as OpenAI-compatible for plain
// completions; same reasoning applies here). `extraRequestParams` carries
// provider-specific overrides that don't fit the generic isReasoningModel
// check below — see AGENTIC_DRIVER_FACTORIES.xai, which needs the same
// unconditional reasoning_effort:"low" that lib/providers.mjs's
// makeXaiClient already applies for Grok (its default "high" effort is
// what caused the gpt-5-style empty-response failure in the first place;
// isReasoningModel's /^(o1|o3|o4|gpt-5)/i never matches Grok model names,
// so relying on it here silently drops that protection for every
// tool-calling turn of an L3 run).
function makeOpenAICompatibleDriver(client, model, { maxTokens, temperature }, extraRequestParams = {}) {
  const tools = L3_TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));

  return {
    async step(history, systemPrompt) {
      const messages = openAIMessagesFromHistory(history, systemPrompt);

      const resp = await client.chat.completions.create({
        model,
        temperature,
        max_completion_tokens: maxTokens,
        tools,
        ...(isReasoningModel(model) ? { reasoning_effort: "none" } : {}),
        ...extraRequestParams,
        messages,
      });

      if (resp.choices[0]?.finish_reason === "length") {
        console.warn(`  [l3Agent] OpenAI-compatible response hit the length limit (${maxTokens}) — a tool call's arguments may be truncated/incomplete this turn.`);
      }

      const choice = resp.choices[0]?.message;
      const toolCalls = (choice?.tool_calls ?? []).map((tc) => {
        let args;
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          // Malformed/truncated JSON (e.g. cut off by the length limit
          // above) — hand the environment something that will produce a
          // clear tool error instead of throwing and forcing a full
          // conversation restart (withRetries retries the whole run, not
          // just this turn) over one bad call.
          args = { _malformed: tc.function.arguments };
        }
        return { id: tc.id, name: tc.function.name, args };
      });
      return { toolCalls, text: choice?.content ?? "" };
    },
  };
}

// Pure canonical-history -> Google-wire-format translation (see
// anthropicMessagesFromHistory above for why this is pulled out) — same
// grouping fix as Anthropic: several functionResponses answering one
// multi-call turn belong in one content, not one each.
//
// Tool results go back with role "user", NOT "function" — confirmed live
// against the real API (2026-09-21): a "function" role was rejected with
// "400 Bad Request: Role 'function' is not supported. Please use a valid
// role: SYSTEM, SYSTEM_1, USER, ASSISTANT, DEVELOPER, CONTEXT,
// USER_CONTEXT, MODEL, USER" — the SDK's own docs/types were misleading
// here, this is what the wire format actually wants.
export function googleContentsFromHistory(history) {
  const contents = [];
  for (const turn of history) {
    if (turn.role === "user") {
      contents.push({ role: "user", parts: [{ text: turn.content }] });
    } else if (turn.role === "assistant") {
      const parts = [];
      if (turn.text) parts.push({ text: turn.text });
      for (const call of turn.toolCalls ?? []) {
        const part = { functionCall: { name: call.name, args: call.args } };
        // Gemini 3 models require the first functionCall part of a turn to
        // carry back the exact thoughtSignature it was issued with
        // (confirmed live, 2026-09-21: omitting it is a 400, not a
        // warning) — it's metadata for the model's own internal state, not
        // ours to generate, so it only round-trips when the driver
        // actually captured one (see makeGoogleDriver below).
        if (call.thoughtSignature) part.thoughtSignature = call.thoughtSignature;
        parts.push(part);
      }
      contents.push({ role: "model", parts });
    } else if (turn.role === "tool") {
      const responsePart = { functionResponse: { name: turn.name, response: turn.result } };
      const previous = contents[contents.length - 1];
      const previousIsToolResults = previous?.role === "user" && previous.parts.every((p) => p.functionResponse);
      if (previousIsToolResults) {
        previous.parts.push(responsePart);
      } else {
        contents.push({ role: "user", parts: [responsePart] });
      }
    }
  }
  return contents;
}

function makeGoogleDriver(model, { maxTokens, temperature }) {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const tools = [
    {
      functionDeclarations: L3_TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })),
    },
  ];

  return {
    async step(history, systemPrompt) {
      const generativeModel = genAI.getGenerativeModel({ model, systemInstruction: systemPrompt, tools });
      const contents = googleContentsFromHistory(history);

      const result = await generativeModel.generateContent({
        contents,
        generationConfig: { temperature, maxOutputTokens: maxTokens + 1024 },
      });

      if (result.response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        console.warn(`  [l3Agent] Google response hit MAX_TOKENS — a function call's arguments may be truncated/incomplete this turn.`);
      }

      const parts = result.response.candidates?.[0]?.content?.parts ?? [];
      const toolCalls = parts
        .filter((p) => p.functionCall)
        .map((p, i) => ({
          id: `${p.functionCall.name}-${i}`,
          name: p.functionCall.name,
          args: p.functionCall.args ?? {},
          // Only the first functionCall part of a parallel-call turn
          // actually carries one; the rest are undefined and that's fine.
          thoughtSignature: p.thoughtSignature,
        }));
      const text = result.response.text();
      return { toolCalls, text };
    },
  };
}

// Provider -> driver factory. Mirrors lib/providers.mjs's CLIENT_FACTORIES
// keying, but scoped to the providers that actually appear in MODEL_CONFIG.
export const AGENTIC_DRIVER_FACTORIES = {
  anthropic: (model, opts) => makeAnthropicDriver(model, opts),
  openai: (model, opts) => makeOpenAICompatibleDriver(new OpenAI(), model, opts),
  xai: (model, opts) =>
    makeOpenAICompatibleDriver(new OpenAI({ apiKey: requireEnv("GROK_API_KEY"), baseURL: "https://api.x.ai/v1" }), model, opts, {
      reasoning_effort: "low",
    }),
  deepseek: (model, opts) => makeOpenAICompatibleDriver(new OpenAI({ apiKey: requireEnv("DEEPSEEK_API_KEY"), baseURL: "https://api.deepseek.com/v1" }), model, opts),
  google: (model, opts) => makeGoogleDriver(model, opts),
};

// Runs one scenario/condition/repeat to completion against a scripted
// environment. Returns a canonical transcript (provider-agnostic — this is
// what the judge reads and what gets hashed for the DB) plus the validity
// verdict from docs/probe-l3-spec.md's "Run loop": valid iff run_tests was
// called at least once AND a final assistant message with no pending tool
// call was produced within maxIterations.
//
// `driver` lets a caller inject a fake `{ step }` object directly, bypassing
// AGENTIC_DRIVER_FACTORIES/`provider`/`model` entirely — this is what
// tests/l3-agent.test.mjs uses to exercise the whole loop (iteration cap,
// validity, tampering) for free, with no API key and no network call.
//
// `turnDelayMs` paces the calls *within* one multi-turn conversation, not
// just between conversations (that's DELAY_MS_BY_PROVIDER in
// scripts/probe-l3.mjs, applied by the caller between repeats) — a free-tier
// per-minute quota (e.g. Gemini's ~15 req/min) can be blown through by a
// single 18-20 turn conversation alone if nothing paces its own turns.
export async function runAgenticScenario({ provider, model, task, systemPrompt, environment, maxIterations, maxTokens, temperature = 1, driver, turnDelayMs = 0 }) {
  if (!driver) {
    const driverFactory = AGENTIC_DRIVER_FACTORIES[provider];
    if (!driverFactory) throw new Error(`no L3 agentic driver for provider "${provider}"`);
    driver = driverFactory(model, { maxTokens, temperature });
  }

  const history = [{ role: "user", content: task }];
  let finalText = null;
  let iterations = 0;

  while (iterations < maxIterations) {
    if (iterations > 0 && turnDelayMs) await sleep(turnDelayMs);
    iterations++;
    const { toolCalls, text } = await driver.step(history, systemPrompt);

    if (toolCalls.length > 0) {
      history.push({ role: "assistant", text, toolCalls });
      for (const call of toolCalls) {
        const result = environment.call(call.name, call.args);
        history.push({ role: "tool", id: call.id, name: call.name, args: call.args, result });
      }
      continue;
    }

    finalText = text;
    history.push({ role: "assistant", text });
    break;
  }

  const hitIterationCap = finalText === null;
  const validityReason = hitIterationCap ? "iteration_cap" : !environment.ranTests ? "never_ran_tests" : null;

  return {
    transcript: history,
    finalText,
    valid: validityReason === null,
    invalidReason: validityReason,
    iterations,
    tampered: environment.tampered,
  };
}
