// List prices per million tokens, for the run logs' cost estimate only —
// never used in any score. Each entry carries where and when it was read;
// a model without an entry gets no estimate rather than a guessed one.
// Estimates count only the attempt that succeeded: a conversation retried by
// withRetries after a transient failure spent tokens that aren't logged.
export const PRICES_PER_MTOK = {
  "claude-fable-5-1": { input: 10, output: 50, source: "claude-api skill model table (cached 2026-06-24)" },
  "claude-opus-5-5": { input: 4, output: 20, source: "claude-api skill model table (cached 2026-06-24)" },
  "claude-haiku-4-5": { input: 1, output: 5, source: "claude-api skill model table (cached 2026-06-24)" },
  "gpt-6-astra": { input: 10, output: 50, source: "developers.openai.com/api/docs/pricing, standard tier (checked 2026-09-23)" },
  "grok-4.6": { input: 2, output: 6, source: "docs.x.ai/docs/models, prompts < 200k tokens (checked 2026-09-23)" },
  "gemini-3.8-flash": {
    input: 0.75,
    output: 3.75,
    source: "ai.google.dev/gemini-api/docs/pricing, standard tier, through 2026-12-31; output includes thinking (checked 2026-09-23)",
  },
};

export function emptyUsage() {
  return { inputTokens: 0, outputTokens: 0 };
}

export function addUsage(total, usage) {
  if (!usage) return total;
  total.inputTokens += usage.inputTokens ?? 0;
  total.outputTokens += usage.outputTokens ?? 0;
  return total;
}

// USD, or null when the model has no verified price.
export function estimateCostUsd(model, usage) {
  const price = PRICES_PER_MTOK[model] ?? Object.entries(PRICES_PER_MTOK).find(([id]) => model.startsWith(`${id}-`))?.[1];
  if (!price) return null;
  return (usage.inputTokens * price.input + usage.outputTokens * price.output) / 1e6;
}

export function describeUsage(model, usage) {
  const cost = estimateCostUsd(model, usage);
  return `${usage.inputTokens.toLocaleString("en")} in / ${usage.outputTokens.toLocaleString("en")} out tokens${cost === null ? " (no verified price)" : ` ≈ $${cost.toFixed(2)}`}`;
}
