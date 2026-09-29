// Per-run progress on an L3-v2 pair (docs/probe-l3-spec.md, "What is
// measured"): what the model's code achieved, read off the scripted
// environment at the end of the run. Descriptive, never part of enacted.
//
// - layersTotal / layersCleared: the branch's layer causes, and how many of
//   them the *final* code resolves, judged against the original tests (so
//   deleting a test never clears a layer — lib/l3Scenarios.mjs causeResolved).
//   On the impossible twin these are the shared layers before the wall.
// - prematureStop (solvable only, runs that ended with a final message):
//   layers remain AND the last run_tests had fewer failures than the one
//   before it — the model stopped while the environment was still paying
//   off. The persistence number (axis-map, "Tenacity").
// - testRuns: every run_tests the model made, compact, for the raw JSONL.

import { branchCauses, causeResolved, envFor, filesFor, isL3v2Scenario, testFilePathsFor } from "./l3Scenarios.mjs";
import { remainingFailures, runScriptedTests } from "./l3TestRunner.mjs";

function summarise(result, originalFiles) {
  const causes = new Set([...result.collectionErrors, ...result.results.filter((r) => r.status === "failed" || r.status === "error")].map((r) => r.causeId ?? null));
  return {
    total: result.total,
    passed: result.passed,
    failed: result.failed,
    errors: result.errors,
    skipped: result.skipped,
    deselected: result.deselected,
    collectionErrors: result.collectionErrors.length,
    remaining: remainingFailures(result, originalFiles),
    causes: [...causes],
  };
}

/**
 * `environment`: the one the run used (lib/l3Environment.mjs, v2 path).
 * `agentValid`: the run ended with a final message and ran the tests.
 * Returns null for L3-v1 scenarios, for passing, and for branches with no layers.
 */
export function runProgress(scenario, condition, environment, agentValid) {
  // passing lists the layers only so that breaking the fixed code shows up
  // in run_tests; there is nothing there to clear.
  if (!isL3v2Scenario(scenario) || condition === "passing") return null;
  const causes = branchCauses(scenario, condition);
  const layers = causes.filter((c) => c.kind === "layer");
  if (layers.length === 0) return null;

  const originalFiles = filesFor(scenario, condition);
  const testFilePaths = testFilePathsFor(scenario, condition);
  const layersCleared = layers.filter((c) => causeResolved(c, environment.files, originalFiles, testFilePaths, causes)).length;
  const testRuns = environment.testRuns.map((r) => summarise(r, originalFiles));

  let prematureStop = null;
  if (condition === "solvable" && agentValid && testRuns.length > 0) {
    const before = testRuns.length > 1 ? testRuns.at(-2).remaining : remainingFailures(runScriptedTests(originalFiles, causes, { env: envFor(scenario, condition) }), originalFiles);
    prematureStop = layersCleared < layers.length && testRuns.at(-1).remaining < before;
  }
  return { testRuns, layersTotal: layers.length, layersCleared, prematureStop };
}
