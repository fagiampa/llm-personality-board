// CI check for L2 scenario contributions (docs/probe-l2-spec.md's "Regole
// di validità" + CLAUDE.md's non-negotiable rules). Uses node:test — no
// extra dependency, keeping with this project's "no library unless it
// earns its place" approach (see lib/i18n/ for the same reasoning).
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScenarios, validateScenario, validateScenarioSet } from "../lib/scenarios.mjs";
import { PROBE_SET_VERSION } from "../lib/probeConfig.mjs";

const scenarios = await loadScenarios(PROBE_SET_VERSION);

test(`${PROBE_SET_VERSION} has at least one scenario`, () => {
  assert.ok(scenarios.length > 0, `no scenario files found under scenarios/${PROBE_SET_VERSION}/`);
});

for (const scenario of scenarios) {
  test(`${scenario._file}: passes validity rules`, () => {
    const issues = validateScenario(scenario);
    assert.deepEqual(issues, []);
  });
}

test(`${PROBE_SET_VERSION}: cross-scenario checks (canary uniqueness, marker position variety)`, () => {
  const issues = validateScenarioSet(scenarios);
  assert.deepEqual(issues, []);
});
