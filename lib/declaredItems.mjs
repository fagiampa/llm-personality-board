// Loads and validates the declared side's action-anchored item bank
// (docs/declared-spec.md). One JSON file per frozen/versioned item set under
// items/report-fidelity/ — same file shape as items.sample.json ({ meta,
// items }, same id/domain/facet/text_en/reverse per-item fields) so the
// generic bank's batching/reverse-score/rescale code needs no new parsing
// path for this one.
//
// validateDeclaredItem/validateDeclaredItemSet back both scripts/declared.mjs
// (refuses to run on an invalid set) and tests/declared-items.test.mjs.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

export const DECLARED_ITEMS_ROOT = "items/report-fidelity";

// Every frozen item-set file on disk (RF-v1, RF-v2, ...), not just the one
// scripts/declared.mjs currently administers — CI validates all of them
// (tests/declared-items.test.mjs) so an older, still-referenced-for-the-
// bridge version (docs/declared-spec.md's rotation rule) never silently
// drifts out of coverage the way `npm test` only checking the "current"
// scenario set would.
export async function listDeclaredItemSetVersions() {
  const files = await readdir(DECLARED_ITEMS_ROOT);
  return files.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length)).sort();
}

// The three recurring situations the L2/L3 probe scenarios enact (docs/
// declared-spec.md) — every RF-v1 item is anchored to one of these, never a
// bare trait adjective, or it belongs in the generic bank instead.
export const DECLARED_FACETS = ["Incompleteness", "Disclosure", "Fault"];

const MIN_ITEMS = 8;

/** Returns an array of human-readable problems for one item; empty means valid. */
export function validateDeclaredItem(item, index) {
  const issues = [];
  const label = item?.id ?? `item[${index}]`;

  if (!item.id || typeof item.id !== "string") {
    issues.push(`${label}: missing or non-string "id"`);
  }
  if (item.domain !== "H") {
    issues.push(`${label}: domain must be "H" — anchored only operationalises the construct enacted also measures (docs/declared-spec.md)`);
  }
  if (!DECLARED_FACETS.includes(item.facet)) {
    issues.push(`${label}: facet "${item.facet}" must be one of ${DECLARED_FACETS.join(", ")}`);
  }
  if (!item.text_en || typeof item.text_en !== "string" || !item.text_en.trim()) {
    issues.push(`${label}: missing or empty "text_en"`);
  }
  if (typeof item.reverse !== "boolean") {
    issues.push(`${label}: "reverse" must be a boolean`);
  }

  return issues;
}

/** Cross-item checks: uniqueness, facet coverage, minimum count, reverse-score share. */
export function validateDeclaredItemSet(items) {
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

  const missingFacets = DECLARED_FACETS.filter((f) => !items.some((item) => item.facet === f));
  if (missingFacets.length) {
    issues.push(`no item covers facet(s): ${missingFacets.join(", ")} — all three recurring situations need at least one item`);
  }

  const reverseCount = items.filter((item) => item.reverse === true).length;
  const minReverse = Math.floor(items.length / 3);
  if (reverseCount < minReverse) {
    issues.push(`only ${reverseCount}/${items.length} items are reverse-scored — need at least a third (${minReverse}) as an acquiescence-bias guard`);
  }

  return issues;
}

export async function loadDeclaredItems(itemSetVersion) {
  const filePath = path.join(DECLARED_ITEMS_ROOT, `${itemSetVersion}.json`);
  const raw = await readFile(filePath, "utf8");
  const { meta, items } = JSON.parse(raw);
  return { meta, items, _file: `${itemSetVersion}.json` };
}
