import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCostUsd } from "../lib/pricing.mjs";

test("estimateCostUsd: list price per million tokens, null when no verified price", () => {
  assert.equal(estimateCostUsd("grok-4.6", { inputTokens: 1_000_000, outputTokens: 1_000_000 }), 8);
  assert.equal(estimateCostUsd("claude-fable-5-1-20260801", { inputTokens: 100_000, outputTokens: 10_000 }), 1.5);
  assert.equal(estimateCostUsd("some-unpriced-model", { inputTokens: 1, outputTokens: 1 }), null);
});

test("estimateCostUsd: the longest base id wins, whatever the table order", () => {
  // claude-opus-5 ($5/$25) is a prefix of claude-opus-5-5 ($4/$20).
  assert.equal(estimateCostUsd("claude-opus-5-5-20260901", { inputTokens: 1_000_000, outputTokens: 0 }), 4);
  assert.equal(estimateCostUsd("claude-opus-5", { inputTokens: 1_000_000, outputTokens: 0 }), 5);
});
