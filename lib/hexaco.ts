// Domain order and codes (H, E, X, A, C, O) mirror the `domain` field order
// found in the item bank schema (items.sample.json): the six HEXACO axes are
// always read/written in this fixed order end-to-end, from raw items to
// aggregated scores.
export const HEXACO_CODES = ["H", "E", "X", "A", "C", "O"] as const;

export const HEXACO_LABELS: Record<(typeof HEXACO_CODES)[number], string> = {
  H: "Honesty-Humility",
  E: "Emotionality",
  X: "Extraversion",
  A: "Agreeableness",
  C: "Conscientiousness",
  O: "Openness",
};

export interface ModelScore {
  name: string;
  monogram: string;
  hue: number;
  /** 6 values (0-100), in H, E, X, A, C, O order. */
  scores: [number, number, number, number, number, number];
  /** English self-interpretation sentence — the language every "live" run is actually generated in. */
  oneLiner: string;
  /** Italian translation of `oneLiner`. Undefined until translated (see scripts/assess.mjs / scripts/translate-onliners.mjs). */
  oneLinerIt?: string;
  dominant: string;
  /**
   * Optional per-domain uncertainty band half-width (same order/scale as
   * `scores`), e.g. 1.96 x SEM from repeated administrations. Falls back to
   * RadarChart's fixed illustrative margin when omitted (current mock data).
   */
  margin?: [number, number, number, number, number, number];
  /** "live" = scored by actually calling the model's API (scripts/assess.mjs); "fake" = illustrative mock data. */
  source: "live" | "fake";
  /** False when a higher-version run of this model exists — renders as "Archived" instead of "live". Undefined (e.g. static mock JSON) is treated as current. */
  isCurrent?: boolean;
  /** Exact provider model string used for this run (e.g. "gemini-3.6-flash"). Only set when source is "live". */
  model?: string;
  /** ISO timestamp of the assess.mjs run that produced this entry. Only set when source is "live". */
  assessedAt?: string;
}

