import { CY, MAX_R } from "./RadarChart";

const VIEW_WIDTH = 70;
const AXIS_X = 42;
// No numbers on the card (per direct instruction, 2026-09-23: the printed
// deltas were hard to read) — the dots alone carry it. `anchored` is drawn
// larger than the other two so that when it and `enacted` sit at the same
// value (e.g. both at 100), the hollow enacted ring lands visibly *inside*
// the anchored disc instead of hiding it. The exact values stay in the
// aria-label.
const DOT_R = 4;
const ANCHORED_R = 7;

// This ruler's top (100) sits exactly where RadarChart.tsx's H vertex sits
// (CY - MAX_R) and its bottom (0) sits exactly where the opposite vertex,
// A, sits (CY + MAX_R) — the radar's own H-to-A span, not just its H-to-
// centre half of it. Same pixel scale as the radar (ModelCard.module.css
// gives both the same rendered height), so this column ends up exactly as
// tall as the radar itself, doubling this axis's resolution over the old
// centre-to-vertex mapping for free, anchored to two real points on the
// hexagon instead of an arbitrary multiplier. This is a *different*
// mapping from the one RadarChart.tsx uses to place a value on its own
// polygon (centre=0, vertex=100, unchanged there) — the two only agree at
// the endpoints (0 and 100), not for a value in between, which is why
// RadarChart's H-vertex dot and this column's `generic` dot match in color
// but not generally in height. See CLAUDE.md's "Model cards and the
// shared scale".
function yFor(value: number) {
  return CY + MAX_R - 2 * MAX_R * (value / 100);
}

interface GapColumnProps {
  /** The HEXACO H score (docs/declared-spec.md's "generic") — always present, a background reference. */
  generic: number;
  /** The RF-v1 action-anchored score, same construct as `enacted`. Absent until scripts/declared.mjs has run for this model_version. */
  anchored?: number;
  /** The behavioural probe's score (L3 primary, L2 fallback). Absent until a probe has run for this model_version. */
  enacted?: number;
  hue: number;
  className?: string;
  ariaLabel: string;
}

// The three-level ruler (docs/declared-spec.md): generic, anchored, enacted,
// drawn as the radar's own vertical H spoke turned upright. Two segments,
// never three — `gap` (anchored<->enacted, bold, labelled) and
// `delta_specificity` (generic<->anchored, thin, secondary) — and **never**
// a line straight from `generic` to `enacted`: that segment doesn't exist by
// construction, whether or not `anchored` happens to be present, because
// `generic` and `enacted` are not the same construct (CLAUDE.md's
// non-negotiable rules). When `anchored` is missing, `enacted` (if present)
// is drawn as an isolated point with no connector at all — an absent line is
// the honest rendering of "no anchored run yet," not a gap standing in for
// one that hasn't been measured.
//
// All three points are circles on one ordinal ramp of the model's own hue —
// generic at RadarChart's own polygon-stroke lightness (55%), anchored
// lighter (75%), enacted darker (35%) and hollow (white fill, ring in that
// color) — identity comes from fill *and* shade together, not a fixed
// cross-model accent. This drops the earlier
// "enacted is always the same orange on every card" convention on purpose,
// per direct instruction: read the per-card triad first, compare cards by
// the length of their gap segment rather than by hunting one fixed hue.
export function GapColumn({ generic, anchored, enacted, hue, className, ariaLabel }: GapColumnProps) {
  if (anchored === undefined && enacted === undefined) return null;

  const yGeneric = yFor(generic);
  const yAnchored = anchored !== undefined ? yFor(anchored) : undefined;
  const yEnacted = enacted !== undefined ? yFor(enacted) : undefined;
  const genericColor = `oklch(55% 0.14 ${hue})`;
  const anchoredColor = `oklch(75% 0.13 ${hue})`;
  const enactedColor = `oklch(35% 0.15 ${hue})`;

  return (
    <svg viewBox={`0 0 ${VIEW_WIDTH} 160`} className={className} role="img" aria-label={ariaLabel}>
      {/* Same label, same position, same style as RadarChart.tsx's own "H" —
          this ruler only ever plots that one axis, stretched to fill the
          radar's full H-to-A height (see yFor above); without this, a
          reader has no way to tell which axis a floating column of dots
          is even about. */}
      <text x={AXIS_X} y={11} textAnchor="middle" fontSize={9} fill="oklch(45% 0.02 75)">
        H
      </text>
      <line x1={AXIS_X} y1={yFor(100)} x2={AXIS_X} y2={yFor(0)} stroke="oklch(85% 0.01 75)" strokeWidth={1} />
      {[0, 50, 100].map((tick) => (
        <line
          key={tick}
          x1={AXIS_X - 3}
          y1={yFor(tick)}
          x2={AXIS_X + 3}
          y2={yFor(tick)}
          stroke="oklch(80% 0.01 75)"
          strokeWidth={1}
        />
      ))}

      {/* delta_specificity: generic<->anchored, thin and secondary. */}
      {yAnchored !== undefined && (
        <line x1={AXIS_X} y1={yGeneric} x2={AXIS_X} y2={yAnchored} stroke="oklch(75% 0.015 75)" strokeWidth={1} strokeDasharray="2 1.5" />
      )}
      {/* gap: anchored<->enacted, the bolder segment — the project's measure. */}
      {yAnchored !== undefined && yEnacted !== undefined && (
        <line x1={AXIS_X} y1={yAnchored} x2={AXIS_X} y2={yEnacted} stroke="oklch(45% 0.02 75)" strokeWidth={1.5} />
      )}

      {/* Draw order: the large anchored disc first, so both smaller points
          stay visible on top of it when they coincide with it. */}
      {yAnchored !== undefined && <circle cx={AXIS_X} cy={yAnchored} r={ANCHORED_R} fill={anchoredColor} />}

      {/* generic: no projection line any more — RadarChart.tsx now draws
          the matching dot directly on its own H vertex, which is the
          bridge back to this point instead of a leader line. */}
      <circle cx={AXIS_X} cy={yGeneric} r={DOT_R} fill={genericColor} />

      {/* enacted: hollow (white fill, ring in its own color) — per direct
          instruction, so it never reads as the same kind of mark as the two
          declared points, and sits inside the anchored disc when equal. */}
      {yEnacted !== undefined && (
        <circle cx={AXIS_X} cy={yEnacted} r={DOT_R} fill="white" stroke={enactedColor} strokeWidth={1.5} />
      )}
    </svg>
  );
}
