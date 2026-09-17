// Lightweight SQLite persistence (sql.js, WASM — no native build step, unlike
// better-sqlite3 which failed to compile here for lack of VS Build Tools).
// sql.js keeps the whole DB in memory: every call opens the file (if it
// exists), runs the operation, and — for writes — re-exports the in-memory
// DB back to disk. Fine at this scale (a handful of models, a few thousand
// rows); would need a real server process for anything with real concurrency.
//
// Two tables:
// - assessments: one row per (model_name, assessed_at) run — the same shape
//   `data/mock-scores.json` used to hold, plus item_means (JSON array of
//   {id, reverse, value}, value = mean raw 1-5 answer across repeats for
//   that item in this run).
// - assessment_item_repeats: one row per (run, item, repeat) with the raw
//   1-5 answer actually given — full fidelity backing the means above,
//   linked to assessments by (model_version, assessed_at) rather than
//   model_name, since model_name only identifies the model family (e.g.
//   "Gemini") while model_version is the actual run (e.g. "gemini-3.5-flash-lite").
//
// assessed_at uses "" (empty string) as the sentinel for entries with no
// real timestamp (the illustrative "fake" mock entries) — chosen so it
// always sorts before any real ISO timestamp in MAX()/ORDER BY.

import initSqlJs from "sql.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const DB_PATH = path.resolve("data/psychochat.sqlite");
export const SEED_TIMESTAMP = "";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS assessments (
  model_name TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  model_version TEXT,
  monogram TEXT NOT NULL,
  hue INTEGER NOT NULL,
  scores TEXT NOT NULL,
  margin TEXT,
  one_liner TEXT NOT NULL,
  one_liner_it TEXT,
  dominant TEXT NOT NULL,
  source TEXT NOT NULL,
  item_means TEXT,
  is_current INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (model_name, assessed_at)
);
CREATE TABLE IF NOT EXISTS assessment_item_repeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_version TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  question_id TEXT NOT NULL,
  reverse INTEGER NOT NULL,
  repeat_index INTEGER NOT NULL,
  value INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_repeats_assessment
  ON assessment_item_repeats (model_version, assessed_at);
