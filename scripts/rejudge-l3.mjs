// Re-judges stored L3 transcripts with a given axis-A rubric and compares
// the new labels with the stored ones, run by run. Calls only the judge
// model — never the model under test — so it costs judge tokens only.
// Writes nothing to the DB: the output is a comparison file, published next
// to the raw transcripts (CLAUDE.md, rule 6).
//
// Usage:
//   node --env-file=.env scripts/rejudge-l3.mjs --rubric A-v2 \
//     --conditions failing,calibration --out <file.json> <raw1.jsonl> [<raw2.jsonl> ...]
//
// Only runs that were valid originally are re-judged: an invalid run has no
// final report to classify.
import { readFile, writeFile } from "node:fs/promises";
import { buildJudgePrompt, parseJudgeResponse, enactedFromLabels } from "../lib/l3Judge.mjs";
import { loadL3Scenarios } from "../lib/l3Scenarios.mjs";
import { PROBE_L3_SET_VERSION, PROBE_L3_JUDGE_PROVIDER, PROBE_L3_JUDGE_MODEL } from "../lib/probeL3Config.mjs";
import { CLIENT_FACTORIES, withRetries } from "../lib/providers.mjs";
import { emptyUsage, addUsage, describeUsage } from "../lib/pricing.mjs";

function parseArgs(argv) {
  const opts = { rubric: null, conditions: null, out: null, files: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--rubric") opts.rubric = argv[++i];
    else if (a === "--conditions") opts.conditions = new Set(argv[++i].split(","));
    else if (a === "--out") opts.out = argv[++i];
    else opts.files.push(a);
  }
  if (!opts.rubric || !opts.out || !opts.files.length) throw new Error("usage: --rubric <v> --out <file> <raw.jsonl>...");
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const scenarios = Object.fromEntries((await loadL3Scenarios(PROBE_L3_SET_VERSION)).map((s) => [s.id, s]));
  const judge = CLIENT_FACTORIES[PROBE_L3_JUDGE_PROVIDER]();
  const usage = emptyUsage();
  const results = [];

  for (const file of opts.files) {
    const rows = (await readFile(file, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
    for (const r of rows) {
      if (!r.valid || (opts.conditions && !opts.conditions.has(r.condition))) continue;
      const scenario = scenarios[r.scenarioId];
      const testFilePaths = (r.condition === "passing" ? scenario.passing : scenario.failing).testFilePaths;
      const prompt = buildJudgePrompt(r.transcript, r.finalText, testFilePaths, opts.rubric);
      const label = `${r.modelVersion} ${r.scenarioId} ${r.condition} rep ${r.repeatIndex + 1}`;
      try {
        const judged = await withRetries(
          async () => {
            const { text, usage: u } = await judge(prompt, PROBE_L3_JUDGE_MODEL, { maxTokens: 300, reasoning: false });
            return { ...parseJudgeResponse(text, opts.rubric), usage: u };
          },
          { label }
        );
        addUsage(usage, judged.usage);
        results.push({
          file, modelVersion: r.modelVersion, scenarioId: r.scenarioId, condition: r.condition, repeatIndex: r.repeatIndex,
          tampered: r.tampered, oldLabel: r.axisALabel, newLabel: judged.label, newQuote: judged.quote,
        });
        console.log(`  ${label}: ${r.axisALabel} -> ${judged.label}`);
      } catch (err) {
        console.warn(`  ${label}: judge failed — ${err.message}`);
        results.push({ file, modelVersion: r.modelVersion, scenarioId: r.scenarioId, condition: r.condition, repeatIndex: r.repeatIndex, oldLabel: r.axisALabel, newLabel: null, error: err.message });
      }
    }
  }

  const summary = {};
  for (const r of results.filter((x) => x.newLabel)) {
    const key = `${r.modelVersion} ${r.condition}`;
    summary[key] ??= { n: 0, old: {}, new: {} };
    summary[key].n++;
    summary[key].old[r.oldLabel] = (summary[key].old[r.oldLabel] ?? 0) + 1;
    summary[key].new[r.newLabel] = (summary[key].new[r.newLabel] ?? 0) + 1;
  }
  for (const [key, s] of Object.entries(summary)) {
    const labels = (dist) => Object.entries(dist).flatMap(([l, n]) => Array(n).fill(l));
    s.enactedOld = enactedFromLabels(labels(s.old));
    s.enactedNew = enactedFromLabels(labels(s.new));
  }

  await writeFile(
    opts.out,
    JSON.stringify(
      { rubric: opts.rubric, judge: { provider: PROBE_L3_JUDGE_PROVIDER, model: PROBE_L3_JUDGE_MODEL }, judgedAt: new Date().toISOString(), summary, results },
      null,
      1
    )
  );
  console.log(JSON.stringify(summary, null, 1));
  console.log(`judge usage: ${describeUsage(PROBE_L3_JUDGE_MODEL, usage)}; written to ${opts.out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
