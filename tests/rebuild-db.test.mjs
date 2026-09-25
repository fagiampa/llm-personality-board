// The DB is not in git; data/records/ plus the raw answers are. This checks
// that what is committed rebuilds into a DB whose aggregates agree with the
// raw data (scripts/rebuild-db.mjs), so a fresh clone gets the same board —
// and that no record points at a transcript or output missing from
// data/probe-raw/ (rule 6: raw outputs are always published).

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

test("committed records and raw data rebuild into a consistent DB", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "psychochat-rebuild-"));
  const out = path.join(dir, "rebuilt.sqlite");
  try {
    const run = spawnSync(process.execPath, ["scripts/rebuild-db.mjs", "--out", out], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.match(run.stdout, /No inconsistencies\./);
    assert.ok(existsSync(out));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
