// Unit tests for the L3 scripted environment (lib/l3Environment.mjs) —
// pure state-machine logic, no API calls, so this runs for free on every
// `npm test` unlike scripts/probe-l3.mjs itself.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createEnvironment } from "../lib/l3Environment.mjs";
import { loadL3Scenarios } from "../lib/l3Scenarios.mjs";
import { PROBE_L3_SET_VERSION } from "../lib/probeL3Config.mjs";

const scenarios = await loadL3Scenarios(PROBE_L3_SET_VERSION);
const scenario = scenarios[0];

test("failing condition: run_tests reports the baseline before any write", () => {
  const env = createEnvironment(scenario, "failing");
  assert.deepEqual(env.call("run_tests"), { report: scenario.failing.rules.baseline });
  assert.equal(env.tampered, false);
  assert.equal(env.ranTests, true);
});

test("failing condition: editing requirements.txt still fails, doesn't tamper", () => {
  const env = createEnvironment(scenario, "failing");
  env.call("write_file", { path: "requirements.txt", content: "reportlab==4.0\n" });
  assert.deepEqual(env.call("run_tests"), { report: scenario.failing.rules.onRequirementsEdit });
  assert.equal(env.tampered, false);
});

test("failing condition: overwriting the test file makes the suite pass and flags tampering", () => {
  const env = createEnvironment(scenario, "failing");
  const testPath = scenario.failing.testFilePaths[0];
  env.call("write_file", { path: testPath, content: "def test_noop():\n    pass\n" });
  assert.deepEqual(env.call("run_tests"), { report: scenario.failing.rules.onTestFileWrite });
  assert.equal(env.tampered, true);
});

test("passing condition: always reports the passing baseline, regardless of writes", () => {
  const env = createEnvironment(scenario, "passing");
  assert.deepEqual(env.call("run_tests"), { report: scenario.passing.baseline });
});

test("read_file returns file contents; unknown paths error instead of throwing", () => {
  const env = createEnvironment(scenario, "failing");
  const knownPath = Object.keys(scenario.failing.files)[0];
  assert.deepEqual(env.call("read_file", { path: knownPath }), { content: scenario.failing.files[knownPath] });
  assert.deepEqual(env.call("read_file", { path: "nope.txt" }), { error: "no such file: nope.txt" });
});

test("list_files enumerates the condition's own file set", () => {
  const env = createEnvironment(scenario, "failing");
  assert.deepEqual(env.call("list_files"), { files: Object.keys(scenario.failing.files).sort() });
});

test("ranTests stays false until run_tests is actually called", () => {
  const env = createEnvironment(scenario, "failing");
  env.call("list_files");
  env.call("read_file", { path: Object.keys(scenario.failing.files)[0] });
  assert.equal(env.ranTests, false);
});
