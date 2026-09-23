// How much each model under test is allowed to reason, per request.
//
// Policy (decided 2026-09-23): every model runs at its provider's default
// reasoning level — the model as a caller actually gets it — and that
// default is sent explicitly rather than omitted, for two reasons:
//
// 1. What gets recorded is guaranteed to be what ran. Omitting the
//    parameter only tells you what the documentation said the default was
//    that day, not what the API did.
// 2. The time series can't shift on its own. Providers do change defaults
//    (Claude Opus 5.5 moved to "medium" where Opus 5 was "high"); an omitted
//    parameter would silently change the configuration under the same
//    model string. Same logic as fixed anchors (CLAUDE.md, rule 2).
//
// A model whose default isn't documented keeps the parameter omitted and is
// recorded as `level: null` ("provider default, level not documented") —
// never a guessed value. A model not in the table (debug/pilot models) also
// runs unpinned and is recorded the same way.
//
// REASONING_LEVEL=<level> overrides the level for a run (e.g. to study the
// effect of reasoning depth on report fidelity). Such a run is recorded as
// not-default and must never be mixed into the default-level series.

export const REASONING_BY_MODEL = {
  "claude-fable-5-1": {
    providerDefault: "high",
    source: "platform.claude.com/docs/en/build-with-claude/effort (checked 2026-09-23): high is the default on every model that supports effort except Opus 5.5",
  },
  "grok-4.6": {
    providerDefault: "high",
    source: "docs.x.ai/docs/guides/reasoning (checked 2026-09-23): if not specified, reasoning_effort defaults to high",
  },
  "gemini-3.8-flash": {
    providerDefault: "medium",
    source: "ai.google.dev/gemini-api/docs/thinking (checked 2026-09-23): thinking on (medium) by default",
  },
  "gpt-6-astra": {
    providerDefault: null,
    source: "developers.openai.com model + reasoning guides (checked 2026-09-23) do not state a default — parameter omitted",
  },
};

// { level, isProviderDefault } for a model string (dated ids included).
// level: the value sent, or null when the parameter is omitted.
export function reasoningFor(model) {
  const entry = REASONING_BY_MODEL[model] ?? Object.entries(REASONING_BY_MODEL).find(([id]) => model.startsWith(`${id}-`))?.[1];
  const override = process.env.REASONING_LEVEL || null;
  if (override) return { level: override, isProviderDefault: entry?.providerDefault === override };
  return { level: entry?.providerDefault ?? null, isProviderDefault: true };
}

// The record stored with each run and shown on the card.
export function reasoningRecord(model) {
  const { level, isProviderDefault } = reasoningFor(model);
  return { level, isDefault: isProviderDefault };
}

// One-line human-readable form, for run logs.
export function describeReasoning({ level, isDefault }) {
  const value = level ?? "provider default, level not documented";
  const tag = !isDefault ? " (NOT the provider default)" : level ? " (provider default)" : "";
  return `reasoning: ${value}${tag}`;
}

// Wire-format fragments, one per provider family. Empty when nothing is pinned.
export function anthropicReasoningParams(model) {
  const { level } = reasoningFor(model);
  return level ? { output_config: { effort: level } } : {};
}

export function openAIReasoningParams(model) {
  const { level } = reasoningFor(model);
  return level ? { reasoning_effort: level } : {};
}

// Same level, Responses API shape (lib/l3Agent.mjs's OpenAI driver).
export function openAIResponsesReasoningParams(model) {
  const { level } = reasoningFor(model);
  return level ? { reasoning: { effort: level } } : {};
}

export function googleThinkingConfig(model) {
  const { level } = reasoningFor(model);
  return level ? { thinkingConfig: { thinkingLevel: level } } : {};
}
