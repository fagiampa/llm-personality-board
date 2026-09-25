// Rebuilds the SQLite DB (data/psychochat.sqlite) from what is in git, so a
// fresh clone shows the same board as the live site without spending
// anything on API calls. The DB itself is not tracked (CLAUDE.md,
// "Deployment"); everything needed to recreate it is:
//
//   data/records/<table>.jsonl        run-level rows + the probes' per-call rows
//   data/assess-raw/**                 IPIP-HEXACO answers, one line per repeat
//   data/declared-raw/sqlite-export/** RF item-bank answers, one line per repeat
//
// Both kinds of file are written by `npm run export-raw`.
//
// It then checks the aggregates against the raw data wherever they can be
// recomputed deterministically — the HEXACO scores and the declared score
// from the answers, L3 enacted from the judge labels, the L2 proportions from
// the per-call outcomes — and that every L3 transcript / L2 output a record
// points at (by hash) is actually in data/probe-raw/. Intervals come from a
// random bootstrap and are loaded as stored, not recomputed. Assessment rows
// from before per-item answers were kept (the early runs imported from the
// pre-SQLite JSON files) carry aggregates only.
//
// Usage:
//   npm run db:rebuild                      writes data/psychochat.sqlite (refuses to overwrite)
//   npm run db:rebuild -- --force           overwrites an existing DB
//   npm run db:rebuild -- --out other.sqlite

import initSqlJs from "sql.js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createSchema } from "../lib/db.mjs";
import { enactedFromLabels } from "../lib/l3Judge.mjs";

const args = process.argv.slice(2);
const force = args.includes("--force");
const outIdx = args.indexOf("--out");
const OUT = path.resolve(outIdx >= 0 ? args[outIdx + 1] : "data/psychochat.sqlite");

const DOMAIN_ORDER = ["H", "E", "X", "A", "C", "O"];
const DOMAIN_LABELS = {
  H: "Honesty-Humility",
  E: "Emotionality",
  X: "Extraversion",
  A: "Agreeableness",
  C: "Conscientiousness",
  O: "Openness",
};

function readJsonl(file) {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
function stdev(xs, avg) {
  if (xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (xs.length - 1));
}
const toHundred = (raw) => ((raw - 1) / 4) * 100;
const scaled = ({ reverse, value }) => toHundred(reverse ? 6 - value : value);
const hash16 = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);
const close = (a, b) => Math.abs(a - b) < 1e-9;

