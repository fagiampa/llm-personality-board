// CI check for the declared side's item banks (docs/declared-spec.md).
// Mirrors tests/l3-scenarios.test.mjs / tests/scenarios.test.mjs for the
// probes' scenario sets. Validates every frozen version found on disk, in
// every construct's bank (RF-v1…, GD-v1, PF-v1), not just the one currently
// administered by scripts/declared.mjs — an older version stays referenced
// for the rotation bridge (docs/declared-spec.md) and must stay valid too.
//
// Run: npm test

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadDeclaredItems,
  validateDeclaredItem,
  validateDeclaredItemSet,
  listDeclaredItemSetVersions,
  DECLARED_BANKS,
  bankFor,
} from "../lib/declaredItems.mjs";
import { PUBLISHED_DECLARED_SET } from "../lib/declaredConfig.mjs";

const versions = await listDeclaredItemSetVersions();

test("every construct's bank has at least one item-set version on disk", () => {
  for (const [prefix, bank] of Object.entries(DECLARED_BANKS)) {
    assert.ok(versions.some((v) => v.startsWith(`${prefix}-`)), `no item-set files found under ${bank.dir}/`);
  }
});

test("the card's item set is a report-fidelity set that exists on disk", () => {
  assert.equal(bankFor(PUBLISHED_DECLARED_SET), DECLARED_BANKS.RF);
  assert.ok(versions.includes(PUBLISHED_DECLARED_SET));
});

for (const version of versions) {
  const { items, bank } = await loadDeclaredItems(version);

  test(`${version} has at least one item`, () => {
    assert.ok(items.length > 0, `no items found in ${bank.dir}/${version}.json`);
  });

  for (const [index, item] of items.entries()) {
    test(`${version} ${item.id ?? `item[${index}]`}: passes validity rules`, () => {
      const issues = validateDeclaredItem(item, index, bank);
      assert.deepEqual(issues, []);
    });
  }

  test(`${version}: cross-item checks (uniqueness, numbering, facet coverage, reverse-score share)`, () => {
    const issues = validateDeclaredItemSet(items, bank, version);
    assert.deepEqual(issues, []);
  });
}
