import { test } from "node:test";
import assert from "node:assert/strict";
import { PRICES_PER_MTOK, estimateCostUsd, usageFromAnthropic, usageFromChatCompletion, usageFromResponses, usageFromGemini } from "../lib/pricing.mjs";

test("estimateCostUsd: list price per million tokens, null when no verified price", () => {
  assert.equal(estimateCostUsd("grok-4.6", { inputTokens: 1_000_000, outputTokens: 1_000_000 }), 8);
  assert.equal(estimateCostUsd("claude-fable-5-1-20260801", { inputTokens: 100_000, outputTokens: 10_000 }), 1.5);
  assert.equal(estimateCostUsd("some-unpriced-model", { inputTokens: 1, outputTokens: 1 }), null);
  assert.ok(Math.abs(estimateCostUsd("claude-haiku-5-5", { inputTokens: 1_000_000, outputTokens: 1_000_000 }) - 0.6) < 1e-9);
});

test("estimateCostUsd: the longest base id wins, whatever the table order", () => {
  // claude-opus-5 ($5/$25) is a prefix of claude-opus-5-5 ($4/$20).
  assert.equal(estimateCostUsd("claude-opus-5-5-20260901", { inputTokens: 1_000_000, outputTokens: 0 }), 4);
  assert.equal(estimateCostUsd("claude-opus-5", { inputTokens: 1_000_000, outputTokens: 0 }), 5);
});

test("estimateCostUsd: cache reads and writes at their own price, full input price when unverified", () => {
  // Haiku 4.5: 1M in of which 800k cache reads ($0.10) and 100k writes ($1.25), 100k uncached ($1).
  const usage = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 800_000, cacheWriteTokens: 100_000 };
  assert.ok(Math.abs(estimateCostUsd("claude-haiku-4-5", usage) - (0.1 + 0.08 + 0.125)) < 1e-9);
  // A model with no verified cached price: cached tokens cost full input.
  // (Every real entry has one since 2026-10-15, so a throwaway entry stands in.)
  PRICES_PER_MTOK["test-no-cache-price"] = { input: 0.75, output: 3.75, source: "test" };
  try {
    assert.equal(estimateCostUsd("test-no-cache-price", { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 500_000 }), 0.75);
  } finally {
    delete PRICES_PER_MTOK["test-no-cache-price"];
  }
});

test("usage extractors: one shape, inputTokens always includes cached tokens", () => {
  assert.deepEqual(usageFromAnthropic({ input_tokens: 10, cache_read_input_tokens: 900, cache_creation_input_tokens: 90, output_tokens: 5 }), {
    inputTokens: 1000, outputTokens: 5, cacheReadTokens: 900, cacheWriteTokens: 90,
  });
  assert.deepEqual(usageFromChatCompletion({ prompt_tokens: 1000, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 700 } }), {
    inputTokens: 1000, outputTokens: 5, cacheReadTokens: 700, cacheWriteTokens: 0,
  });
  // DeepSeek names the hit count differently.
  assert.equal(usageFromChatCompletion({ prompt_tokens: 1000, completion_tokens: 5, prompt_cache_hit_tokens: 600 }).cacheReadTokens, 600);
  assert.deepEqual(usageFromResponses({ input_tokens: 1000, output_tokens: 5, input_tokens_details: { cached_tokens: 800 } }), {
    inputTokens: 1000, outputTokens: 5, cacheReadTokens: 800, cacheWriteTokens: 0,
  });
  // Gemini thinking tokens are billed as output.
  assert.deepEqual(usageFromGemini({ promptTokenCount: 1000, candidatesTokenCount: 5, thoughtsTokenCount: 50, cachedContentTokenCount: 400 }), {
    inputTokens: 1000, outputTokens: 55, cacheReadTokens: 400, cacheWriteTokens: 0,
  });
});
