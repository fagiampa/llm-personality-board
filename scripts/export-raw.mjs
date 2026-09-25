// Exports the declared side's full-fidelity answers from the SQLite DB to
// JSONL under data/, so they can be published alongside the probes' raw
// outputs (CLAUDE.md, rule 6). The DB itself is not in git — see CLAUDE.md
// "Deployment" — so without this, half the measure isn't checkable.
//
//   data/declared-raw/sqlite-export/<model_version>/<item_set>-<assessedAt>.jsonl
//   data/assess-raw/<model_version>/<assessedAt>.jsonl
//   data/records/<table>.jsonl — every row of the run-level tables (and the
//     probes' per-call tables), exactly as stored: what scripts/rebuild-db.mjs
//     needs, with the item answers above, to recreate the DB from git alone.
//
// One line per (run, repeat), with that repeat's answers. These exports carry
// the parsed 1-5 answers only: the models' raw response text was never kept
// for these runs. scripts/declared.mjs writes the raw text itself from
// 2026-09-23 on (data/declared-raw/<date>/<model>/), so re-running this is
// only needed for scripts/assess.mjs runs and older declared runs.
//
// Idempotent: rewrites every export file from the DB each time.
//
// Usage: npm run export-raw

import initSqlJs from "sql.js";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DB_PATH = "data/psychochat.sqlite";

function stamp(iso) {
  return iso.replace(/[:.]/g, "-");
}

function queryAll(db, sql) {
  const res = db.exec(sql);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
}

// Groups item rows into one record per repeat.
function byRepeat(rows, itemKey) {
  const repeats = new Map();
  for (const r of rows) {
    if (!repeats.has(r.repeat_index)) repeats.set(r.repeat_index, []);
    repeats.get(r.repeat_index).push({ itemId: r[itemKey], reverse: r.reverse === 1, value: r.value });
  }
  return [...repeats.entries()].sort(([a], [b]) => a - b);
}

async function writeJsonl(file, records) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

async function main() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync(DB_PATH));
  let files = 0;

  const declaredRuns = queryAll(db, `SELECT * FROM declared_anchored_runs ORDER BY assessed_at`);
  for (const run of declaredRuns) {
    const rows = queryAll(
      db,
      `SELECT * FROM declared_anchored_item_repeats
       WHERE model_version = '${run.model_version}' AND assessed_at = '${run.assessed_at}' AND item_set_version = '${run.item_set_version}'
       ORDER BY repeat_index, item_id`
    );
    const reasoning = run.reasoning_is_default == null ? null : { level: run.reasoning_level, isDefault: run.reasoning_is_default === 1 };
    const records = byRepeat(rows, "item_id").map(([repeatIndex, answers]) => ({
      modelVersion: run.model_version,
      assessedAt: run.assessed_at,
      itemSetVersion: run.item_set_version,
      repeatIndex,
      answers,
      responseText: null,
      reasoning,
      source: "sqlite-export",
    }));
    await writeJsonl(`data/declared-raw/sqlite-export/${run.model_version}/${run.item_set_version}-${stamp(run.assessed_at)}.jsonl`, records);
    files++;
  }

  const assessRuns = queryAll(
    db,
    `SELECT DISTINCT model_version, assessed_at FROM assessment_item_repeats ORDER BY assessed_at`
  );
  for (const run of assessRuns) {
    const rows = queryAll(
      db,
      `SELECT * FROM assessment_item_repeats
       WHERE model_version = '${run.model_version}' AND assessed_at = '${run.assessed_at}'
       ORDER BY repeat_index, question_id`
    );
    const records = byRepeat(rows, "question_id").map(([repeatIndex, answers]) => ({
      modelVersion: run.model_version,
      assessedAt: run.assessed_at,
      itemBank: "IPIP-HEXACO (items/sample/json/items.sample.json)",
      repeatIndex,
      answers,
      responseText: null,
      source: "sqlite-export",
    }));
    await writeJsonl(`data/assess-raw/${run.model_version}/${stamp(run.assessed_at)}.jsonl`, records);
    files++;
  }

  // Run-level records. The per-item answers are not repeated here (they are
  // in assess-raw/ and declared-raw/ above); the probes' per-call rows are,
  // since they carry the judge labels and output hashes the aggregates were
  // computed from. Ordered by primary key so re-exports diff cleanly.
  const RECORD_TABLES = {
    assessments: "model_name, assessed_at",
    declared_anchored_runs: "model_version, assessed_at, item_set_version",
    probe_runs: "model_version, assessed_at, probe_id",
    probe_call_repeats: "id",
    probe_l3_runs: "model_version, assessed_at, probe_id",
    probe_l3_call_repeats: "id",
  };
  let recordRows = 0;
  for (const [table, orderBy] of Object.entries(RECORD_TABLES)) {
    const rows = queryAll(db, `SELECT * FROM ${table} ORDER BY ${orderBy}`);
    await writeJsonl(`data/records/${table}.jsonl`, rows);
    recordRows += rows.length;
    files++;
  }

  db.close();
  console.log(
    `Exported ${declaredRuns.length} declared run(s), ${assessRuns.length} assess run(s) and ${recordRows} record row(s) — ${files} file(s).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
