// One-off migration: imports every ModelScore entry currently sitting in
// data/mock-scores.json and every data/history/*.json backup into the
// SQLite DB (lib/db.mjs), so the DB's history matches what assess.mjs's
// filesystem backups already captured before this moved to a DB.
//
// None of these imported rows carry item-level data (individual question
// answers) — assess.mjs never persisted those before this migration, only
// the aggregated per-domain scores. Only runs of the updated assess.mjs
// going forward populate item_means / assessment_item_repeats.
//
// Usage: npm run db:import

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { upsertAssessment } from "../lib/db.mjs";

const MOCK_SCORES_PATH = "data/mock-scores.json";
const HISTORY_DIR = "data/history";

function toRecord(entry) {
  return {
    modelName: entry.name,
    assessedAt: entry.assessedAt ?? null,
    modelVersion: entry.model ?? null,
    monogram: entry.monogram,
    hue: entry.hue,
    scores: entry.scores,
    margin: entry.margin,
    oneLiner: entry.oneLiner,
    dominant: entry.dominant,
    source: entry.source,
  };
}

async function importFile(filePath) {
  const raw = JSON.parse(await readFile(filePath, "utf8"));
  let count = 0;
  for (const entry of raw) {
    await upsertAssessment(toRecord(entry));
    count++;
  }
  return count;
}

async function main() {
  let total = 0;

  total += await importFile(path.resolve(MOCK_SCORES_PATH));
  console.log(`Imported ${MOCK_SCORES_PATH}`);

  let historyFiles = [];
  try {
    historyFiles = (await readdir(HISTORY_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    // no history dir — fine, nothing else to import
  }
  for (const file of historyFiles) {
    total += await importFile(path.join(HISTORY_DIR, file));
    console.log(`Imported ${path.join(HISTORY_DIR, file)}`);
  }

  console.log(`\nDone — upserted ${total} assessment rows into data/psychochat.sqlite`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
