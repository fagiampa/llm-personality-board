// lib/reasoningConfig.mjs: every model under test runs at its provider's
// default reasoning level, sent explicitly — never guessed, never silently
// omitted for a model whose default is documented.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reasoningRecord,
  anthropicReasoningParams,
  openAIReasoningParams,
  googleThinkingConfig,
} from "../lib/reasoningConfig.mjs";

test("documented defaults are pinned explicitly, per wire format", () => {
  assert.deepEqual(anthropicReasoningParams("claude-fable-5-1"), { output_config: { effort: "high" } });
  assert.deepEqual(openAIReasoningParams("grok-4.6"), { reasoning_effort: "high" });
  assert.deepEqual(googleThinkingConfig("gemini-3.8-flash"), { thinkingConfig: { thinkingLevel: "medium" } });
});

test("an undocumented default is omitted and recorded as level null, still the provider default", () => {
  assert.deepEqual(openAIReasoningParams("gpt-6-astra"), {});
  assert.deepEqual(reasoningRecord("gpt-6-astra"), { level: null, isDefault: true });
});

test("models outside the table run unpinned (debug/pilot models)", () => {
  assert.deepEqual(anthropicReasoningParams("claude-haiku-4-5"), {});
  assert.deepEqual(openAIReasoningParams("grok-4.3"), {});
  assert.deepEqual(reasoningRecord("grok-4.3"), { level: null, isDefault: true });
});

test("a dated provider id resolves to its base entry", () => {
  assert.deepEqual(reasoningRecord("claude-fable-5-1-20260801"), { level: "high", isDefault: true });
});

test("REASONING_LEVEL overrides the level and is recorded as not-default unless it equals the default", () => {
  process.env.REASONING_LEVEL = "low";
  try {
    assert.deepEqual(reasoningRecord("grok-4.6"), { level: "low", isDefault: false });
    assert.deepEqual(openAIReasoningParams("grok-4.6"), { reasoning_effort: "low" });
    process.env.REASONING_LEVEL = "high";
    assert.deepEqual(reasoningRecord("grok-4.6"), { level: "high", isDefault: true });
  } finally {
    delete process.env.REASONING_LEVEL;
  }
});
