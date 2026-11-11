// The "local" provider (lib/providers.mjs, lib/l3Agent.mjs): any
// OpenAI-compatible server. Exercised against a fake one on localhost, so no
// model and no network are needed.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { displayModelVersion, CLIENT_FACTORIES, endpointRecord } from "../lib/providers.mjs";
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
delete process.env.LOCAL_PROVIDER_ONLY;

// Sets LOCAL_PROVIDER_ONLY for one test only, so the others see it unset.
async function withPin(value, fn) {
  process.env.LOCAL_PROVIDER_ONLY = value;
  try {
    await fn();
  } finally {
    delete process.env.LOCAL_PROVIDER_ONLY;
  }
}

const PINNED = { only: ["deepinfra/bf16"], allow_fallbacks: false, require_parameters: true };
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
    assert.equal(r.body.provider, undefined, "no pin set: no routing field sent");
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
  assert.equal(r.body.provider, undefined, "no pin set: no routing field sent");
});

test("LOCAL_PROVIDER_ONLY: the plain client sends the pin with fallbacks off", async () => {
  await withPin(" deepinfra/bf16 ", async () => {
    await CLIENT_FACTORIES.local()("Rate 1-5.", "qwen/qwen3.8-27b", { maxTokens: 100 });
    assert.deepEqual(requests.at(-1).body.provider, PINNED);
  });
});

test("LOCAL_PROVIDER_ONLY: the L3 driver sends the same pin on every turn", async () => {
  await withPin("deepinfra/bf16", async () => {
    const driver = AGENTIC_DRIVER_FACTORIES.local("qwen/qwen3.8-27b", { maxTokens: 100, temperature: 1 });
    await driver.step([{ role: "user", content: "Fix the build." }], "You are a developer.");
    await driver.step([{ role: "user", content: "Fix the build." }], "You are a developer.");
    assert.deepEqual(requests.at(-2).body.provider, PINNED);
    assert.deepEqual(requests.at(-1).body.provider, PINNED);
  });
});

test("LOCAL_PROVIDER_ONLY: comma-separated slugs, blanks dropped", async () => {
  await withPin("z-ai/fp8, ,novita/bf16", async () => {
    await CLIENT_FACTORIES.local()("Rate 1-5.", "z-ai/glm-5.3", { maxTokens: 100 });
    assert.deepEqual(requests.at(-1).body.provider.only, ["z-ai/fp8", "novita/bf16"]);
  });
});

test("endpointRecord: the pin goes into the raw rows, for local models only", async () => {
  assert.deepEqual(endpointRecord({ provider: "local" }), {}, "nothing pinned: nothing recorded");
  await withPin("deepinfra/bf16", async () => {
    assert.deepEqual(endpointRecord({ provider: "local" }), { endpoint: { baseUrl: process.env.LOCAL_BASE_URL, only: ["deepinfra/bf16"] } });
    assert.deepEqual(endpointRecord({ provider: "deepseek" }), {}, "another provider never carries a local pin");
  });
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
