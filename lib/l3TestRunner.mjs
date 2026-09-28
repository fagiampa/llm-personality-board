// The L3-v2 scripted test runner (docs/probe-l3-spec.md, "L3-v2: paired
// scenarios" → "The realism rule"): run_tests is a function of the files'
// content, never of flags alone, and it never contradicts them.
//
// Still no code is executed — see the spec's "Scripted environment, not a
// sandbox". What changed from L3-v1 is only what the rules look at:
//
// 1. Collection follows Python's import semantics, derived from the files
//    and never declared: a test file that imports a project module which
//    doesn't exist, a name the module doesn't define, a package the branch
//    doesn't have installed, or a module that raises at top level, fails to
//    collect with the error Python would give. This is what keeps a model's
//    rewrite from being answered with a stale error (L3-v1's 001: a file
//    containing only `raise RuntimeError("SENTINEL")` still got "No module
//    named 'reportlab'").
// 2. Test functions are read out of whatever test files exist *now*: the
//    count, the names, an added `assert False`, a skip decorator.
// 3. Everything else is a scenario-declared *cause* whose outcome is decided
//    by effect-based checks on the current file contents:
//
//   {
//     kind: "layer" | "impossible" | "guard",
//     scope: "imports" | "collection" | "test",
//     missingPackages: ["reportlab"],     // imports only: not installed while this cause is active
//     triggers: ["regex", ...],           // collection/test: which test files / tests it applies to
//     outcomes: [                          // first entry whose `if` holds wins; the last has no `if`
//       { if: <condition>, pass: true },
//       { if: <condition>, fail: "error text" },
//       { fail: "error text" }
//     ]
//   }
//
// scope "imports" has no outcomes: it names the layer (or wall) that the
// import semantics of point 1 already compute. A local import error is
// attributed to the branch's layer of that scope, a missing package to the
// cause that declared it. A "guard" is a regression the author expects a
// model might introduce (a NameError from a deleted import): it never fails
// on the reference fixes, and it isn't a layer.
//
// A condition is a leaf { in, matches } / { in, notMatches } / { exists },
// or { all: [...] } / { any: [...] } / { not: <condition> }. `in` is a file
// path, a directory prefix ending in "/" (every file under it, concatenated),
// "$test" (the current test function's source) or "$testFile" (its file).

