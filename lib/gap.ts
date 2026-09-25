// Formatting/reading helpers for the card's two deltas (docs/declared-spec.md).
// Shared by the i18n aria labels (the card chart itself is components/RadarChart.tsx).

// Both deltas keep their sign (docs/declared-spec.md): delta_specificity =
// generic - anchored (positive = the claim deflates once it's about an
// action; negative = it inflates), gap = anchored - enacted (positive = says
// more than it does). An absolute value hides which way a model moved.
// A true minus sign, not a hyphen, so "−10" doesn't read as a dash.
export function signed(value: number) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "\u2212"}${Math.abs(value)}`;
}

// A gap of 0 with both points pinned to the same end of the scale isn't
// "declared and enacted agree" — it's "the instrument has no room left to
// show a difference" (a double ceiling, or floor). Flagged on the card so
// it isn't read as perfect consistency.
export function isCensored(anchored: number, enacted: number) {
  const a = Math.round(anchored);
  const e = Math.round(enacted);
  return (a === 100 && e === 100) || (a === 0 && e === 0);
}
