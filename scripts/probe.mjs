// Runs the L2 behavioural probe (docs/probe-l2-spec.md) against one real
// model per configured provider and writes the result to the SQLite DB
// (lib/db.mjs, probe_runs + probe_call_repeats) plus the full raw outputs
// to data/probe-raw/<date>/<model>.jsonl (never into the DB — see
// CLAUDE.md's "Deployment" section for why: this DB is committed to git
// whole on every write, and full-text outputs would bloat it fast).
//
// Usage: npm run probe   (reads API keys from .env via `node --env-file`)
//
// For each scenario x condition (neutral/mild/strong) x PROBE_REPEATS, this
// sends system=<scenario's system prompt for that condition>,
// user=<scenario's data>, temperature 1, and checks whether the scenario's
// marker string appears verbatim in the response. See lib/scenarios.mjs for
// the validity rules every scenario must already satisfy (checked in CI,
// not re-checked here) and lib/probeStats.mjs for the Wilson/bootstrap math.
//
// PROBE_ONLY=ModelName limits the run the same way ASSESS_ONLY does for
// scripts/assess.mjs.

import { mkdir, appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { getLatest, upsertProbeRun } from "../lib/db.mjs";
import { loadScenarios, validateScenario, validateScenarioSet } from "../lib/scenarios.mjs";
import { wilsonInterval, bootstrapDropCi } from "../lib/probeStats.mjs";
import { PROBE_REPEATS as REPEATS, PROBE_SET_VERSION, PROBE_CONDITIONS } from "../lib/probeConfig.mjs";
import { MODEL_CONFIG, CLIENT_FACTORIES, DELAY_MS_BY_PROVIDER, withRetries, displayModelVersion, sleep } from "../lib/providers.mjs";

const ONLY = process.env.PROBE_ONLY
  ? new Set(process.env.PROBE_ONLY.split(",").map((s) => s.trim()).filter(Boolean))
  : null;

// Generous relative to the "four lines" the scenarios ask for — reasoning
// models can still burn part of this on hidden tokens even with
// reasoning_effort turned down (see lib/providers.mjs), and truncation
// would bias the marker-presence check toward false "omitted" reads.
const MAX_TOKENS = 500;

const CONDITION_FIELD = { neutral: "systemNeutral", mild: "systemMild", strong: "systemStrong" };

function hashOutput(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

async function callConditionWithRetries(callModel, scenario, condition, model, label) {
  return withRetries(
    () =>
      callModel(scenario.data, model, {
        systemPrompt: scenario[CONDITION_FIELD[condition]],
        maxTokens: MAX_TOKENS,
      }),
    { label }
  );
}

// Runs every (scenario, condition, repeat) cell for one model, sequentially
// (no shared state to shuffle/batch here, unlike assess.mjs — each call is
// already independent by design, per the spec's "no shared context").
// Returns per-call results plus the pooled hit/n per condition needed for
// the aggregate p's, and per-scenario neutral/strong booleans for the
// bootstrap.
async function probeModel(config, scenarios, callModel, rawLogPath) {
  const delayMs = DELAY_MS_BY_PROVIDER[config.provider] ?? 0;
  const hitsByCondition = { neutral: 0, mild: 0, strong: 0 };
  const nByCondition = { neutral: 0, mild: 0, strong: 0 };
  const callRepeats = [];
  const scenarioResults = scenarios.map(() => ({ neutral: [], strong: [] }));
  let failures = 0;

  for (let sIdx = 0; sIdx < scenarios.length; sIdx++) {
    const scenario = scenarios[sIdx];
    for (const condition of PROBE_CONDITIONS) {
      for (let rep = 0; rep < REPEATS; rep++) {
        const label = `[${config.name}] ${scenario.id} ${condition} rep ${rep + 1}/${REPEATS}`;
        let text;
        try {
          const result = await callConditionWithRetries(callModel, scenario, condition, config.model, label);
          text = result.text;
        } catch (err) {
          console.warn(`  ${label}: request failed — ${err.message}`);
          failures++;
          if (delayMs) await sleep(delayMs);
          continue;
        }

        const reported = text.includes(scenario.marker);
        hitsByCondition[condition] += reported ? 1 : 0;
        nByCondition[condition] += 1;
        if (condition === "neutral" || condition === "strong") {
          scenarioResults[sIdx][condition].push(reported);
        }
        callRepeats.push({
          scenarioId: scenario.id,
          condition,
          repeatIndex: rep,
          reported,
          outputHash: hashOutput(text),
        });
        await appendFile(
          rawLogPath,
          JSON.stringify({
            modelVersion: config.model,
            scenarioId: scenario.id,
            canary: scenario.canary,
            condition,
            repeatIndex: rep,
            reported,
            output: text,
          }) + "\n"
        );

        if (delayMs) await sleep(delayMs);
      }
    }
  }

  const totalCalls = PROBE_CONDITIONS.length * scenarios.length * REPEATS;
  return { hitsByCondition, nByCondition, callRepeats, scenarioResults, failures, totalCalls };
}

async function main() {
  const scenarios = await loadScenarios(PROBE_SET_VERSION);
  const perScenarioIssues = scenarios.flatMap((s) => validateScenario(s));
  const setIssues = validateScenarioSet(scenarios);
  const issues = [...perScenarioIssues, ...setIssues];
  if (issues.length) {
    console.error(`Refusing to run: ${PROBE_SET_VERSION} has invalid scenarios (see npm test):`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }
  console.log(`Loaded ${scenarios.length} valid scenarios from ${PROBE_SET_VERSION}.`);

  const assessedAt = new Date().toISOString();
  const rawDir = path.resolve(`data/probe-raw/${assessedAt.slice(0, 10)}`);
  await mkdir(rawDir, { recursive: true });

  const clients = {};
  let written = 0;

  for (const config of MODEL_CONFIG) {
    const base = await getLatest(config.name);
    if (!base) {
      console.warn(`Skipping ${config.name}: no questionnaire run for this model yet — run npm run assess first.`);
      continue;
    }
    if (ONLY && !ONLY.has(config.name)) {
      console.log(`Skipping ${config.name}: excluded via PROBE_ONLY.`);
      continue;
    }
    if (!config.provider) {
      console.log(`Skipping ${config.name}: no provider configured.`);
      continue;
    }

    // Scoped by model_version AND probe_id (PROBE_SET_VERSION), not just the
    // family name: re-probing the same model version under a different
    // scenario-set variant on the same day (e.g. an ad-hoc wording
    // experiment) must not silently interleave its raw output into a
    // different set's file with no way to tell them apart.
    const rawLogPath = path.join(rawDir, `${config.name}-${displayModelVersion(config.model)}-${PROBE_SET_VERSION}.jsonl`);
    console.log(`Probing ${config.name} via ${config.provider} (${config.model}) — ${scenarios.length} scenarios x 3 conditions x ${REPEATS} repeats...`);
    try {
      clients[config.provider] ??= CLIENT_FACTORIES[config.provider]();
      const { hitsByCondition, nByCondition, callRepeats, scenarioResults, failures, totalCalls } = await probeModel(
        config,
        scenarios,
        clients[config.provider],
        rawLogPath
      );

      if (failures > totalCalls * 0.2) {
        console.warn(`  [${config.name}] discarded: ${failures}/${totalCalls} calls failed — too unreliable to score.`);
        continue;
      }

      const pNeutral = nByCondition.neutral ? hitsByCondition.neutral / nByCondition.neutral : 0;
      const pMild = nByCondition.mild ? hitsByCondition.mild / nByCondition.mild : 0;
      const pStrong = nByCondition.strong ? hitsByCondition.strong / nByCondition.strong : 0;

      const record = {
        modelName: base.name,
        modelVersion: displayModelVersion(config.model),
        assessedAt,
        probeId: PROBE_SET_VERSION,
        pNeutral,
        pMild,
        pStrong,
        pNeutralCi: wilsonInterval(hitsByCondition.neutral, nByCondition.neutral),
        pMildCi: wilsonInterval(hitsByCondition.mild, nByCondition.mild),
        pStrongCi: wilsonInterval(hitsByCondition.strong, nByCondition.strong),
        enacted: 100 * pStrong,
        drop: pNeutral - pStrong,
        dropCi: bootstrapDropCi(scenarioResults),
        scenarioCount: scenarios.length,
        repeatCount: REPEATS,
        source: "live",
        callRepeats,
      };

      console.log(
        `  [${config.name}] p(neutra)=${pNeutral.toFixed(2)} p(blanda)=${pMild.toFixed(2)} p(forte)=${pStrong.toFixed(2)} — caduta=${record.drop.toFixed(2)}, ${failures} failed calls, raw output at ${rawLogPath}`
      );

      await upsertProbeRun(record);
      written++;
    } catch (err) {
      console.warn(`  [${config.name}] client setup failed — ${err.message}`);
    }
  }

  console.log(`\nWrote ${written} probe run(s) to data/psychochat.sqlite`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
