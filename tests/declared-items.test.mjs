// CI check for the declared side's item bank(s) (docs/declared-spec.md).
// Mirrors tests/l3-scenarios.test.mjs / tests/scenarios.test.mjs for the
// probes' scenario sets. Validates every frozen version found on disk
// (RF-v1, RF-v2, ...), not just the one currently administered by
// scripts/declared.mjs — an older version stays referenced for the
// rotation bridge (docs/declared-spec.md) and must stay valid too.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadDeclaredItems, validateDeclaredItem, validateDeclaredItemSet, listDeclaredItemSetVersions } from "../lib/declaredItems.mjs";

const versions = await listDeclaredItemSetVersions();

test("at least one declared item-set version exists on disk", () => {
  assert.ok(versions.length > 0, "no item-set files found under items/report-fidelity/");
});

for (const version of versions) {
  const { items } = await loadDeclaredItems(version);

  test(`${version} has at least one item`, () => {
    assert.ok(items.length > 0, `no items found in items/report-fidelity/${version}.json`);
  });

  for (const [index, item] of items.entries()) {
    test(`${version} ${item.id ?? `item[${index}]`}: passes validity rules`, () => {
      const issues = validateDeclaredItem(item, index);
      assert.deepEqual(issues, []);
    });
  }

  test(`${version}: cross-item checks (uniqueness, facet coverage, reverse-score share)`, () => {
    const issues = validateDeclaredItemSet(items);
    assert.deepEqual(issues, []);
  });
}
