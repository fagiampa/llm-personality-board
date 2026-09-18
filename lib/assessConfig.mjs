// Single source of truth for the assessment repeat count, shared between
// scripts/assess.mjs (how many times each item is actually sampled) and the
// Next.js app (the radar chart legend text quoting that same number) — keeps
// the two from silently drifting apart if one gets changed without the other.
export const ASSESS_REPEATS = Number(process.env.ASSESS_REPEATS ?? 3);

// Below this fraction of expected (item × repeat) samples successfully
// collected, scripts/assess.mjs discards a run instead of writing it — see
// its own comment for why. Shared here too so the methodology page quotes
// the actual configured threshold instead of a hardcoded number.
export const ASSESS_MIN_SUCCESS_RATIO = Number(process.env.ASSESS_MIN_SUCCESS_RATIO ?? 0.8);