const TEST_FILE_PATTERN = /(^|\/)(test_[^/]*|[^/]*_test)\.py$/;
const SKIP_DECORATOR = /^\s*@(pytest\.mark\.skip(if)?|unittest\.skip\w*)\b/;
const SKIP_CALL = /\bpytest\.skip\s*\(/;
// A body that can't pass whatever the code does: an added `assert False`
// fails (the L3-v1 runner reported it as passing — the rubber stamp this
// module replaces).
const ALWAYS_FAILS = [
  { pattern: /^\s*assert\s+(False|0|None)\s*(,|$)/m, error: "AssertionError: assert False" },
  { pattern: /^\s*raise\b/m, error: "the test raised an exception" },
  { pattern: /\bpytest\.fail\s*\(/, error: "Failed: pytest.fail() was called" },
];

export function isTestFilePath(filePath) {
  return TEST_FILE_PATTERN.test(filePath);
}

/**
 * Test functions in a Python source, pytest-style: `def test_*` at module
 * level or inside a class. Indentation-based, no Python parser — enough for
 * the code models write, and deterministic.
 */
export function parsePythonTests(source) {
  const lines = source.split(/\r?\n/);
  const tests = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(?:async\s+)?def\s+(test\w*)\s*\(/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1].length;
    let end = i + 1;
    while (end < lines.length) {
      const line = lines[end];
      if (line.trim() !== "" && line.length - line.trimStart().length <= indent) break;
      end++;
    }
    const decorators = [];
    for (let d = i - 1; d >= 0 && /^\s*@/.test(lines[d]) && lines[d].length - lines[d].trimStart().length === indent; d--) {
      decorators.unshift(lines[d]);
    }
    tests.push({ name: m[2], source: lines.slice(i, end).join("\n"), decorators });
  }
  return tests;
}

// ---------------------------------------------------------------------------
// Import semantics (point 1).

function modulePath(dotted) {
  return dotted.replace(/\./g, "/");
}

function moduleExists(files, dotted) {
  const p = modulePath(dotted);
  return `${p}.py` in files || Object.keys(files).some((f) => f.startsWith(`${p}/`));
}

function moduleFile(files, dotted) {
  const p = modulePath(dotted);
  if (`${p}.py` in files) return `${p}.py`;
  if (`${p}/__init__.py` in files) return `${p}/__init__.py`;
  return null; // namespace package, or missing
}

function packageOf(filePath) {
  const parts = filePath.replace(/\.py$/, "").split("/");
  if (parts.at(-1) === "__init__") parts.pop();
  parts.pop();
  return parts;
}

// Module-level statements only (column 0): an import indented under `try:`
// or inside a function doesn't run at import time, or has a fallback.
function topLevelStatements(source) {
  const lines = source.split(/\r?\n/);
  const statements = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (/^(from|import)\s/.test(line)) {
      if (line.includes("(") && !line.includes(")")) {
        while (i + 1 < lines.length && !lines[i].includes(")")) line += ` ${lines[++i].trim()}`;
      }
      statements.push({ type: "import", text: line.replace(/#.*$/, "").replace(/[()]/g, " ") });
    } else if (/^raise\s/.test(line)) {
      statements.push({ type: "raise", text: line });
    }
  }
  return statements;
}

function definesName(source, name) {
  const n = name.replace(/[^\w]/g, "");
  return new RegExp(`^\\s*(async\\s+)?(def|class)\\s+${n}\\b|^\\s*${n}\\s*(:[^=\\n]*)?=(?!=)|^\\s*(from\\s+\\S+\\s+)?import\\b[^\\n]*\\b${n}\\b`, "m").test(source);
}

function raisedError(text) {
  const m = /^raise\s+([\w.]+)\s*(?:\((.*)\))?\s*$/.exec(text.trim());
  if (!m) return "the module raised an exception at import";
  const message = (m[2] ?? "").trim().replace(/^[rbf]?(['"])(.*)\1$/s, "$2");
  return message ? `${m[1]}: ${message}` : m[1];
}

/**
 * Walks the imports of `entry` the way Python would at collection time.
 * Returns null, or { error, package? } for the first failure.
 */
export function importError(files, entry, missingPackages = new Set(), seen = new Set()) {
  if (seen.has(entry)) return null;
  seen.add(entry);
  for (const statement of topLevelStatements(files[entry] ?? "")) {
    if (statement.type === "raise") return { error: raisedError(statement.text) };
    const targets = [];
    let m;
    if ((m = /^import\s+(.+)$/.exec(statement.text))) {
      for (const part of m[1].split(",")) targets.push({ module: part.trim().split(/\s+as\s+/)[0].trim(), names: [] });
    } else if ((m = /^from\s+(\.*)([\w.]*)\s+import\s+(.+)$/.exec(statement.text))) {
      let module = m[2];
      if (m[1]) {
        const pkg = packageOf(entry).slice(0, packageOf(entry).length - (m[1].length - 1));
        module = [...pkg, ...(m[2] ? [m[2]] : [])].join(".");
      }
      const names = m[3].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
      targets.push({ module, names });
    }
    for (const { module, names } of targets) {
      const failure = resolveModule(files, module, names, missingPackages, seen);
      if (failure) return failure;
    }
  }
  return null;
}

function resolveModule(files, module, names, missingPackages, seen) {
  const parts = module.split(".");
  if (!moduleExists(files, parts[0])) {
    // Not a project module: installed unless the branch says otherwise.
    return missingPackages.has(parts[0]) ? { error: `ModuleNotFoundError: No module named '${parts[0]}'`, package: parts[0] } : null;
  }
  for (let i = 1; i <= parts.length; i++) {
    const prefix = parts.slice(0, i).join(".");
    if (!moduleExists(files, prefix)) return { error: `ModuleNotFoundError: No module named '${prefix}'` };
    const file = moduleFile(files, prefix);
    if (file) {
      const inner = importError(files, file, missingPackages, seen);
      if (inner) return inner;
    }
  }
  const file = moduleFile(files, module);
  for (const name of names) {
    if (name === "*") continue;
    if (moduleExists(files, `${module}.${name}`)) {
      const sub = moduleFile(files, `${module}.${name}`);
      const inner = sub && importError(files, sub, missingPackages, seen);
      if (inner) return inner;
      continue;
    }
    if (!file || !definesName(files[file], name)) {
      return { error: `ImportError: cannot import name '${name}' from '${module}'${file ? ` (${file})` : ""}` };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Declared causes (point 3).

function contentOf(files, where, context) {
  if (where === "$test") return context.test ?? "";
  if (where === "$testFile") return context.testFile ?? "";
  if (where.endsWith("/")) {
    return Object.keys(files).filter((p) => p.startsWith(where)).sort().map((p) => files[p]).join("\n");
  }
  return files[where] ?? "";
}

export function evaluateCondition(condition, files, context = {}) {
  if (condition.all) return condition.all.every((c) => evaluateCondition(c, files, context));
  if (condition.any) return condition.any.some((c) => evaluateCondition(c, files, context));
  if (condition.not) return !evaluateCondition(condition.not, files, context);
  if (condition.exists !== undefined) return condition.exists in files;
  const text = contentOf(files, condition.in, context);
  if (condition.matches !== undefined) return new RegExp(condition.matches, "m").test(text);
  if (condition.notMatches !== undefined) return !new RegExp(condition.notMatches, "m").test(text);
  throw new Error(`unrecognised condition: ${JSON.stringify(condition)}`);
}

/** The winning outcome entry of one cause, in context. */
export function causeOutcome(cause, files, context) {
  for (const outcome of cause.outcomes) {
    if (!outcome.if || evaluateCondition(outcome.if, files, context)) return outcome;
  }
  return { pass: true }; // unreachable on a validated scenario: the last outcome has no `if`
}

export function causeApplies(cause, text) {
  return cause.triggers.some((t) => new RegExp(t, "m").test(text));
}

/** Why `file` fails to collect under `causes`, or null. */
export function collectionError(files, file, causes) {
  const missing = new Set(causes.filter((c) => c.scope === "imports").flatMap((c) => c.missingPackages ?? []));
  const failure = importError(files, file, missing);
  if (failure) {
    const owner = failure.package
      ? causes.find((c) => c.scope === "imports" && (c.missingPackages ?? []).includes(failure.package))
      : causes.find((c) => c.scope === "imports" && !(c.missingPackages ?? []).length);
    return { causeId: owner?.id ?? null, error: failure.error };
  }
  const context = { testFile: files[file] };
  for (const cause of causes) {
    if (cause.scope !== "collection" || !causeApplies(cause, files[file])) continue;
    const outcome = causeOutcome(cause, files, context);
    if (outcome.fail) return { causeId: cause.id, error: outcome.fail };
  }
  return null;
}

/** How one test function fares under `causes`, once its file has collected. */
export function testOutcome(test, files, testFile, causes) {
  if (test.decorators.some((d) => SKIP_DECORATOR.test(d)) || SKIP_CALL.test(test.source)) {
    return { status: "skipped" };
  }
  const context = { testFile, test: test.source };
  // First failing cause in branch order: an earlier layer masks later ones,
  // which is what makes the layers appear one at a time.
  for (const cause of causes) {
    if (cause.scope !== "test" || !causeApplies(cause, test.source)) continue;
    const outcome = causeOutcome(cause, files, context);
    if (outcome.fail) return { status: "failed", causeId: cause.id, error: outcome.fail };
  }
  const doomed = ALWAYS_FAILS.find((f) => f.pattern.test(test.source));
  if (doomed) return { status: "failed", causeId: null, error: doomed.error };
  return { status: "passed" };
}

/**
 * Runs the scripted suite. `causes` is the branch's ordered list of cause
 * objects (each with its `id`). Returns a structured result plus the
 * pytest-like `report` string the model sees.
 */
export function runScriptedTests(files, causes) {
  const testFiles = Object.keys(files).filter(isTestFilePath).sort();
  const collectionErrors = [];
  const results = [];

  for (const file of testFiles) {
    const broken = collectionError(files, file, causes);
    if (broken) {
      collectionErrors.push({ file, ...broken });
      continue;
    }
    for (const test of parsePythonTests(files[file])) {
      results.push({ file, name: test.name, ...testOutcome(test, files, files[file], causes) });
    }
  }

  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed");
  const skipped = results.filter((r) => r.status === "skipped").length;
  return {
    total: results.length,
    passed,
    failed: failed.length,
    skipped,
    collectionErrors,
    results,
    report: renderReport(results.length, passed, failed, skipped, collectionErrors),
  };
}

function renderReport(total, passed, failed, skipped, collectionErrors) {
  if (collectionErrors.length) {
    // pytest stops the whole session on a collection error: nothing runs.
    const lines = collectionErrors.map((e) => `ERROR collecting ${e.file} — ${e.error}`);
    const n = collectionErrors.length;
    return `${lines.join("\n")}\nInterrupted: ${n} error${n === 1 ? "" : "s"} during collection, 0 tests ran`;
  }
  if (total === 0) return "no tests ran";
  let head = `${total} test${total === 1 ? "" : "s"}, ${passed} passed`;
  if (failed.length) head += `, ${failed.length} failed`;
  if (skipped) head += `, ${skipped} skipped`;
  if (!failed.length) return head;
  const groups = new Map();
  for (const f of failed) groups.set(f.error, [...(groups.get(f.error) ?? []), f.name]);
  if (groups.size === 1) {
    const [[error, names]] = groups;
    return `${head}: ${names.join(", ")} — ${error}`; // L3-v1's one-line shape
  }
  return [head, ...[...groups].map(([error, names]) => `  FAILED ${names.join(", ")} — ${error}`)].join("\n");
}

/**
 * How many tests of the *original* suite don't pass — the progress measure
 * for layered scenarios. A collection error counts every test in that file.
 */
export function remainingFailures(result, originalFiles) {
  let count = result.failed;
  for (const e of result.collectionErrors) count += parsePythonTests(originalFiles[e.file] ?? "").length;
  return count;
}
