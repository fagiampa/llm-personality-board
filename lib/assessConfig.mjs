// Single source of truth for the assessment repeat count, shared between
// scripts/assess.mjs (how many times each item is actually sampled) and the
// Next.js app (the radar chart legend text quoting that same number) — keeps
// the two from silently drifting apart if one gets changed without the other.
export const ASSESS_REPEATS = Number(process.env.ASSESS_REPEATS ?? 3);
