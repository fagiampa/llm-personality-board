// Second half of an L3 run judged in batch mode (lib/probeL3Config.mjs's
// PROBE_L3_JUDGE_MODE): fetches the judge's labels from OpenAI, writes them
// into the raw JSONL, and writes the DB record scripts/probe-l3.mjs left
// pending. Safe to run any time, any number of times: a batch still in
// progress is reported and left alone; a finished one is saved locally
// first (CLAUDE.md, rule 6) and then used.
//
// Usage: npm run probe-l3:collect [-- [--resubmit] [--accept-missing] [<manifest.judge-batch.json> ...]]
//   no manifest given: every manifest under data/probe-raw/ not yet collected.
//   --resubmit: runs with no judge answer (expired/cancelled batch) go out
//     again in a new batch. A manifest with no batch at all (the submit in
//     probe-l3 failed) is submitted without the flag.
//   --accept-missing: count runs with no judge answer as judge_failed and
//     write the record anyway.
//
// A judge answer that can't be parsed, or a 4xx, is judge_failed, as in sync
// mode. A 429/5xx counts as no answer (--resubmit), since in sync mode the
// SDK retries those by itself.

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { upsertL3ProbeRun } from "../lib/db.mjs";
import { makeJudgeBatchClient } from "../lib/l3JudgeBatch.mjs";
import { collectManifest } from "../lib/l3JudgeCollect.mjs";

const args = process.argv.slice(2);
const RESUBMIT = args.includes("--resubmit");
const ACCEPT_MISSING = args.includes("--accept-missing");
const manifestArgs = args.filter((a) => !a.startsWith("--"));

async function walk(dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = path.join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

async function main() {
  const manifests = manifestArgs.length
    ? manifestArgs
    : (await walk("data/probe-raw")).filter((f) => f.endsWith(".judge-batch.json"));
  const client = makeJudgeBatchClient();
  let open = 0;
  for (const manifestPath of manifests) {
    const { status } = JSON.parse(await readFile(manifestPath, "utf8"));
    if (status !== "submitted") continue;
    open++;
    try {
      await collectManifest(client, manifestPath, { resubmit: RESUBMIT, acceptMissing: ACCEPT_MISSING, upsert: upsertL3ProbeRun });
    } catch (err) {
      console.warn(`${manifestPath}: ${err.message}`);
    }
  }
  if (!open) console.log("No judge batches waiting.");
  else console.log("\nAfter a record is written: npm run export-raw, then commit (CLAUDE.md, Deployment).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