`;

let sqlModulePromise = null;
function getSqlModule() {
  sqlModulePromise ??= initSqlJs();
  return sqlModulePromise;
}

// SCHEMA's CREATE TABLE IF NOT EXISTS only covers a fresh DB — an existing
// file on disk keeps whatever columns it had when it was first created.
// Added columns need an explicit ALTER TABLE migration here, guarded by
// PRAGMA table_info so it's a no-op on a DB that already has the column.
function migrate(db) {
  const columns = queryAll(db, `PRAGMA table_info(assessments)`).map((c) => c.name);
  if (!columns.includes("one_liner_it")) {
    db.run(`ALTER TABLE assessments ADD COLUMN one_liner_it TEXT`);
  }
}

async function openDb() {
  const SQL = await getSqlModule();
  const db = existsSync(DB_PATH) ? new SQL.Database(await readFile(DB_PATH)) : new SQL.Database();
  db.run(SCHEMA);
  migrate(db);
  return db;
}

async function persist(db) {
  await mkdir(path.dirname(DB_PATH), { recursive: true });
  await writeFile(DB_PATH, Buffer.from(db.export()));
}

function execToObjects(execResult) {
  if (!execResult.length) return [];
  const { columns, values } = execResult[0];
  return values.map((row) => Object.fromEntries(columns.map((c, i) => [c, row[i]])));
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// model_version strings aren't semver ("gpt-5.2", "gpt-4o-mini", "grok-4.6",
// "gemini-3.8-flash", "claude-opus-4-5", "claude-fable-5-1"...) — rank by
// the first number they contain, so e.g. "gpt-6-astra" outranks "gpt-5.2"
// regardless of which was actually run more recently. The minor version can
// be separated by either "." (gpt-5.2) or "-" (claude-opus-4-5) depending on
// the provider's own naming convention, so both count as the same decimal
// separator here — otherwise e.g. "claude-fable-5-1" (meant as 5.1) would
// rank as a bare 5, tying with "claude-opus-5" instead of outranking it.
// Versionless rows (the seed/"fake" entries, or an unparseable version)
// always rank lowest.
function versionRank(modelVersion) {
  if (!modelVersion) return -Infinity;
  const match = modelVersion.match(/\d+(?:[.-]\d+)?/);
  return match ? Number(match[0].replace("-", ".")) : -Infinity;
}

// True if `a` is a newer run of a model than `b`: higher version rank wins;
// a tie (identical or both-unparseable version) falls back to whichever was
// actually assessed more recently.
function isNewer(a, b) {
  const ra = versionRank(a.model_version);
  const rb = versionRank(b.model_version);
  if (ra !== rb) return ra > rb;
  return a.assessed_at > b.assessed_at;
}

// Recomputes and persists is_current for every row of one model_name: 1 for
// whichever ranks highest (see isNewer), 0 for the rest — so "is this run
// superseded" is a stored fact, not something every reader recomputes.
function recomputeIsCurrent(db, modelName) {
  const rows = queryAll(db, `SELECT assessed_at, model_version FROM assessments WHERE model_name = ?`, [modelName]);
  if (!rows.length) return;
  const winner = rows.reduce((best, row) => (isNewer(row, best) ? row : best));
  const stmt = db.prepare(`UPDATE assessments SET is_current = ? WHERE model_name = ? AND assessed_at = ?`);
  for (const row of rows) {
    stmt.run([row.assessed_at === winner.assessed_at ? 1 : 0, modelName, row.assessed_at]);
  }
  stmt.free();
}

function rowToModelScore(row) {
  return {
    name: row.model_name,
    monogram: row.monogram,
    hue: row.hue,
    scores: JSON.parse(row.scores),
    ...(row.margin ? { margin: JSON.parse(row.margin) } : {}),
    oneLiner: row.one_liner,
    ...(row.one_liner_it ? { oneLinerIt: row.one_liner_it } : {}),
    dominant: row.dominant,
    source: row.source,
    isCurrent: !!row.is_current,
    ...(row.model_version ? { model: row.model_version } : {}),
    ...(row.assessed_at && row.assessed_at !== SEED_TIMESTAMP ? { assessedAt: row.assessed_at } : {}),
  };
}

// Inserts/replaces one run. `itemMeans` ([{id, reverse, value}]) and
// `itemRepeats` ([{questionId, reverse, repeatIndex, value}]) are optional —
// omitted entirely for runs imported from history with no item-level data.
export async function upsertAssessment(record) {
  const db = await openDb();
  try {
    db.run(
      `INSERT OR REPLACE INTO assessments
        (model_name, assessed_at, model_version, monogram, hue, scores, margin, one_liner, one_liner_it, dominant, source, item_means)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.modelName,
        record.assessedAt ?? SEED_TIMESTAMP,
        record.modelVersion ?? null,
        record.monogram,
        record.hue,
        JSON.stringify(record.scores),
        record.margin ? JSON.stringify(record.margin) : null,
        record.oneLiner,
        record.oneLinerIt ?? null,
        record.dominant,
        record.source,
        record.itemMeans ? JSON.stringify(record.itemMeans) : null,
      ]
    );

    if (record.itemRepeats?.length) {
      if (!record.modelVersion) throw new Error("itemRepeats requires modelVersion (it's the table's key, not modelName)");

      db.run(`DELETE FROM assessment_item_repeats WHERE model_version = ? AND assessed_at = ?`, [
        record.modelVersion,
        record.assessedAt ?? SEED_TIMESTAMP,
      ]);
      const stmt = db.prepare(
        `INSERT INTO assessment_item_repeats (model_version, assessed_at, question_id, reverse, repeat_index, value)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const r of record.itemRepeats) {
        stmt.run([
          record.modelVersion,
          record.assessedAt ?? SEED_TIMESTAMP,
          r.questionId,
          r.reverse ? 1 : 0,
          r.repeatIndex,
          r.value,
        ]);
      }
      stmt.free();
    }

    recomputeIsCurrent(db, record.modelName);
    await persist(db);
  } finally {
    db.close();
  }
}

// Forces an is_current recompute for one model_name without writing a new
// row — needed after a versionRank/isNewer logic change, since existing
// rows' is_current was computed (and persisted) under the old logic and
// won't update itself just by fixing the function.
export async function recomputeIsCurrentForModel(modelName) {
  const db = await openDb();
  try {
    recomputeIsCurrent(db, modelName);
    await persist(db);
  } finally {
    db.close();
  }
}

// One ModelScore-shaped row per model_name: whichever run has the highest-
// ranked model_version (see isNewer — a tie falls back to recency).
export async function listLatestPerModel() {
  const db = await openDb();
  try {
    const rows = queryAll(db, `SELECT * FROM assessments`);
    return latestPerModelFromRows(rows).map(rowToModelScore);
  } finally {
    db.close();
  }
}

function latestPerModelFromRows(rows) {
  const byModel = new Map();
  for (const row of rows) {
    const prev = byModel.get(row.model_name);
    if (!prev || isNewer(row, prev)) byModel.set(row.model_name, row);
  }
  return [...byModel.values()].sort((a, b) => a.model_name.localeCompare(b.model_name));
}

function versionsByModelFromRows(rows) {
  const byModel = new Map();
  for (const row of rows) {
    const list = byModel.get(row.model_name) ?? [];
    list.push(row);
    byModel.set(row.model_name, list);
  }
  const result = {};
  for (const [modelName, modelRows] of byModel) {
    modelRows.sort((a, b) => (isNewer(a, b) ? -1 : isNewer(b, a) ? 1 : 0));
    result[modelName] = modelRows.map((r) => ({
      assessedAt: r.assessed_at === SEED_TIMESTAMP ? null : r.assessed_at,
      modelVersion: r.model_version ?? null,
      source: r.source,
    }));
  }
  return result;
}

// Everything app/page.tsx needs for the initial render, from a single DB
// open/query: the latest run per model (the grid) and every model's version
// list (prefetched combo options, so the first combo open of the session
// doesn't pay for a second cold DB open — see listVersionsByModel, which
// this supersedes for that call site).
export async function getHomeData() {
  const db = await openDb();
  try {
    const rows = queryAll(db, `SELECT * FROM assessments`);
    return {
      models: latestPerModelFromRows(rows).map(rowToModelScore),
      versionsByModel: versionsByModelFromRows(rows),
    };
  } finally {
    db.close();
  }
}

// Highest-ranked row for a single model (used by assess.mjs as the "base" it
// takes monogram/hue/oneLiner from when a model isn't reassessed this run).
export async function getLatest(modelName) {
  const db = await openDb();
  try {
    const rows = queryAll(db, `SELECT * FROM assessments WHERE model_name = ?`, [modelName]);
    if (!rows.length) return undefined;
    return rowToModelScore(rows.reduce((best, row) => (isNewer(row, best) ? row : best)));
  } finally {
    db.close();
  }
}

// Available versions for one model, highest-ranked first — powers the
// per-card combo.
export async function listVersions(modelName) {
  const db = await openDb();
  try {
    const rows = queryAll(
      db,
      `SELECT model_name, assessed_at, model_version, source FROM assessments WHERE model_name = ?`,
      [modelName]
    );
    return versionsByModelFromRows(rows)[modelName] ?? [];
  } finally {
    db.close();
  }
}

// One ModelScore-shaped record for a specific (model, assessedAt) — powers
// the combo's on-change fetch. assessedAt may be null to mean the seed entry.
export async function getAssessment(modelName, assessedAt) {
  const db = await openDb();
  try {
    const rows = queryAll(
      db,
      `SELECT * FROM assessments WHERE model_name = ? AND assessed_at = ?`,
      [modelName, assessedAt ?? SEED_TIMESTAMP]
    );
    return rows.length ? rowToModelScore(rows[0]) : undefined;
  } finally {
    db.close();
  }
}
