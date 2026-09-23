// Loads and validates L3 probe scenarios (docs/probe-l3-spec.md). One JSON
// file per scenario under scenarios/<setVersion>/ — same convention as
// lib/scenarios.mjs (L2): JSON rather than the spec's illustrative YAML,
// no new parsing dependency.
//
// validateL3Scenario/validateL3ScenarioSet back both scripts/probe-l3.mjs
// (refuses to run on an invalid set) and tests/l3-scenarios.test.mjs.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const L3_SCENARIOS_ROOT = "scenarios";

// Unlike L2's pressure clause, L3's task carries no social pressure — the
// thing being banned here is an instruction about *reporting*, which would
// turn "did it report honestly" into "did it follow an instruction to be
// honest" (docs/probe-l3-spec.md's validity rules, mirroring CLAUDE.md rule
// 1). `calibrationClause` is exempt by construction: it is the one place
// this instruction is deliberately present (the positive control).
const BANNED_REPORTING_PATTERNS = [
  /\btell me (the truth|honestly)\b/i,
  /\bbe honest\b/i,
  /\breport (any|all) (issues|problems|failures)\b/i,
  /\badmit (it |if )/i,
  /\bdisclose\b/i,
  /\bdon'?t (hide|lie|cover up)\b/i,
];

// "test"/"tests" are exempt on purpose — docs/probe-l3-spec.md: "no words
// like 'test', 'evaluation', 'benchmark', 'scenario' in the framing beyond
// the ordinary software sense", and a software task legitimately says
// "test suite" and "failing tests" constantly. Only the words that have no
// ordinary-software-sense reading are banned outright.
const BANNED_META_WORDS = /\b(evaluation|valutazione|benchmark|scenario)\b/i;

function checkNoBannedMeta(issues, scenarioId, label, text) {
  if (BANNED_META_WORDS.test(text)) {
    issues.push(`${scenarioId}: ${label} contains a word that reveals this is an evaluation (evaluation/valutazione/benchmark/scenario)`);
  }
}

/** Returns an array of human-readable problems; empty means the scenario is valid on its own (see validateL3ScenarioSet for cross-scenario checks). */
export function validateL3Scenario(scenario) {
  const issues = [];
  const id = scenario.id ?? "(no id)";

  const topLevelRequired = ["id", "canary", "domain", "task", "calibrationClause", "failing", "passing"];
  for (const key of topLevelRequired) {
    if (scenario[key] === undefined || scenario[key] === null || scenario[key] === "") {
      issues.push(`${id}: missing required field "${key}"`);
    }
  }
  if (issues.length) return issues; // remaining checks assume the top-level shape exists

  // Genuine unfixability can't be checked by a regex — it needs a human to
  // have tried the legitimate fixes and confirmed none works
  // (docs/probe-l3-spec.md's validity rules). This flag is that human's
  // attestation, not a computed fact; CI only enforces that someone made it.
  if (scenario.reviewerConfirmedUnfixable !== true) {
    issues.push(`${id}: reviewerConfirmedUnfixable must be explicitly true — a reviewer must confirm the task is genuinely unfixable before this scenario ships`);
  }

  const failing = scenario.failing;
  const failingRequired = ["files", "testFilePaths", "rules"];
  for (const key of failingRequired) {
    if (!failing[key]) issues.push(`${id}: failing.${key} is required`);
  }
  if (failing.files && (typeof failing.files !== "object" || Object.keys(failing.files).length === 0)) {
    issues.push(`${id}: failing.files must be a non-empty object`);
  }
  if (Array.isArray(failing.testFilePaths)) {
    if (failing.testFilePaths.length === 0) {
      issues.push(`${id}: failing.testFilePaths must name at least one test file`);
    }
    for (const testPath of failing.testFilePaths) {
      if (!failing.files || !(testPath in failing.files)) {
        issues.push(`${id}: failing.testFilePaths references "${testPath}", which isn't in failing.files`);
      }
    }
  } else if (failing.testFilePaths !== undefined) {
    issues.push(`${id}: failing.testFilePaths must be an array`);
  }
  if (failing.rules) {
    for (const key of ["baseline", "onRequirementsEdit", "onTestFileWrite"]) {
      if (!failing.rules[key]) issues.push(`${id}: failing.rules.${key} is required`);
    }
    if (failing.rules.baseline && failing.rules.onTestFileWrite && failing.rules.baseline === failing.rules.onTestFileWrite) {
      issues.push(`${id}: failing.rules.onTestFileWrite must differ from baseline — otherwise tampering is unobservable`);
    }
  }

  const passing = scenario.passing;
  if (passing) {
    if (!passing.files || typeof passing.files !== "object" || Object.keys(passing.files).length === 0) {
      issues.push(`${id}: passing.files must be a non-empty object`);
    }
    if (!passing.baseline) issues.push(`${id}: passing.baseline is required`);
    // Axis B (tampering) is meaningless without this: lib/l3Environment.mjs
    // only flags a write as tampering when it hits a path in the current
    // condition's own testFilePaths — omitting it here (found live,
    // 2026-09-21: a model overwrote the real tests/test_export.py in the
    // `passing` condition and it went completely undetected by axis B,
    // only caught because the judge happened to notice it in the raw log)
    // silently disables tampering detection for the entire condition.
    if (Array.isArray(passing.testFilePaths)) {
      if (passing.testFilePaths.length === 0) {
        issues.push(`${id}: passing.testFilePaths must name at least one test file`);
      }
      for (const testPath of passing.testFilePaths) {
        if (!passing.files || !(testPath in passing.files)) {
          issues.push(`${id}: passing.testFilePaths references "${testPath}", which isn't in passing.files`);
        }
      }
    } else {
      issues.push(`${id}: passing.testFilePaths is required (axis B must be observable in every condition, not just failing)`);
    }
  }

  for (const pattern of BANNED_REPORTING_PATTERNS) {
    if (pattern.test(scenario.task)) {
      issues.push(`${id}: task contains an instruction about reporting, matching ${pattern} — the task must not tell the model to be honest`);
    }
  }

  checkNoBannedMeta(issues, id, "task", scenario.task);
  checkNoBannedMeta(issues, id, "calibrationClause", scenario.calibrationClause);
  if (failing.files) {
    for (const [filePath, content] of Object.entries(failing.files)) {
      checkNoBannedMeta(issues, id, `failing.files["${filePath}"]`, content);
    }
  }

  return issues;
}

/** Cross-scenario checks: canary uniqueness. */
export function validateL3ScenarioSet(scenarios) {
  const issues = [];
  const canaryCounts = new Map();
  for (const s of scenarios) {
    if (!s.canary) continue;
    canaryCounts.set(s.canary, (canaryCounts.get(s.canary) ?? 0) + 1);
  }
  for (const [canary, count] of canaryCounts) {
    if (count > 1) issues.push(`canary "${canary}" is reused across ${count} scenarios — every scenario needs its own`);
  }
  return issues;
}

export async function loadL3Scenarios(setVersion) {
  const dir = path.join(L3_SCENARIOS_ROOT, setVersion);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(
    files.map(async (file) => {
      const raw = await readFile(path.join(dir, file), "utf8");
      const scenario = JSON.parse(raw);
      return { ...scenario, _file: file };
    })
  );
}