function insertRows(db, table, rows) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0]);
  const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`);
  for (const row of rows) stmt.run(columns.map((c) => row[c] ?? null));
  stmt.free();
}

const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
};

async function main() {
  if (existsSync(OUT) && !force) {
    console.error(`${path.relative(process.cwd(), OUT)} already exists — pass --force to overwrite it, or --out <file> to write elsewhere.`);
    process.exit(1);
  }

  const records = Object.fromEntries(
    ["assessments", "declared_anchored_runs", "probe_runs", "probe_call_repeats", "probe_l3_runs", "probe_l3_call_repeats"].map(
      (table) => [table, readJsonl(`data/records/${table}.jsonl`)]
    )
  );

  // Per-item answers, from the raw exports.
  const assessRepeats = walk("data/assess-raw")
    .filter((f) => f.endsWith(".jsonl"))
    .flatMap(readJsonl)
    .flatMap((r) =>
      r.answers.map((a) => ({
        model_version: r.modelVersion,
        assessed_at: r.assessedAt,
        question_id: a.itemId,
        reverse: a.reverse ? 1 : 0,
        repeat_index: r.repeatIndex,
        value: a.value,
      }))
    );
  const declaredRepeats = walk("data/declared-raw/sqlite-export")
    .filter((f) => f.endsWith(".jsonl"))
    .flatMap(readJsonl)
    .flatMap((r) =>
      r.answers.map((a) => ({
        model_version: r.modelVersion,
        assessed_at: r.assessedAt,
        item_set_version: r.itemSetVersion,
        item_id: a.itemId,
        reverse: a.reverse ? 1 : 0,
        repeat_index: r.repeatIndex,
        value: a.value,
      }))
    );

  // --- checks against the raw data --------------------------------------
  const domainOf = new Map(
    JSON.parse(readFileSync("items/sample/json/items.sample.json", "utf8")).items.map((i) => [i.id, i.domain])
  );
  const group = (rows, key) => {
    const m = new Map();
    for (const r of rows) {
      const k = key(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return m;
  };
  const sameItemMeans = (stored, answers, idKey) => {
    const byItem = group(answers, (a) => a[idKey]);
    const recomputed = new Map([...byItem].map(([id, rows]) => [id, mean(rows.map((r) => r.value))]));
    const list = JSON.parse(stored ?? "[]");
    return list.length === recomputed.size && list.every((m) => recomputed.has(m.id) && close(recomputed.get(m.id), m.value));
  };

  // HEXACO: scores, margin, dominant, item means — as scripts/assess.mjs computes them.
  const assessByRun = group(assessRepeats, (r) => `${r.model_version}|${r.assessed_at}`);
  let assessChecked = 0;
  for (const rec of records.assessments) {
    const answers = assessByRun.get(`${rec.model_version}|${rec.assessed_at}`);
    if (!answers) continue; // aggregates-only row
    assessChecked++;
    const byDomain = Object.fromEntries(DOMAIN_ORDER.map((d) => [d, []]));
    for (const a of answers) byDomain[domainOf.get(a.question_id)].push(scaled(a));
    const scores = DOMAIN_ORDER.map((d) => Math.round(mean(byDomain[d])));
    const margin = DOMAIN_ORDER.map((d) => {
      const v = byDomain[d];
      return v.length < 2 ? 8 : Math.min(30, Math.max(2, Math.round((1.96 * stdev(v, mean(v))) / Math.sqrt(v.length))));
    });
    const label = `assessment ${rec.model_version} ${rec.assessed_at}`;
    check(JSON.stringify(scores) === rec.scores, `${label}: scores ${JSON.stringify(scores)} ≠ stored ${rec.scores}`);
    check(JSON.stringify(margin) === rec.margin, `${label}: margin ${JSON.stringify(margin)} ≠ stored ${rec.margin}`);
    check(DOMAIN_LABELS[DOMAIN_ORDER[scores.indexOf(Math.max(...scores))]] === rec.dominant, `${label}: dominant differs`);
    check(sameItemMeans(rec.item_means, answers, "question_id"), `${label}: item means differ`);
  }
  const assessOrphans = [...assessByRun.keys()].filter(
    (k) => !records.assessments.some((r) => `${r.model_version}|${r.assessed_at}` === k)
  );
  check(!assessOrphans.length, `assess-raw runs with no assessments record: ${assessOrphans.join(", ")}`);

  // Declared (specific): anchored, margin, item means — as scripts/declared.mjs computes them.
  const declaredByRun = group(declaredRepeats, (r) => `${r.model_version}|${r.assessed_at}|${r.item_set_version}`);
  for (const rec of records.declared_anchored_runs) {
    const label = `declared ${rec.model_version} ${rec.assessed_at} ${rec.item_set_version}`;
    const answers = declaredByRun.get(`${rec.model_version}|${rec.assessed_at}|${rec.item_set_version}`);
    check(!!answers, `${label}: no answers in declared-raw`);
    if (!answers) continue;
    const vals = answers.map(scaled);
    check(Math.round(mean(vals)) === rec.anchored, `${label}: anchored ${Math.round(mean(vals))} ≠ stored ${rec.anchored}`);
    const margin = vals.length < 2 ? null : Math.min(30, Math.max(2, Math.round((1.96 * stdev(vals, mean(vals))) / Math.sqrt(vals.length))));
    check(margin === rec.anchored_margin, `${label}: margin ${margin} ≠ stored ${rec.anchored_margin}`);
    check(sameItemMeans(rec.item_means, answers, "item_id"), `${label}: item means differ`);
  }

  // Hashes of everything published under data/probe-raw/.
  const l3Hashes = new Set();
  const l2Hashes = new Set();
  for (const file of walk("data/probe-raw").filter((f) => f.endsWith(".jsonl"))) {
    for (const row of readJsonl(file)) {
      if (row.transcript) l3Hashes.add(hash16(JSON.stringify(row.transcript)));
      if (typeof row.output === "string") l2Hashes.add(hash16(row.output));
    }
  }

  // L3: enacted from the failing, valid labels; every transcript present.
  const l3Calls = group(records.probe_l3_call_repeats, (r) => `${r.model_version}|${r.assessed_at}|${r.probe_id}`);
  for (const rec of records.probe_l3_runs) {
    const label = `L3 ${rec.model_version} ${rec.assessed_at}`;
    const calls = l3Calls.get(`${rec.model_version}|${rec.assessed_at}|${rec.probe_id}`) ?? [];
    check(calls.length > 0, `${label}: no per-call rows`);
    const failing = calls.filter((c) => c.condition === "failing" && c.valid === 1 && c.axis_a_label);
    const enacted = enactedFromLabels(failing.map((c) => c.axis_a_label));
    check(close(enacted, rec.enacted), `${label}: enacted ${enacted} from labels ≠ stored ${rec.enacted}`);
  }
  const missingTranscripts = records.probe_l3_call_repeats.filter((c) => !l3Hashes.has(c.transcript_hash));
  check(!missingTranscripts.length, `${missingTranscripts.length} L3 call(s) whose transcript is not in data/probe-raw/`);

  // L2: per-condition proportions from the outcomes; every output present.
  const l2Calls = group(records.probe_call_repeats, (r) => `${r.model_version}|${r.assessed_at}|${r.probe_id}`);
  for (const rec of records.probe_runs) {
    const label = `L2 ${rec.model_version} ${rec.assessed_at} ${rec.probe_id}`;
    const calls = l2Calls.get(`${rec.model_version}|${rec.assessed_at}|${rec.probe_id}`) ?? [];
    for (const cond of ["neutral", "mild", "strong"]) {
      const c = calls.filter((x) => x.condition === cond);
      const p = c.length ? c.filter((x) => x.reported === 1).length / c.length : 0;
      check(close(p, rec[`p_${cond}`]), `${label}: p_${cond} ${p} ≠ stored ${rec[`p_${cond}`]}`);
    }
  }
  const missingOutputs = records.probe_call_repeats.filter((c) => !l2Hashes.has(c.output_hash));
  check(!missingOutputs.length, `${missingOutputs.length} L2 call(s) whose output is not in data/probe-raw/`);

  // --- write -------------------------------------------------------------
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  createSchema(db);
  for (const [table, rows] of Object.entries(records)) insertRows(db, table, rows);
  insertRows(db, "assessment_item_repeats", assessRepeats);
  insertRows(db, "declared_anchored_item_repeats", declaredRepeats);
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.from(db.export()));
  db.close();

  const aggregatesOnly = records.assessments.length - assessChecked;
  console.log(`Wrote ${path.relative(process.cwd(), OUT)}:`);
  for (const [table, rows] of Object.entries(records)) console.log(`  ${table}: ${rows.length}`);
  console.log(`  assessment_item_repeats: ${assessRepeats.length}`);
  console.log(`  declared_anchored_item_repeats: ${declaredRepeats.length}`);
  console.log(
    `Checked against the raw data: ${assessChecked} questionnaire runs (${aggregatesOnly} more are aggregates only), ` +
      `${records.declared_anchored_runs.length} declared, ${records.probe_l3_runs.length} L3 and ${records.probe_runs.length} L2 records, ` +
      `${records.probe_l3_call_repeats.length} L3 transcripts and ${records.probe_call_repeats.length} L2 outputs by hash.`
  );
  if (problems.length) {
    console.error(`\n${problems.length} inconsistenc${problems.length === 1 ? "y" : "ies"} between records and raw data:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(2);
  }
  console.log("No inconsistencies.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
