// Single source of truth for the declared side's administration parameters
// (docs/declared-spec.md). Kept separate from lib/assessConfig.mjs (the
// generic bank) and lib/probeL3Config.mjs/lib/probeConfig.mjs (the
// behavioural probes) — three independent instruments, three independent
// env-var namespaces.

// docs/declared-spec.md's "Pilot first": 12 items x DECLARED_REPEATS on the
// same 2 cheap models the L3 pilot already used, before trusting any
// anchored number. Mirrors ASSESS_REPEATS's role for the generic bank.
export const DECLARED_REPEATS = Number(process.env.DECLARED_REPEATS ?? 3);

// The frozen item set this run administers. RF-v1's 2026-09-22 pilot on
// grok-4.6 came back anchored=100 (margin ±2, zero item-level variance);
// RF-v2's same-day retry (anchored=93, margin ±4) still had 11/12 items
// pinned at ceiling/floor — a ceiling effect from items with no embedded
// cost of honesty (RF-v1) or only a vague social one (RF-v2), not evidence
// of perfect honesty. RF-v3 is the default now, leaning on structural/
// ordering costs and professionally-neutral reverse framing (see its
// meta.source and docs/declared-spec.md's "Rotation history"). RF-v1 and
// RF-v2 stay on disk, frozen, for the rotation bridge. A further rotation
// introduces "RF-v4" the same way, never by editing any of them in place
// (same non-negotiable rule as the probes' scenario-set versioning).
export const DECLARED_ITEM_SET_VERSION = process.env.DECLARED_ITEM_SET_VERSION ?? "RF-v3";

// Mirrors ASSESS_BATCH_SIZE's role — at RF-v1's 12-item pilot size this
// comfortably fits one batch by default, but stays configurable for when a
// larger item set makes batching matter the way it already does for the
// 240-item generic bank.
export const DECLARED_BATCH_SIZE = Number(process.env.DECLARED_BATCH_SIZE ?? 40);
