// The "local" provider (lib/providers.mjs, lib/l3Agent.mjs): any
// OpenAI-compatible server. Exercised against a fake one on localhost, so no
// model and no network are needed.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { displayModelVersion, CLIENT_FACTORIES } from "../lib/providers.mjs";
import { AGENTIC_DRIVER_FACTORIES } from "../lib/l3Agent.mjs";

const requests = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const parsed = JSON.parse(body);
    requests.push({ url: req.url, auth: req.headers.authorization, body: parsed });
    const message = parsed.tools
      ? { role: "assistant", content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "run_tests", arguments: "{}" } }] }
      : { role: "assistant", content: "3" };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "x", object: "chat.completion", choices: [{ index: 0, message, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2 } }));
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
process.env.LOCAL_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
delete process.env.LOCAL_API_KEY;
after(() => server.close());

test("displayModelVersion: local ids become safe directory names, API ids don't move", () => {
  assert.equal(displayModelVersion("qwen3:8b"), "qwen3-8b");
  assert.equal(displayModelVersion("Qwen/Qwen3-8B"), "Qwen-Qwen3-8B");
  assert.equal(displayModelVersion("claude-opus-4-5-20251101"), "claude-opus-4-5");
  assert.equal(displayModelVersion("grok-4.6"), "grok-4.6");
});

test("local client: calls LOCAL_BASE_URL with a placeholder key, never the OpenAI one", async () => {
  const saved = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "sk-must-not-leak";
  try {
    const call = CLIENT_FACTORIES.local();
    const { text, usage } = await call("Rate 1-5.", "qwen3:8b", { maxTokens: 100 });
    assert.equal(text, "3");
    assert.equal(usage.inputTokens, 10);
    const r = requests.at(-1);
    assert.equal(r.url, "/v1/chat/completions");
    assert.equal(r.auth, "Bearer not-needed");
    assert.equal(r.body.model, "qwen3:8b");
    assert.equal(r.body.reasoning_effort, undefined);
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
});

test("local L3 driver: sends the tools and parses the tool call", async () => {
  const driver = AGENTIC_DRIVER_FACTORIES.local("qwen3:8b", { maxTokens: 100, temperature: 1 });
  const step = await driver.step([{ role: "user", content: "Fix the build." }], "You are a developer.");
  assert.deepEqual(step.toolCalls, [{ id: "call_1", name: "run_tests", args: {} }]);
  const r = requests.at(-1);
  assert.ok(r.body.tools.some((t) => t.function.name === "run_tests"));
  assert.equal(r.body.messages[0].role, "system");
});

test("local client: a missing LOCAL_BASE_URL fails loudly", () => {
  const saved = process.env.LOCAL_BASE_URL;
  delete process.env.LOCAL_BASE_URL;
  try {
    assert.throws(() => CLIENT_FACTORIES.local(), /LOCAL_BASE_URL is not set/);
  } finally {
    process.env.LOCAL_BASE_URL = saved;
  }
});
