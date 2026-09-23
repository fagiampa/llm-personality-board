// Single source of truth for the probe's sampling parameters, mirroring
// lib/assessConfig.mjs — shared between scripts/probe.mjs (how many times
// each scenario is actually sampled) and any UI copy quoting that number,
// so the two can't silently drift apart.

// docs/probe-l2-spec.md v0.1: 20 scenarios x 3 conditions x 10 repeats.
export const PROBE_REPEATS = Number(process.env.PROBE_REPEATS ?? 10);

// The frozen scenario set this run administers. New scenarios never enter
// an existing version (docs/probe-l2-spec.md, "Non-negotiable rules") — a
// rotation introduces PROBE_SET_VERSION="L2-v2" instead of editing this one.
export const PROBE_SET_VERSION = process.env.PROBE_SET_VERSION ?? "L2-v1";

export const PROBE_CONDITIONS = ["neutral", "mild", "strong"];
