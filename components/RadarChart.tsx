import { HEXACO_CODES } from "@/lib/hexaco";

const ANGLES = [-90, -30, 30, 90, 150, 210];
const CX = 80;
const CY = 80;
const MAX_R = 60;
// Placeholder illustrative spread around the mean; in production this
// becomes the real statistical margin (e.g. 1.96 x SEM) from the scoring
// pipeline.
const DEFAULT_MARGIN = 8;

const LABEL_POSITIONS: Record<(typeof HEXACO_CODES)[number], { x: number; y: number }> = {
  H: { x: 80, y: 11 },
  E: { x: 139, y: 47 },
  X: { x: 139, y: 118 },
  A: { x: 80, y: 153 },
  C: { x: 21, y: 118 },
  O: { x: 21, y: 47 },
};

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

function pathFor(scores: number[]) {
  return `M${ANGLES.map((deg, i) => pointFor(deg, scores[i])).join(" L")} Z`;
}

interface RadarChartProps {
  scores: number[];
  hue: number;
  /** Fixed margin for every axis, or one value per axis (real per-domain margin). */
  margin?: number | number[];
  className?: string;
}

export function RadarChart({ scores, hue, margin = DEFAULT_MARGIN, className }: RadarChartProps) {
  const marginFor = (i: number) => (Array.isArray(margin) ? margin[i] : margin);
  const low = scores.map((s, i) => Math.max(0, s - marginFor(i)));
  const high = scores.map((s, i) => Math.min(100, s + marginFor(i)));
  const bandPath = `${pathFor(high)} ${pathFor(low)}`;
  const points = pointsFor(scores);

  return (
    <svg viewBox="0 0 160 160" className={className}>
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

      <path
        d={bandPath}
        fill={`oklch(62% 0.14 ${hue} / 0.22)`}
        fillRule="evenodd"
        stroke="none"
      />
      <polygon points={points} fill="none" stroke={`oklch(55% 0.14 ${hue})`} strokeWidth={2} />

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
