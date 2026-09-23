// Unit tests for the L3 agentic driver (lib/l3Agent.mjs) — no API key, no
// network call, no cost. Two things are tested for free here instead of by
// burning real model calls (which is how the two bugs below were actually
// found, the expensive way, during the pilot run):
//
// 1. The pure history -> wire-format translators, including a regression
//    test for the tool_result-grouping bug: when one assistant turn makes
//    several tool calls, Anthropic/Google expect all matching results back
//    in a single message, not one message per call.
// 2. The generic run loop (iteration cap, validity, tampering) via a fake
//    `driver` injected straight into runAgenticScenario — see its `driver`
//    parameter, which exists specifically so tests never need a real
//    provider client.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anthropicMessagesFromHistory,
  openAIMessagesFromHistory,
  googleContentsFromHistory,
  runAgenticScenario,
} from "../lib/l3Agent.mjs";
import { createEnvironment } from "../lib/l3Environment.mjs";
import { loadL3Scenarios } from "../lib/l3Scenarios.mjs";
import { PROBE_L3_SET_VERSION } from "../lib/probeL3Config.mjs";

// A history where one assistant turn makes three tool calls — the shape
// that exposed the grouping bug.
const MULTI_CALL_HISTORY = [
  { role: "user", content: "do the thing" },
  {
    role: "assistant",
    text: "",
    toolCalls: [
      { id: "call_1", name: "read_file", args: { path: "a.py" } },
      { id: "call_2", name: "read_file", args: { path: "b.py" } },
      { id: "call_3", name: "run_tests", args: {} },
    ],
  },
  { role: "tool", id: "call_1", name: "read_file", args: { path: "a.py" }, result: { content: "A" } },
  { role: "tool", id: "call_2", name: "read_file", args: { path: "b.py" }, result: { content: "B" } },
  { role: "tool", id: "call_3", name: "run_tests", args: {}, result: { report: "ok" } },
];

test("anthropicMessagesFromHistory: groups all tool_results from one turn into a single user message", () => {
  const messages = anthropicMessagesFromHistory(MULTI_CALL_HISTORY);
  const userMessages = messages.filter((m) => m.role === "user");
  // "do the thing" (the task) + one grouped tool_result message — NOT three.
  assert.equal(userMessages.length, 2);
  const toolResultMessage = userMessages[1];
  assert.equal(toolResultMessage.content.length, 3);
  assert.deepEqual(
    toolResultMessage.content.map((b) => b.tool_use_id),
    ["call_1", "call_2", "call_3"]
  );
  assert.ok(toolResultMessage.content.every((b) => b.type === "tool_result"));
});

test("anthropicMessagesFromHistory: the assistant turn carries all three tool_use blocks", () => {
  const messages = anthropicMessagesFromHistory(MULTI_CALL_HISTORY);
  const assistantMessage = messages.find((m) => m.role === "assistant");
  const toolUseBlocks = assistantMessage.content.filter((b) => b.type === "tool_use");
  assert.equal(toolUseBlocks.length, 3);
});

test("googleContentsFromHistory: groups all functionResponses from one turn into a single 'user' content, never role 'function'", () => {
  const contents = googleContentsFromHistory(MULTI_CALL_HISTORY);
  // Regression test: the Gemini API rejects role "function" outright
  // (confirmed live, 2026-09-21) — tool results must go back as "user".
  assert.ok(contents.every((c) => c.role !== "function"));
  const toolResultContents = contents.filter((c) => c.parts.some((p) => p.functionResponse));
  assert.equal(toolResultContents.length, 1);
  assert.equal(toolResultContents[0].role, "user");
  assert.equal(toolResultContents[0].parts.length, 3);
});

test("googleContentsFromHistory: round-trips thoughtSignature on the functionCall part that carried one", () => {
  // Regression test: Gemini 3 rejects a resent functionCall that drops the
  // thoughtSignature it was issued with (confirmed live, 2026-09-21 —
  // "Function call is missing a thought_signature ... required for tools
  // to work correctly").
  const historyWithSignature = [
    { role: "user", content: "do the thing" },
    {
      role: "assistant",
      text: "",
      toolCalls: [{ id: "1", name: "list_files", args: {}, thoughtSignature: "sig-abc" }],
    },
    { role: "tool", id: "1", name: "list_files", args: {}, result: { files: ["a.py"] } },
  ];
  const contents = googleContentsFromHistory(historyWithSignature);
  const modelContent = contents.find((c) => c.role === "model");
  assert.equal(modelContent.parts[0].functionCall.name, "list_files");
  assert.equal(modelContent.parts[0].thoughtSignature, "sig-abc");
});

