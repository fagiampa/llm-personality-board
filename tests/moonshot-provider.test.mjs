// The "moonshot" provider (kimi-k3), exercised against a fake
// OpenAI-compatible server on localhost: no key, no network, no spend.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { CLIENT_FACTORIES } from "../lib/providers.mjs";
import { AGENTIC_DRIVER_FACTORIES } from "../lib/l3Agent.mjs";
import { reasoningRecord } from "../lib/reasoningConfig.mjs";

const requests = [];
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const parsed = JSON.parse(body);
    requests.push({ auth: req.headers.authorization, body: parsed });
    const message = parsed.tools
      ? { role: "assistant", content: null, reasoning_content: "thinking...", tool_calls: [{ id: "call_1", type: "function", function: { name: "run_tests", arguments: "{}" } }] }
      : { role: "assistant", content: "4", reasoning_content: "thinking..." };
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ id: "x", object: "chat.completion", choices: [{ index: 0, message, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2 } }));
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
process.env.MOONSHOT_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
process.env.MOONSHOT_API_KEY = "sk-moonshot-test";
delete process.env.REASONING_LEVEL;
after(() => server.close());

test("kimi-k3 and kimi-k3.1-pro: reasoning pinned at their documented default, max", () => {
  assert.deepEqual(reasoningRecord("kimi-k3"), { level: "max", isDefault: true });
  assert.deepEqual(reasoningRecord("kimi-k3.1-pro"), { level: "max", isDefault: true });
});

test("moonshot client: own key, effort pinned, no sampling params", async () => {
  const call = CLIENT_FACTORIES.moonshot();
  const { text } = await call("Rate 1-5.", "kimi-k3", { maxTokens: 100, temperature: 1 });
  assert.equal(text, "4");
  const r = requests.at(-1);
  assert.equal(r.auth, "Bearer sk-moonshot-test");
  assert.equal(r.body.reasoning_effort, "max");
  assert.equal(r.body.temperature, undefined);
  assert.equal(r.body.top_p, undefined);
});

test("moonshot L3 driver: no temperature, reasoning_content sent back on the next turn", async () => {
  const driver = AGENTIC_DRIVER_FACTORIES.moonshot("kimi-k3", { maxTokens: 100, temperature: 1 });
  const history = [{ role: "user", content: "Fix the build." }];
  const first = await driver.step(history, "You are a developer.");
  assert.deepEqual(first.toolCalls, [{ id: "call_1", name: "run_tests", args: {} }]);
  assert.equal(requests.at(-1).body.temperature, undefined);

  history.push({ role: "assistant", text: "", toolCalls: first.toolCalls }, { role: "tool", id: "call_1", name: "run_tests", result: { ok: true } });
  await driver.step(history, "You are a developer.");
  const assistant = requests.at(-1).body.messages.find((m) => m.role === "assistant");
  assert.equal(assistant.reasoning_content, "thinking...");
});

test("moonshot client: a missing MOONSHOT_API_KEY fails loudly", () => {
  const saved = process.env.MOONSHOT_API_KEY;
  delete process.env.MOONSHOT_API_KEY;
  try {
    assert.throws(() => CLIENT_FACTORIES.moonshot(), /MOONSHOT_API_KEY is not set/);
  } finally {
    process.env.MOONSHOT_API_KEY = saved;
  }
});
