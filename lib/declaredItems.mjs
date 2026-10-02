// Loads and validates the declared side's action-anchored item banks
// (docs/declared-spec.md). One bank per construct (docs/constructs.md), one
// JSON file per frozen/versioned item set under the bank's directory — same
// file shape as items.sample.json ({ meta, items }, same id/domain/facet/
// text_en/reverse per-item fields) so the generic bank's batching/
// reverse-score/rescale code needs no new parsing path for these.
//
// validateDeclaredItem/validateDeclaredItemSet back both scripts/declared.mjs
// (refuses to run on an invalid set) and tests/declared-items.test.mjs.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// The banks, keyed by the item-set prefix (RF-v3 -> RF). `facets` are the
// recurring situations of the construct's probe — every item is anchored to
// one of them, never a bare trait adjective. `domain` is what every item
// carries: "H" for RF (frozen as written), the construct's own code for the
// banks added 2026-10-02 (docs/declared-spec.md, "Constructs 2 and 3").
// `subject` and `exampleId` go into the administration prompt; RF's are the
// exact words its runs were given, so RF stays byte-identical.
export const DECLARED_BANKS = {
  RF: {
    construct: "report fidelity",
    dir: "items/report-fidelity",
    domain: "H",
    facets: ["Incompleteness", "Disclosure", "Fault"],
    subject: "how you typically report on your own work",
    exampleId: "RF-v1-004",
  },
  GD: {
    construct: "goal disengagement",
    dir: "items/goal-disengagement",
    domain: "GD",
    facets: ["Recognition", "Stopping", "Reengagement"],
    subject: "how you typically handle your own work",
    exampleId: "GD-v1-004",
  },
  PF: {
    construct: "prevention focus",
    dir: "items/prevention-focus",
    domain: "PF",
    facets: ["Verification", "Restraint", "Contradiction"],
    subject: "how you typically handle your own work",
    exampleId: "PF-v1-004",
  },
};

/** The bank an item-set version belongs to ("GD-v1" -> DECLARED_BANKS.GD). */
export function bankFor(itemSetVersion) {
  const prefix = String(itemSetVersion).split("-")[0];
  const bank = DECLARED_BANKS[prefix];
  if (!bank) throw new Error(`unknown item set "${itemSetVersion}" — its prefix must be one of ${Object.keys(DECLARED_BANKS).join(", ")}`);
  return bank;
}

// Every frozen item-set file on disk, in every bank, not just the one
// scripts/declared.mjs currently administers — CI validates all of them
// (tests/declared-items.test.mjs) so an older, still-referenced-for-the-
// bridge version (docs/declared-spec.md's rotation rule) never silently
// drifts out of coverage.
export async function listDeclaredItemSetVersions() {
  const versions = [];
  for (const bank of Object.values(DECLARED_BANKS)) {
    const files = await readdir(bank.dir);
    versions.push(...files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length)));
  }
  return versions.sort();
}

const MIN_ITEMS = 8;

/** Returns an array of human-readable problems for one item; empty means valid. */
export function validateDeclaredItem(item, index, bank = DECLARED_BANKS.RF) {
  const issues = [];
  const label = item?.id ?? `item[${index}]`;

  if (!item.id || typeof item.id !== "string") {
    issues.push(`${label}: missing or non-string "id"`);
  }
  if (item.domain !== bank.domain) {
    issues.push(`${label}: domain must be "${bank.domain}" — a bank operationalises only its own construct (docs/declared-spec.md)`);
  }
  if (!bank.facets.includes(item.facet)) {
    issues.push(`${label}: facet "${item.facet}" must be one of ${bank.facets.join(", ")}`);
  }
  if (!item.text_en || typeof item.text_en !== "string" || !item.text_en.trim()) {
    issues.push(`${label}: missing or empty "text_en"`);
  }
  if (typeof item.reverse !== "boolean") {
    issues.push(`${label}: "reverse" must be a boolean`);
  }

  return issues;
}

/** Cross-item checks: uniqueness, id numbering, facet coverage, minimum count, reverse-score share. */
export function validateDeclaredItemSet(items, bank = DECLARED_BANKS.RF, itemSetVersion = null) {
  const issues = [];

  if (items.length < MIN_ITEMS) {
    issues.push(`item set has ${items.length} items, fewer than the ${MIN_ITEMS}-item pilot floor`);
  }

  const idCounts = new Map();
  const textCounts = new Map();
  for (const item of items) {
    if (item.id) idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
    if (item.text_en) textCounts.set(item.text_en, (textCounts.get(item.text_en) ?? 0) + 1);
  }
  for (const [id, count] of idCounts) {
    if (count > 1) issues.push(`id "${id}" is reused across ${count} items — every item needs a unique id`);
  }
  for (const [text, count] of textCounts) {
    if (count > 1) issues.push(`text_en "${text}" is duplicated across ${count} items`);
  }
  if (itemSetVersion) {
    const numbered = new RegExp(`^${itemSetVersion}-\\d{3}$`);
    for (const item of items.filter((i) => !numbered.test(i.id ?? ""))) {
      issues.push(`id "${item.id}" doesn't follow the file's ${itemSetVersion}-NNN numbering`);
    }
  }

  const missingFacets = bank.facets.filter((f) => !items.some((item) => item.facet === f));
  if (missingFacets.length) {
    issues.push(`no item covers facet(s): ${missingFacets.join(", ")} — every recurring situation needs at least one item`);
  }

  const reverseCount = items.filter((item) => item.reverse === true).length;
  const minReverse = Math.floor(items.length / 3);
  if (reverseCount < minReverse) {
    issues.push(`only ${reverseCount}/${items.length} items are reverse-scored — need at least a third (${minReverse}) as an acquiescence-bias guard`);
  }

  return issues;
}

export async function loadDeclaredItems(itemSetVersion) {
  const bank = bankFor(itemSetVersion);
  const filePath = path.join(bank.dir, `${itemSetVersion}.json`);
  const raw = await readFile(filePath, "utf8");
  const { meta, items } = JSON.parse(raw);
  return { meta, items, bank, _file: `${itemSetVersion}.json` };
}
