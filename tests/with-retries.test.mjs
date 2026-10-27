// lib/providers.mjs withRetries/waitForNetwork: a network outage is waited
// out without spending an attempt; anything else keeps the plain retries.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withRetries, waitForNetwork } from "../lib/providers.mjs";

const failing = (messages) => {
  let calls = 0;
  const fn = async () => {
    const m = messages[calls++];
    if (m) throw new Error(m);
    return "ok";
  };
  return { fn, calls: () => calls };
};

test("an outage longer than the retries is waited out, attempts untouched", async () => {
  // 3 network failures then success: with plain retries (3 attempts) this would throw.
  const { fn, calls } = failing(["fetch failed", "fetch failed", "fetch failed"]);
  const waits = [];
  const networkWait = async () => (waits.push(1), "recovered");
  assert.equal(await withRetries(fn, { label: "t", networkWait }), "ok");
  assert.equal(calls(), 4);
  assert.equal(waits.length, 3);
});

test("the openai SDK's connection errors count as an outage too", async () => {
  const { fn, calls } = failing(["Connection error.", "Request timed out.", "Connection error."]);
  const networkWait = async () => "recovered";
  assert.equal(await withRetries(fn, { label: "t", networkWait }), "ok");
  assert.equal(calls(), 4);
});

test("an overloaded provider is waited out with long waits, attempts untouched", async () => {
  const overloaded = "429 The engine is currently overloaded, please try again later";
  const { fn, calls } = failing([overloaded, overloaded, overloaded, overloaded]);
  assert.equal(await withRetries(fn, { label: "t", overloadWaitsMs: [1, 1, 1, 1] }), "ok");
  assert.equal(calls(), 5);
});

test("a plain rate limit is not an overload: no long waits", async () => {
  const { fn } = failing(["400 rate limit exceeded"]);
  let waited = false;
  const overloadWaitsMs = { length: 1, get 0() { waited = true; return 1; } };
  await assert.rejects(withRetries(fn, { label: "t", overloadWaitsMs, attempts: 1 }), /rate limit/);
  assert.equal(waited, false);
});

test("a network that answers at once is not an outage: plain retries apply", async () => {
  const { fn } = failing(["fetch failed", "fetch failed", "fetch failed"]);
  const networkWait = async () => "up";
  // 3 attempts, all fail; backoff sleeps are real but short enough (2s + 4s)
  await assert.rejects(withRetries(fn, { label: "t", networkWait }), /fetch failed/);
});

test("a non-network error never waits for the network", async () => {
  let waited = false;
  const { fn } = failing(["400 bad request"]);
  await assert.rejects(withRetries(fn, { label: "t", networkWait: async () => ((waited = true), "recovered") }), /400/);
  assert.equal(waited, false);
});

test("waitForNetwork: up at once, recovered after polls, timeout", async () => {
  assert.equal(await waitForNetwork({ label: "t", probe: async () => {} }), "up");
  let n = 0;
  const flaky = async () => {
    if (n++ < 2) throw new Error("down");
  };
  assert.equal(await waitForNetwork({ label: "t", probe: flaky, pollMs: 1, maxWaitMs: 1000 }), "recovered");
  const down = async () => {
    throw new Error("down");
  };
  assert.equal(await waitForNetwork({ label: "t", probe: down, pollMs: 1, maxWaitMs: 5 }), "timeout");
});
