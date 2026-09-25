import { HEXACO_CODES } from "@/lib/hexaco";

const ANGLES = [-90, -30, 30, 90, 150, 210];
const CX = 80;
const CY = 80;
const MAX_R = 60;
const LABEL_POSITIONS: Record<(typeof HEXACO_CODES)[number], { x: number; y: number }> = {
  H: { x: 80, y: 11 },
  E: { x: 139, y: 47 },
  X: { x: 139, y: 118 },
  A: { x: 80, y: 153 },
  C: { x: 21, y: 118 },
  O: { x: 21, y: 47 },
};

// Radius per marker, viewBox units (sizes set by direct instruction,
// 2026-09-25). anchored stays clearly the larger one so that an enacted ring
// at the same or a close value sits visibly inside it instead of covering it
// (e.g. claude-opus-5-5: 97 / 100).
const ANCHORED_R = 4.5;
const ENACTED_R = 2.5;

// The profile's surface colour — shared with ProfileSwatch so the legend symbol
// for declared (general) can never drift from the polygon it stands for.
function profileFill(hue: number) {
  return `oklch(62% 0.14 ${hue} / 0.22)`;
}

function pointFor(deg: number, val: number) {
  const rad = (deg * Math.PI) / 180;
  const r = MAX_R * (val / 100);
  const x = CX + r * Math.cos(rad);
  const y = CY + r * Math.sin(rad);
  return `${x.toFixed(1)},${y.toFixed(1)}`;
}

function pointsFor(scores: number[]) {
  return ANGLES.map((deg, i) => pointFor(deg, scores[i])).join(" ");
}

// Height of an H value: H points straight up, centre = 0, vertex = 100 — the
// same mapping every axis uses for the polygon, so both points share one
// scale with the polygon itself.
function yForH(value: number) {
  return CY - MAX_R * (value / 100);
}

interface RadarChartProps {
  /** HEXACO profile, H,E,X,A,C,O order — the declared (general) side. */
  scores: number[];
  hue: number;
  /** Declared (specific), RF bank — same construct as `enacted`. Absent until administered. */
  anchored?: number;
  /** Enacted, from a behavioural probe (L3 primary, L2 fallback). Absent until probed. */
  enacted?: number;
  className?: string;
  ariaLabel?: string;
}

// One chart per card (since 2026-09-25, replacing the separate GapColumn
// ruler): the HEXACO polygon — the declared (general) profile — plus, on the
// H spoke itself, declared (specific) as a large filled disc and enacted as
// a smaller hollow ring drawn on top. No connector between them (removed 2026-09-25, per direct
// instruction): the gap reads as the distance along the marked spoke.
// generic has no marker of its own: it is only the polygon's H vertex, a
// background reference, and is never joined to enacted.
// No uncertainty band (removed 2026-09-25): across repeats the models answer
// the HEXACO bank almost identically — median margin ±3 on 0-100 over every
// live run. The margin is still stored (assessments.margin), just not drawn.
// Every card renders this at the same size (ModelCard.module.css), so the
// scale is identical across cards — the regression test in CLAUDE.md's
// "Model cards and the shared scale".
export function RadarChart({ scores, hue, anchored, enacted, className, ariaLabel }: RadarChartProps) {
  const points = pointsFor(scores);
  const anchoredColor = `oklch(75% 0.13 ${hue})`;
  const enactedColor = `oklch(35% 0.15 ${hue})`;

  return (
    <svg viewBox="0 0 160 160" className={className} role={ariaLabel ? "img" : undefined} aria-label={ariaLabel}>
      <polygon
        points="80,20 131.96,50 131.96,110 80,140 28.04,110 28.04,50"
        fill="none"
        stroke="oklch(88% 0.01 75)"
        strokeWidth={1}
      />
      <polygon
        points="80,35 118.97,57.5 118.97,102.5 80,125 41.03,102.5 41.03,57.5"
        fill="none"
        stroke="oklch(90% 0.01 75)"
        strokeWidth={1}
      />
      <polygon
        points="80,50 105.98,65 105.98,95 80,110 54.02,95 54.02,65"
        fill="none"
        stroke="oklch(92% 0.01 75)"
        strokeWidth={1}
      />
      <line x1={80} y1={80} x2={80} y2={20} stroke="oklch(88% 0.01 75)" strokeWidth={1} />
      <line x1={80} y1={80} x2={131.96} y2={50} stroke="oklch(88% 0.01 75)" strokeWidth={1} />
      <line x1={80} y1={80} x2={131.96} y2={110} stroke="oklch(88% 0.01 75)" strokeWidth={1} />
      <line x1={80} y1={80} x2={80} y2={140} stroke="oklch(88% 0.01 75)" strokeWidth={1} />
      <line x1={80} y1={80} x2={28.04} y2={110} stroke="oklch(88% 0.01 75)" strokeWidth={1} />
      <line x1={80} y1={80} x2={28.04} y2={50} stroke="oklch(88% 0.01 75)" strokeWidth={1} />

      {/* Profile: fill only, no outline — the H spoke is the one marked line. */}
      <polygon points={points} fill={profileFill(hue)} stroke="none" />

      {/* The whole H spoke, marked: the ruler the two points are read on. */}
      <line x1={CX} y1={yForH(0)} x2={CX} y2={yForH(100)} stroke="oklch(55% 0.02 75)" strokeWidth={1.5} />
      {[50, 100].map((tick) => (
        <line key={tick} x1={CX - 3} y1={yForH(tick)} x2={CX + 3} y2={yForH(tick)} stroke="oklch(55% 0.02 75)" strokeWidth={1} />
      ))}

      {anchored !== undefined && <circle cx={CX} cy={yForH(anchored)} r={ANCHORED_R} fill={anchoredColor} />}
      {enacted !== undefined && (
        <circle cx={CX} cy={yForH(enacted)} r={ENACTED_R} fill="white" stroke={enactedColor} strokeWidth={1.5} />
      )}

      {HEXACO_CODES.map((code) => (
        <text
          key={code}
          x={LABEL_POSITIONS[code].x}
          y={LABEL_POSITIONS[code].y}
          textAnchor="middle"
          fontSize={9}
          fill="oklch(45% 0.02 75)"
        >
          {code}
        </text>
      ))}
    </svg>
  );
}

// Legend symbol for declared (general): a small square in the profile's own
// surface colour — on the chart, generic *is* that surface (its H vertex).
export function ProfileSwatch({ hue, size = 10 }: { hue: number; size?: number }) {
  return (
    <svg viewBox="0 0 10 10" width={size} height={size} aria-hidden style={{ flexShrink: 0 }}>
      <rect x={0} y={0} width={10} height={10} rx={1.5} fill={profileFill(hue)} />
    </svg>
  );
}
