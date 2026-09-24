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
  // "off": the model does no extended thinking unless a request turns it on,
  // and that is its documented default. Nothing is sent (see sentLevel);
  // recorded as level "off" rather than null, which means "not documented".
  "claude-haiku-4-5": {
    providerDefault: "off",
    source: "claude-api skill thinking table (cached 2026-06-24): Haiku 4.5 has no thinking unless {type: enabled, budget_tokens} is sent; effort is not supported (400)",
  },
  "claude-opus-4-5": {
    providerDefault: "off",
    source: "claude-api skill thinking table (cached 2026-06-24): pre-4.6 models run without thinking unless budget_tokens is sent; effort (low/medium/high) defaults to high and is left unsent",
  },
  "claude-opus-5": {
    providerDefault: "high",
    source: "claude-api skill thinking table (cached 2026-06-24): Opus 5 runs adaptive thinking when thinking is omitted; effort default high",
  },
  "claude-opus-5-5": {
    providerDefault: "medium",
    source: "platform.claude.com/docs/en/build-with-claude/effort (checked 2026-09-23): Opus 5.5 is the one model whose default is medium, not high",
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
export const REASONING_OFF = "off";

function entryFor(model) {
  // Exact id first, then the longest matching base id, so "claude-opus-5-5"
  // never falls back to "claude-opus-5" (and a dated id finds its base).
  if (REASONING_BY_MODEL[model]) return REASONING_BY_MODEL[model];
  const bases = Object.keys(REASONING_BY_MODEL).filter((id) => model.startsWith(`${id}-`)).sort((a, b) => b.length - a.length);
  return bases.length ? REASONING_BY_MODEL[bases[0]] : undefined;
}

export function reasoningFor(model) {
  const entry = entryFor(model);
  const override = process.env.REASONING_LEVEL || null;
  // Turning thinking ON for a thinking-off model needs thinking.budget_tokens,
  // a different wire shape from effort; not built yet. Refuse rather than
  // send an effort the API rejects (Haiku 4.5: 400) or silently ignores.
  if (override && override !== REASONING_OFF && entry?.providerDefault === REASONING_OFF) {
    throw new Error(`REASONING_LEVEL=${override} on ${model}: turning thinking on for a thinking-off model is not supported yet (needs thinking.budget_tokens)`);
  }
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

// The level to put on the wire: null when nothing is pinned (undocumented
// default) or when the default is "off" (nothing to send — the model simply
// doesn't think unless asked).
function sentLevel(model) {
  const { level } = reasoningFor(model);
  return level && level !== REASONING_OFF ? level : null;
}

// Wire-format fragments, one per provider family. Empty when nothing is pinned.
export function anthropicReasoningParams(model) {
  const level = sentLevel(model);
  return level ? { output_config: { effort: level } } : {};
}

export function openAIReasoningParams(model) {
  const level = sentLevel(model);
  return level ? { reasoning_effort: level } : {};
}

// Same level, Responses API shape (lib/l3Agent.mjs's OpenAI driver).
export function openAIResponsesReasoningParams(model) {
  const level = sentLevel(model);
  return level ? { reasoning: { effort: level } } : {};
}

export function googleThinkingConfig(model) {
  const level = sentLevel(model);
  return level ? { thinkingConfig: { thinkingLevel: level } } : {};
}
