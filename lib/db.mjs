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
import { PROBE_SET_VERSION } from "./probeConfig.mjs";
import { PROBE_L3_SET_VERSION } from "./probeL3Config.mjs";
import { DECLARED_ITEM_SET_VERSION } from "./declaredConfig.mjs";

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

-- Behavioural probe (declared vs enacted, docs/probe-l2-spec.md). Mirrors
-- the assessments/assessment_item_repeats split for the same reason:
-- aggregates here, full fidelity (one row per call) in probe_call_repeats.
-- Keyed by model_version, not model_name/assessed_at of the *questionnaire*
-- run: the probe pipeline runs on its own schedule, and the join to a
-- declared profile happens by matching model_version (see
-- getProbeForAssessment) since only same-version declared/enacted pairs are
-- a meaningful gap.
CREATE TABLE IF NOT EXISTS probe_runs (
  model_version TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  probe_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  p_neutral REAL NOT NULL,
  p_mild REAL NOT NULL,
  p_strong REAL NOT NULL,
  p_neutral_ci TEXT NOT NULL,
  p_mild_ci TEXT NOT NULL,
  p_strong_ci TEXT NOT NULL,
  enacted REAL NOT NULL,
  drop_value REAL NOT NULL,
  drop_ci TEXT NOT NULL,
  scenario_count INTEGER NOT NULL,
  repeat_count INTEGER NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (model_version, assessed_at, probe_id)
);
-- Full fidelity behind the aggregates above: one row per call. The output
-- text itself is NOT stored here (see CLAUDE.md "Deployment" — a probe run
-- is ~600 free-text calls per model, and this DB is committed to git
-- whole on every write) — only the boolean outcome and a hash for
-- contamination checks. The full text goes to data/probe-raw/*.jsonl.
CREATE TABLE IF NOT EXISTS probe_call_repeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_version TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  probe_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  condition TEXT NOT NULL,
  repeat_index INTEGER NOT NULL,
  reported INTEGER NOT NULL,
  output_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_probe_repeats_run
  ON probe_call_repeats (model_version, assessed_at, probe_id);

-- L3 probe (docs/probe-l3-spec.md): a separate table rather than widening
-- probe_runs, because L3's conditions (failing/passing/calibration) and
-- metrics (a two-way axis-A label distribution, a tampering rate, a
-- validity rate) have nothing in common with L2's three pressure-clause
-- proportions — cramming both into one table would mean every column is
-- NULL for one probe or the other. axis_a/axis_a_ci/tampering_rate_ci are
-- JSON (per-condition breakdowns), same convention as scores/margin on
-- assessments.
CREATE TABLE IF NOT EXISTS probe_l3_runs (
  model_version TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  probe_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  axis_a TEXT NOT NULL,
  enacted REAL NOT NULL,
  enacted_ci TEXT NOT NULL,
  tampering_rate REAL NOT NULL,
  tampering_rate_ci TEXT NOT NULL,
  validity_rate REAL NOT NULL,
  scenario_count INTEGER NOT NULL,
  repeat_count INTEGER NOT NULL,
  source TEXT NOT NULL,
  -- The axis-A judge is part of the instrument (docs/probe-l3-spec.md):
  -- two runs are only comparable if the same judge scored them. NULL means
  -- "not recorded" (runs before 2026-09-23), not "no judge".
  judge_provider TEXT,
  judge_model TEXT,
  PRIMARY KEY (model_version, assessed_at, probe_id)
);
-- Full fidelity behind the aggregates above, mirroring probe_call_repeats.
-- The transcript itself is NOT stored here (docs/probe-l3-spec.md,
-- "Output": "Transcripts do not go in the sqlite" — see CLAUDE.md
-- "Deployment") — only the judge's label/quote, the tampering flag,
-- validity, and a hash of the full transcript for contamination checks.
-- The full transcript goes to data/probe-raw/<date>/<model>/L3-v1.jsonl.
CREATE TABLE IF NOT EXISTS probe_l3_call_repeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_version TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  probe_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  condition TEXT NOT NULL,
  repeat_index INTEGER NOT NULL,
  valid INTEGER NOT NULL,
  invalid_reason TEXT,
  axis_a_label TEXT,
  axis_a_quote TEXT,
  tampered INTEGER NOT NULL,
  transcript_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_probe_l3_repeats_run
  ON probe_l3_call_repeats (model_version, assessed_at, probe_id);

-- Declared side, anchored half (docs/declared-spec.md): the action-anchored
-- RF-v1 item bank, administered in its own session, same shape as
-- assessments/assessment_item_repeats (a plain repeated-Likert mean, not a
-- scenario-clustered probe result) — anchored_margin uses the same 1.96xSEM
-- convention as assessments.margin, not a bootstrap CI. Keyed by
-- model_version, not the questionnaire run's (model_name, assessed_at): the
-- generic score it pairs with is read live from assessments at query time
-- (getHomeData/getDeclaredAnchoredForAssessment), never duplicated in here.
CREATE TABLE IF NOT EXISTS declared_anchored_runs (
  model_version TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  item_set_version TEXT NOT NULL,
  model_name TEXT NOT NULL,
  anchored REAL NOT NULL,
  anchored_margin REAL,
  item_means TEXT,
  repeat_count INTEGER NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (model_version, assessed_at, item_set_version)
);
-- Full fidelity behind the aggregate above, mirroring assessment_item_repeats.
CREATE TABLE IF NOT EXISTS declared_anchored_item_repeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_version TEXT NOT NULL,
  assessed_at TEXT NOT NULL,
  item_set_version TEXT NOT NULL,
  item_id TEXT NOT NULL,
  reverse INTEGER NOT NULL,
  repeat_index INTEGER NOT NULL,
  value INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_declared_anchored_repeats_run
  ON declared_anchored_item_repeats (model_version, assessed_at, item_set_version);
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
  const l3Columns = queryAll(db, `PRAGMA table_info(probe_l3_runs)`).map((c) => c.name);
  if (!l3Columns.includes("judge_provider")) {
    db.run(`ALTER TABLE probe_l3_runs ADD COLUMN judge_provider TEXT`);
  }
  if (!l3Columns.includes("judge_model")) {
    db.run(`ALTER TABLE probe_l3_runs ADD COLUMN judge_model TEXT`);
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
    const models = latestPerModelFromRows(rows).map(rowToModelScore);

    // One probe lookup for the whole grid instead of one query per card:
    // matches each model's currently-displayed model_version against
    // probe_runs the same way getProbeForAssessment does — including the
    // probe_id = PROBE_SET_VERSION filter getLatestProbeForVersion applies
    // (missing here until code review, 2026-09-21: without it, an
    // experimental probe_id's run could silently outrank the canonical one
    // on the home page's server-rendered grid just by having a later
    // assessed_at, then "change" the moment the version combo re-fetches
    // through the filtered route).
    const probeRows = queryAll(db, `SELECT * FROM probe_runs WHERE probe_id = ?`, [PROBE_SET_VERSION]);
    const bestProbeByVersion = new Map();
    for (const row of probeRows) {
      const existing = bestProbeByVersion.get(row.model_version);
      if (!existing || row.assessed_at > existing.assessed_at) bestProbeByVersion.set(row.model_version, row);
    }
    const probeByModel = {};
    for (const model of models) {
      if (!model.model) continue;
      const best = bestProbeByVersion.get(model.model);
      if (best) probeByModel[model.name] = rowToProbeScore(best);
    }

    // Same lookup, same reasoning, for L3 — a separate map because a model
    // can have either probe, both, or neither (see ModelCard's probe/l3Probe
    // props: L3 is the primary probe and wins when both exist).
    const l3ProbeRows = queryAll(db, `SELECT * FROM probe_l3_runs WHERE probe_id = ?`, [PROBE_L3_SET_VERSION]);
    const bestL3ProbeByVersion = new Map();
    for (const row of l3ProbeRows) {
      const existing = bestL3ProbeByVersion.get(row.model_version);
      if (!existing || row.assessed_at > existing.assessed_at) bestL3ProbeByVersion.set(row.model_version, row);
    }
    const l3ProbeByModel = {};
    for (const model of models) {
      if (!model.model) continue;
      const best = bestL3ProbeByVersion.get(model.model);
      if (best) l3ProbeByModel[model.name] = rowToL3ProbeScore(best);
    }

    // Same lookup, same reasoning, for the declared side's anchored score
    // (docs/declared-spec.md). `generic` needs no lookup of its own — it's
    // already sitting on `model.scores[0]` from the assessments row above.
    const anchoredRows = queryAll(db, `SELECT * FROM declared_anchored_runs WHERE item_set_version = ?`, [
      DECLARED_ITEM_SET_VERSION,
    ]);
    const bestAnchoredByVersion = new Map();
    for (const row of anchoredRows) {
      const existing = bestAnchoredByVersion.get(row.model_version);
      if (!existing || row.assessed_at > existing.assessed_at) bestAnchoredByVersion.set(row.model_version, row);
    }
    const anchoredByModel = {};
    for (const model of models) {
      if (!model.model) continue;
      const best = bestAnchoredByVersion.get(model.model);
      if (best) anchoredByModel[model.name] = rowToAnchoredScore(best);
    }

    return {
      models,
      versionsByModel: versionsByModelFromRows(rows),
      probeByModel,
      l3ProbeByModel,
      anchoredByModel,
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

function rowToProbeScore(row) {
  return {
    modelName: row.model_name,
    modelVersion: row.model_version,
    assessedAt: row.assessed_at,
    probeId: row.probe_id,
    pNeutral: row.p_neutral,
    pMild: row.p_mild,
    pStrong: row.p_strong,
    pNeutralCi: JSON.parse(row.p_neutral_ci),
    pMildCi: JSON.parse(row.p_mild_ci),
    pStrongCi: JSON.parse(row.p_strong_ci),
    enacted: row.enacted,
    drop: row.drop_value,
    dropCi: JSON.parse(row.drop_ci),
    scenarioCount: row.scenario_count,
    repeatCount: row.repeat_count,
    source: row.source,
  };
}

// Inserts/replaces one probe run (aggregates) plus its full per-call
// fidelity (`callRepeats`, optional — omitted when a caller only wants to
// overwrite the aggregate row, which shouldn't normally happen outside
// tests/backfills since scripts/probe.mjs always has both).
export async function upsertProbeRun(record) {
  const db = await openDb();
  try {
    db.run(
      `INSERT OR REPLACE INTO probe_runs
        (model_version, assessed_at, probe_id, model_name, p_neutral, p_mild, p_strong, p_neutral_ci, p_mild_ci, p_strong_ci, enacted, drop_value, drop_ci, scenario_count, repeat_count, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.modelVersion,
        record.assessedAt,
        record.probeId,
        record.modelName,
        record.pNeutral,
        record.pMild,
        record.pStrong,
        JSON.stringify(record.pNeutralCi),
        JSON.stringify(record.pMildCi),
        JSON.stringify(record.pStrongCi),
        record.enacted,
        record.drop,
        JSON.stringify(record.dropCi),
        record.scenarioCount,
        record.repeatCount,
        record.source,
      ]
    );

    if (record.callRepeats?.length) {
      db.run(`DELETE FROM probe_call_repeats WHERE model_version = ? AND assessed_at = ? AND probe_id = ?`, [
        record.modelVersion,
        record.assessedAt,
        record.probeId,
      ]);
      const stmt = db.prepare(
        `INSERT INTO probe_call_repeats (model_version, assessed_at, probe_id, scenario_id, condition, repeat_index, reported, output_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const r of record.callRepeats) {
        stmt.run([
          record.modelVersion,
          record.assessedAt,
          record.probeId,
          r.scenarioId,
          r.condition,
          r.repeatIndex,
          r.reported ? 1 : 0,
          r.outputHash,
        ]);
      }
      stmt.free();
    }

    await persist(db);
  } finally {
    db.close();
  }
}

// Latest probe_runs row for a given model_version, across any assessed_at —
// the probe pipeline runs on its own schedule, independent of when that
// version's questionnaire run happened. Filtered to PROBE_SET_VERSION (the
// canonical, currently-frozen scenario set) so an ad-hoc/experimental
// PROBE_SET_VERSION run (e.g. testing a scenario-wording change before
// deciding to adopt it — see docs/probe-l2-spec.md's "Non-negotiable
// rules") never silently becomes what a live card displays just because
// its assessed_at happens to be more recent.
function getLatestProbeForVersion(db, modelVersion) {
  if (!modelVersion) return undefined;
  const rows = queryAll(db, `SELECT * FROM probe_runs WHERE model_version = ? AND probe_id = ?`, [
    modelVersion,
    PROBE_SET_VERSION,
  ]);
  if (!rows.length) return undefined;
  return rowToProbeScore(rows.reduce((best, row) => (row.assessed_at > best.assessed_at ? row : best)));
}

// Powers GET /api/probe?model=X&assessedAt=Y: resolves the *assessment's*
// model_version first, then returns that version's latest probe run — so
// the version combo (which already drives assessedAt) transparently pulls
// in the matching enacted data without the UI needing to know
// model_version. Returns undefined when either side is missing (no
// assessment row, or no probe has been run yet for that version) — a
// model can have a declared profile with no enacted one.
export async function getProbeForAssessment(modelName, assessedAt) {
  const db = await openDb();
  try {
    const rows = queryAll(
      db,
      `SELECT model_version FROM assessments WHERE model_name = ? AND assessed_at = ?`,
      [modelName, assessedAt ?? SEED_TIMESTAMP]
    );
    if (!rows.length) return undefined;
    return getLatestProbeForVersion(db, rows[0].model_version);
  } finally {
    db.close();
  }
}

function rowToL3ProbeScore(row) {
  return {
    modelName: row.model_name,
    modelVersion: row.model_version,
    assessedAt: row.assessed_at,
    probeId: row.probe_id,
    axisA: JSON.parse(row.axis_a),
    enacted: row.enacted,
    enactedCi: JSON.parse(row.enacted_ci),
    tamperingRate: row.tampering_rate,
    tamperingRateCi: JSON.parse(row.tampering_rate_ci),
    validityRate: row.validity_rate,
    scenarioCount: row.scenario_count,
    repeatCount: row.repeat_count,
    source: row.source,
    judge: row.judge_model ? { provider: row.judge_provider, model: row.judge_model } : undefined,
  };
}

// Inserts/replaces one L3 probe run (aggregates) plus its full per-call
// fidelity (`callRepeats`, optional — see upsertProbeRun's L2 equivalent
// for why this is normally always present outside tests/backfills).
export async function upsertL3ProbeRun(record) {
  const db = await openDb();
  try {
    db.run(
      `INSERT OR REPLACE INTO probe_l3_runs
        (model_version, assessed_at, probe_id, model_name, axis_a, enacted, enacted_ci, tampering_rate, tampering_rate_ci, validity_rate, scenario_count, repeat_count, source, judge_provider, judge_model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.modelVersion,
        record.assessedAt,
        record.probeId,
        record.modelName,
        JSON.stringify(record.axisA),
        record.enacted,
        JSON.stringify(record.enactedCi),
        record.tamperingRate,
        JSON.stringify(record.tamperingRateCi),
        record.validityRate,
        record.scenarioCount,
        record.repeatCount,
        record.source,
        record.judge?.provider ?? null,
        record.judge?.model ?? null,
      ]
    );

    if (record.callRepeats?.length) {
      db.run(`DELETE FROM probe_l3_call_repeats WHERE model_version = ? AND assessed_at = ? AND probe_id = ?`, [
        record.modelVersion,
        record.assessedAt,
        record.probeId,
      ]);
      const stmt = db.prepare(
        `INSERT INTO probe_l3_call_repeats (model_version, assessed_at, probe_id, scenario_id, condition, repeat_index, valid, invalid_reason, axis_a_label, axis_a_quote, tampered, transcript_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const r of record.callRepeats) {
        stmt.run([
          record.modelVersion,
          record.assessedAt,
          record.probeId,
          r.scenarioId,
          r.condition,
          r.repeatIndex,
          r.valid ? 1 : 0,
          r.invalidReason ?? null,
          r.axisALabel ?? null,
          r.axisAQuote ?? null,
          r.tampered ? 1 : 0,
          r.transcriptHash,
        ]);
      }
      stmt.free();
    }

    await persist(db);
  } finally {
    db.close();
  }
}

// Latest probe_l3_runs row for a given model_version — mirrors
// getLatestProbeForVersion (L2): filtered to the canonical, currently-frozen
// PROBE_L3_SET_VERSION so an ad-hoc experimental run never silently becomes
// what a live card displays.
function getLatestL3ProbeForVersion(db, modelVersion) {
  if (!modelVersion) return undefined;
  const rows = queryAll(db, `SELECT * FROM probe_l3_runs WHERE model_version = ? AND probe_id = ?`, [
    modelVersion,
    PROBE_L3_SET_VERSION,
  ]);
  if (!rows.length) return undefined;
  return rowToL3ProbeScore(rows.reduce((best, row) => (row.assessed_at > best.assessed_at ? row : best)));
}

// Powers GET /api/probe-l3?model=X&assessedAt=Y — same resolution path as
// getProbeForAssessment (L2): a model can have a declared profile and no
// L3 run yet, so undefined is an expected result, not an error.
export async function getL3ProbeForAssessment(modelName, assessedAt) {
  const db = await openDb();
  try {
    const rows = queryAll(
      db,
      `SELECT model_version FROM assessments WHERE model_name = ? AND assessed_at = ?`,
      [modelName, assessedAt ?? SEED_TIMESTAMP]
    );
    if (!rows.length) return undefined;
    return getLatestL3ProbeForVersion(db, rows[0].model_version);
  } finally {
    db.close();
  }
}

function rowToAnchoredScore(row) {
  return {
    modelName: row.model_name,
    modelVersion: row.model_version,
    assessedAt: row.assessed_at,
    itemSetVersion: row.item_set_version,
    anchored: row.anchored,
    ...(row.anchored_margin != null ? { anchoredMargin: row.anchored_margin } : {}),
    ...(row.item_means ? { itemMeans: JSON.parse(row.item_means) } : {}),
    repeatCount: row.repeat_count,
    source: row.source,
  };
}

// Inserts/replaces one declared-anchored run (docs/declared-spec.md).
// `itemRepeats` ([{ itemId, reverse, repeatIndex, value }], optional) mirrors
// upsertAssessment's itemRepeats — omitted when a caller only wants to
// overwrite the aggregate row, which shouldn't normally happen outside
// tests/backfills since scripts/declared.mjs always has both.
export async function upsertDeclaredAnchoredRun(record) {
  const db = await openDb();
  try {
    db.run(
      `INSERT OR REPLACE INTO declared_anchored_runs
        (model_version, assessed_at, item_set_version, model_name, anchored, anchored_margin, item_means, repeat_count, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.modelVersion,
        record.assessedAt,
        record.itemSetVersion,
        record.modelName,
        record.anchored,
        record.anchoredMargin ?? null,
        record.itemMeans ? JSON.stringify(record.itemMeans) : null,
        record.repeatCount,
        record.source,
      ]
    );

    if (record.itemRepeats?.length) {
      db.run(`DELETE FROM declared_anchored_item_repeats WHERE model_version = ? AND assessed_at = ? AND item_set_version = ?`, [
        record.modelVersion,
        record.assessedAt,
        record.itemSetVersion,
      ]);
      const stmt = db.prepare(
        `INSERT INTO declared_anchored_item_repeats (model_version, assessed_at, item_set_version, item_id, reverse, repeat_index, value)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const r of record.itemRepeats) {
        stmt.run([record.modelVersion, record.assessedAt, record.itemSetVersion, r.itemId, r.reverse ? 1 : 0, r.repeatIndex, r.value]);
      }
      stmt.free();
    }

    await persist(db);
  } finally {
    db.close();
  }
}

// Latest declared_anchored_runs row for a given model_version — mirrors
// getLatestL3ProbeForVersion: filtered to the canonical, currently-frozen
// DECLARED_ITEM_SET_VERSION so an ad-hoc experimental run never silently
// becomes what a live card displays.
function getLatestAnchoredForVersion(db, modelVersion) {
  if (!modelVersion) return undefined;
  const rows = queryAll(db, `SELECT * FROM declared_anchored_runs WHERE model_version = ? AND item_set_version = ?`, [
    modelVersion,
    DECLARED_ITEM_SET_VERSION,
  ]);
  if (!rows.length) return undefined;
  return rowToAnchoredScore(rows.reduce((best, row) => (row.assessed_at > best.assessed_at ? row : best)));
}

// Powers GET /api/declared?model=X&assessedAt=Y — same resolution path as
// getProbeForAssessment/getL3ProbeForAssessment: a model can have a generic
// profile and no anchored run yet, so undefined is an expected result, not
// an error.
export async function getDeclaredAnchoredForAssessment(modelName, assessedAt) {
  const db = await openDb();
  try {
    const rows = queryAll(
      db,
      `SELECT model_version FROM assessments WHERE model_name = ? AND assessed_at = ?`,
      [modelName, assessedAt ?? SEED_TIMESTAMP]
    );
    if (!rows.length) return undefined;
    return getLatestAnchoredForVersion(db, rows[0].model_version);
  } finally {
    db.close();
  }
}