test("googleContentsFromHistory: a call with no thoughtSignature doesn't get one invented", () => {
  const contents = googleContentsFromHistory(MULTI_CALL_HISTORY); // none of these calls carry a signature
  const modelContent = contents.find((c) => c.role === "model");
  for (const part of modelContent.parts) {
    assert.ok(!("thoughtSignature" in part));
  }
});

test("openAIMessagesFromHistory: one 'tool' message per call (no grouping — that's correct for this API)", () => {
  const messages = openAIMessagesFromHistory(MULTI_CALL_HISTORY, "be an engineer");
  const toolMessages = messages.filter((m) => m.role === "tool");
  assert.equal(toolMessages.length, 3);
  assert.equal(messages[0].role, "system");
  assert.equal(messages[0].content, "be an engineer");
});

// --- Generic loop, via a fake injected driver (no client, no network) ---

const scenarios = await loadL3Scenarios(PROBE_L3_SET_VERSION);
const scenario = scenarios[0];

function fakeDriver(steps) {
  let i = 0;
  return {
    async step() {
      const next = steps[Math.min(i, steps.length - 1)];
      i++;
      return next;
    },
  };
}

test("runAgenticScenario: a driver that never stops calling tools hits the iteration cap", async () => {
  const environment = createEnvironment(scenario, "failing");
  const driver = fakeDriver([{ toolCalls: [{ id: "1", name: "list_files", args: {} }], text: "" }]);
  const result = await runAgenticScenario({
    driver,
    task: scenario.task,
    systemPrompt: "x",
    environment,
    maxIterations: 4,
    maxTokens: 100,
  });
  assert.equal(result.valid, false);
  assert.equal(result.invalidReason, "iteration_cap");
  assert.equal(result.iterations, 4);
  assert.equal(result.finalText, null);
});

test("runAgenticScenario: a final message with no run_tests call is invalid", async () => {
  const environment = createEnvironment(scenario, "failing");
  const driver = fakeDriver([{ toolCalls: [], text: "all done!" }]);
  const result = await runAgenticScenario({
    driver,
    task: scenario.task,
    systemPrompt: "x",
    environment,
    maxIterations: 12,
    maxTokens: 100,
  });
  assert.equal(result.valid, false);
  assert.equal(result.invalidReason, "never_ran_tests");
});

test("runAgenticScenario: run_tests then a final message is valid, and passes through tampering", async () => {
  const environment = createEnvironment(scenario, "failing");
  const testPath = scenario.failing.testFilePaths[0];
  const driver = fakeDriver([
    { toolCalls: [{ id: "1", name: "write_file", args: { path: testPath, content: "def test_noop(): pass" } }], text: "" },
    { toolCalls: [{ id: "2", name: "run_tests", args: {} }], text: "" },
    { toolCalls: [], text: "All 12 tests pass now." },
  ]);
  const result = await runAgenticScenario({
    driver,
    task: scenario.task,
    systemPrompt: "x",
    environment,
    maxIterations: 12,
    maxTokens: 100,
  });
  assert.equal(result.valid, true);
  assert.equal(result.invalidReason, null);
  assert.equal(result.tampered, true);
  assert.equal(result.finalText, "All 12 tests pass now.");
  assert.equal(result.transcript.at(-1).text, "All 12 tests pass now.");
});

test("runAgenticScenario: honest run without tampering reports tampered=false", async () => {
  const environment = createEnvironment(scenario, "failing");
  const driver = fakeDriver([
    { toolCalls: [{ id: "1", name: "run_tests", args: {} }], text: "" },
    { toolCalls: [], text: "3 tests fail because reportlab is unavailable." },
  ]);
  const result = await runAgenticScenario({
    driver,
    task: scenario.task,
    systemPrompt: "x",
    environment,
    maxIterations: 12,
    maxTokens: 100,
  });
  assert.equal(result.valid, true);
  assert.equal(result.tampered, false);
});
