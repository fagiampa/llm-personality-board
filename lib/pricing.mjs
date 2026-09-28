// List prices per million tokens, for the run logs' cost estimate only —
// never used in any score. Each entry carries where and when it was read;
// a model without an entry gets no estimate rather than a guessed one.
// Estimates count only the attempt that succeeded: a conversation retried by
// withRetries after a transient failure spent tokens that aren't logged.
//
// `cachedInput` / `cacheWrite`: price of a prompt-cache read / write, where
// verified. A missing one prices those tokens at the plain input rate — an
// overestimate, never an underestimate. Anthropic's are the documented
// multipliers (read 0.1x, except Fable 5.1 and Opus 5.5 which list their own;
// 5-minute write 1.25x). `batch`: the Batch API tier, where verified — used
// for the L3 judge's batch mode (lib/l3JudgeBatch.mjs).
export const PRICES_PER_MTOK = {
  "claude-fable-5-1": { input: 10, output: 50, cachedInput: 0.25, cacheWrite: 12.5, source: "claude-api skill model table + prompt-caching reference (cached 2026-06-24)" },
  "claude-opus-5-5": { input: 4, output: 20, cachedInput: 0.2, cacheWrite: 5, source: "claude-api skill model table + prompt-caching reference (cached 2026-06-24)" },
  "claude-opus-5": { input: 5, output: 25, cachedInput: 0.5, cacheWrite: 6.25, source: "platform.claude.com/docs/en/about-claude/pricing (checked 2026-09-24); cache multipliers from the claude-api skill (cached 2026-06-24)" },
  "claude-opus-4-5": { input: 5, output: 25, cachedInput: 0.5, cacheWrite: 6.25, source: "platform.claude.com/docs/en/about-claude/pricing (checked 2026-09-24); cache multipliers from the claude-api skill (cached 2026-06-24)" },
  "claude-haiku-4-5": { input: 1, output: 5, cachedInput: 0.1, cacheWrite: 1.25, source: "claude-api skill model table + prompt-caching reference (cached 2026-06-24)" },
  "gpt-6-astra": {
    input: 10,
    output: 50,
    cachedInput: 1,
    batch: { input: 5, output: 25, cachedInput: 0.5 },
    source: "developers.openai.com/api/docs/pricing, standard and batch tiers (checked 2026-09-28)",
  },
  "gpt-4o-mini": {
    input: 0.15,
    output: 0.6,
    cachedInput: 0.075,
    batch: { input: 0.075, output: 0.3 },
    source: "developers.openai.com/api/docs/pricing, standard and batch tiers (checked 2026-09-28)",
  },
  "grok-4.6": { input: 2, output: 6, cachedInput: 0.5, source: "docs.x.ai/docs/models, prompts < 200k tokens (checked 2026-09-28)" },
  "gemini-3.8-flash": {
    input: 0.75,
    output: 3.75,
    source: "ai.google.dev/gemini-api/docs/pricing, standard tier, through 2026-12-31; output includes thinking (checked 2026-09-23)",
  },
};

// One usage shape for every provider:
// - inputTokens: every prompt token, cached or not (so the series stays
//   comparable with runs from before caching, which had no cached tokens);
// - outputTokens: every generated token, thinking/reasoning included;
// - cacheReadTokens / cacheWriteTokens: the part of inputTokens served from /
//   written to the provider's prompt cache.
export function emptyUsage() {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

export function addUsage(total, usage) {
  if (!usage) return total;
  total.inputTokens += usage.inputTokens ?? 0;
  total.outputTokens += usage.outputTokens ?? 0;
  total.cacheReadTokens = (total.cacheReadTokens ?? 0) + (usage.cacheReadTokens ?? 0);
  total.cacheWriteTokens = (total.cacheWriteTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
  return total;
}

// Provider usage objects -> the shape above. Pure, so tests/pricing.test.mjs
// covers each wire format without an API call.

// Anthropic's input_tokens excludes both cache fields.
export function usageFromAnthropic(u) {
  const read = u?.cache_read_input_tokens ?? 0;
  const write = u?.cache_creation_input_tokens ?? 0;
  return { inputTokens: (u?.input_tokens ?? 0) + read + write, outputTokens: u?.output_tokens ?? 0, cacheReadTokens: read, cacheWriteTokens: write };
}

// Chat Completions (OpenAI, xAI, DeepSeek): prompt_tokens includes cached
// tokens; DeepSeek reports them as prompt_cache_hit_tokens instead.
export function usageFromChatCompletion(u) {
  return {
    inputTokens: u?.prompt_tokens ?? 0,
    outputTokens: u?.completion_tokens ?? 0,
    cacheReadTokens: u?.prompt_tokens_details?.cached_tokens ?? u?.prompt_cache_hit_tokens ?? 0,
    cacheWriteTokens: 0,
  };
}

// OpenAI Responses API: input_tokens includes cached tokens.
export function usageFromResponses(u) {
  return {
    inputTokens: u?.input_tokens ?? 0,
    outputTokens: u?.output_tokens ?? 0,
    cacheReadTokens: u?.input_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: u?.input_tokens_details?.cache_write_tokens ?? 0,
  };
}

// Gemini: candidatesTokenCount excludes thinking, which is billed as output.
export function usageFromGemini(meta) {
  return {
    inputTokens: meta?.promptTokenCount ?? 0,
    outputTokens: (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0),
    cacheReadTokens: meta?.cachedContentTokenCount ?? 0,
    cacheWriteTokens: 0,
  };
}

function priceFor(model) {
  // Exact id, else the longest base id it extends — "claude-opus-5-5-<date>"
  // must price as Opus 5.5, not as Opus 5, whatever order the table is in.
  const base = Object.keys(PRICES_PER_MTOK)
    .filter((id) => model.startsWith(`${id}-`))
    .sort((a, b) => b.length - a.length)[0];
  return PRICES_PER_MTOK[model] ?? (base ? PRICES_PER_MTOK[base] : undefined);
}

// USD, or null when the model has no verified price (for that tier).
export function estimateCostUsd(model, usage, { tier = "standard" } = {}) {
  const price = tier === "batch" ? priceFor(model)?.batch : priceFor(model);
  if (!price) return null;
  const read = usage.cacheReadTokens ?? 0;
  const write = usage.cacheWriteTokens ?? 0;
  const uncached = usage.inputTokens - read - write;
  return (
    (uncached * price.input + read * (price.cachedInput ?? price.input) + write * (price.cacheWrite ?? price.input) + usage.outputTokens * price.output) / 1e6
  );
}

export function describeUsage(model, usage, { tier = "standard" } = {}) {
  const cost = estimateCostUsd(model, usage, { tier });
  const read = usage.cacheReadTokens ?? 0;
  const cached = read ? ` (${Math.round((100 * read) / usage.inputTokens)}% cache hits${priceFor(model)?.cachedInput === undefined ? ", priced at full input: no verified cache price" : ""})` : "";
  return `${usage.inputTokens.toLocaleString("en")} in${cached} / ${usage.outputTokens.toLocaleString("en")} out tokens${cost === null ? " (no verified price)" : ` ≈ $${cost.toFixed(2)}${tier === "batch" ? " at batch prices" : ""}`}`;
}
