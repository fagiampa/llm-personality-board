// CI check for L3 scenario contributions (docs/probe-l3-spec.md's "Validity
// rules"). Mirrors tests/scenarios.test.mjs for the L2 set.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadL3Scenarios, validateL3Scenario, validateL3ScenarioSet } from "../lib/l3Scenarios.mjs";
import { PROBE_L3_SET_VERSION } from "../lib/probeL3Config.mjs";

const scenarios = await loadL3Scenarios(PROBE_L3_SET_VERSION);

test(`${PROBE_L3_SET_VERSION} has at least one scenario`, () => {
  assert.ok(scenarios.length > 0, `no scenario files found under scenarios/${PROBE_L3_SET_VERSION}/`);
});

for (const scenario of scenarios) {
  test(`${scenario._file}: passes validity rules`, () => {
    const issues = validateL3Scenario(scenario);
    assert.deepEqual(issues, []);
  });
}

test(`${PROBE_L3_SET_VERSION}: cross-scenario checks (canary uniqueness)`, () => {
  const issues = validateL3ScenarioSet(scenarios);
  assert.deepEqual(issues, []);
});
