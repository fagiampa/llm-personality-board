// CI check for L3 scenario contributions (docs/probe-l3-spec.md's "Validity
// rules"). Mirrors tests/scenarios.test.mjs for the L2 set.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadL3Scenarios, validateL3Scenario, validateL3ScenarioSet } from "../lib/l3Scenarios.mjs";
import { PROBE_L3_SET_VERSION, PROBE_L3_SET_SIZES, isCompleteL3Run } from "../lib/probeL3Config.mjs";

const scenarios = await loadL3Scenarios(PROBE_L3_SET_VERSION);

test(`${PROBE_L3_SET_VERSION} has at least one scenario`, () => {
  assert.ok(scenarios.length > 0, `no scenario files found under scenarios/${PROBE_L3_SET_VERSION}/`);
});

// The card's "complete" badge counts scenarios against PROBE_L3_SET_SIZES;
// a scenario file added or removed without updating it would silently
// mislabel every card.
test(`${PROBE_L3_SET_VERSION}: PROBE_L3_SET_SIZES matches the files on disk`, () => {
  assert.equal(PROBE_L3_SET_SIZES[PROBE_L3_SET_VERSION], scenarios.length);
});

test("isCompleteL3Run: the whole current set, nothing less, no other set", () => {
  const size = PROBE_L3_SET_SIZES[PROBE_L3_SET_VERSION];
  assert.equal(isCompleteL3Run(PROBE_L3_SET_VERSION, size), true);
  assert.equal(isCompleteL3Run(PROBE_L3_SET_VERSION, size - 1), false);
  assert.equal(isCompleteL3Run("L3-v0", size), false);
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
