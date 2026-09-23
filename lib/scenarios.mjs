// Loads and validates L2 probe scenarios (docs/probe-l2-spec.md). One JSON
// file per scenario under scenarios/<setVersion>/ — JSON rather than the
// spec's illustrative YAML anatomy, to match this project's existing
// convention for structured data files (items/sample/json/items.sample.json)
// without adding a YAML-parsing dependency.
//
// validateScenario/validateScenarioSet back both scripts/probe.mjs (refuses
// to run on an invalid set) and tests/scenarios.test.mjs (the CI check a
// scenario contribution PR must pass — see CLAUDE.md, "Adding a scenario
// must stay a one-file PR").

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export const SCENARIOS_ROOT = "scenarios";

// Directive verbs/phrases aimed at the *content* of the report — forbidden
// in the pressure clause by docs/probe-l2-spec.md's validity rules, since
// an instruction like "avoid alarming the client" measures instruction
// compliance, not a trait. Deliberately over-inclusive: a false positive
// here just means rewording the clause, a false negative would silently
// turn a trait probe into an obedience probe.
const BANNED_DIRECTIVE_PATTERNS = [
  /\bometti\w*\b/i,
  /\bevita\w*\b/i,
  /\bnon\s+allarmare\b/i,
  /\bsii\s+positiv\w*\b/i,
  /\benfatizza\w*\b/i,
  /\bminimizza\w*\b/i,
  // Only the bare imperative ("rassicura il cliente") or its reflexive
  // ("rassicurati"), not \w* — that also matched past-tense narration like
  // "avevi rassicurato", which is legitimate context (a fact about what
  // already happened), not an instruction.
  /\brassicura(ti)?\b/i,
  /\bnon\s+menzionare\b/i,
  /\btaci\w*\b/i,
  /\bnascond\w*\b/i,
  /\bmantieni\s+un\s+tono\b/i,
];

// A scenario that reads as an evaluation changes model behaviour by itself
// (docs/probe-l2-spec.md, rule 7) — checked against every prose field.
const BANNED_META_WORDS = /\b(test|valutazione|scenario|benchmark)\b/i;

// A "round" number (no decimals, or a decimal ending in 0) is more likely
// to appear by coincidence elsewhere in the data or in the model's own
// paraphrase — the spec requires an unusually-precise marker instead.
function looksRound(marker) {
  const digits = marker.replace(/[^\d.,]/g, "");
  if (!/[.,]/.test(digits)) return true;
  return /[.,]0+$/.test(digits);
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  return haystack.split(needle).length - 1;
}

/** Returns an array of human-readable problems; empty means the scenario is valid on its own (see validateScenarioSet for cross-scenario checks). */
export function validateScenario(scenario) {
  const issues = [];
  const required = [
    "id",
    "canary",
    "domain",
    "marker",
    "markerPosition",
    "request",
    "systemNeutral",
    "systemMild",
    "systemStrong",
    "data",
  ];
  for (const key of required) {
    if (scenario[key] === undefined || scenario[key] === null || scenario[key] === "") {
      issues.push(`${scenario.id ?? "(no id)"}: missing required field "${key}"`);
    }
  }
  if (issues.length) return issues; // remaining checks assume the fields exist

  if (looksRound(scenario.marker)) {
    issues.push(`${scenario.id}: marker "${scenario.marker}" looks like a round number — needs an unusual decimal`);
  }
  const occurrencesInData = countOccurrences(scenario.data, scenario.marker);
  if (occurrencesInData !== 1) {
    issues.push(`${scenario.id}: marker "${scenario.marker}" appears ${occurrencesInData} times in data (must be exactly 1)`);
  }
  for (const field of ["systemNeutral", "systemMild", "systemStrong"]) {
    if (scenario[field].includes(scenario.marker)) {
      issues.push(`${scenario.id}: marker "${scenario.marker}" leaks into ${field} (must only appear in data)`);
    }
  }

  const dataLines = scenario.data.split("\n");
  const actualLineIndex = dataLines.findIndex((l) => l.includes(scenario.marker));
  if (actualLineIndex !== scenario.markerPosition) {
    issues.push(
      `${scenario.id}: markerPosition (${scenario.markerPosition}) doesn't match the marker's actual line index (${actualLineIndex})`
    );
  }

  // The request itself must be verbatim-identical across all three
  // conditions — only the pressure clause preceding it may differ. Checked
  // as a trailing-substring match rather than "last line": the neutral
  // condition (see the spec's own example) states role and request on one
  // line with no separator, while mild/strong put the clause on its own
  // line first.
  for (const field of ["systemNeutral", "systemMild", "systemStrong"]) {
    if (!scenario[field].trim().endsWith(scenario.request.trim())) {
      issues.push(`${scenario.id}: ${field} doesn't end with the exact "request" text — the request must be identical across conditions`);
    }
  }

  for (const field of ["systemMild", "systemStrong"]) {
    const clause = scenario[field];
    for (const pattern of BANNED_DIRECTIVE_PATTERNS) {
      if (pattern.test(clause)) {
        issues.push(`${scenario.id}: ${field} contains a content-directive verb matching ${pattern} — pressure must be social context only`);
      }
    }
  }

  for (const field of ["systemNeutral", "systemMild", "systemStrong", "data"]) {
    if (BANNED_META_WORDS.test(scenario[field])) {
      issues.push(`${scenario.id}: ${field} contains a word that reveals this is an evaluation (test/valutazione/scenario/benchmark)`);
    }
  }

  return issues;
}

/** Cross-scenario checks that only make sense over the whole set: canary uniqueness and marker-position variety. */
export function validateScenarioSet(scenarios) {
  const issues = [];

  const canaryCounts = new Map();
  for (const s of scenarios) {
    if (!s.canary) continue;
    canaryCounts.set(s.canary, (canaryCounts.get(s.canary) ?? 0) + 1);
  }
  for (const [canary, count] of canaryCounts) {
    if (count > 1) issues.push(`canary "${canary}" is reused across ${count} scenarios — every scenario needs its own`);
  }

  if (scenarios.length > 1) {
    const positions = new Set(scenarios.map((s) => s.markerPosition));
    if (positions.size === 1) {
      issues.push(`every scenario places the marker at line index ${[...positions][0]} — position must vary to avoid a recency artifact`);
    }
    const lastLineCount = scenarios.filter((s) => {
      const lines = s.data.split("\n").filter((l) => l.trim());
      return lines.length && lines[lines.length - 1].includes(s.marker);
    }).length;
    if (lastLineCount === scenarios.length) {
      issues.push(`every scenario places the marker on the last data line — position must vary to avoid a recency artifact`);
    }
  }

  return issues;
}

export async function loadScenarios(setVersion) {
  const dir = path.join(SCENARIOS_ROOT, setVersion);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  return Promise.all(
    files.map(async (file) => {
      const raw = await readFile(path.join(dir, file), "utf8");
      const scenario = JSON.parse(raw);
      return { ...scenario, _file: file };
    })
  );
}
