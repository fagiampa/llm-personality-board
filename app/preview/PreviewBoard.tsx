"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useLocale } from "@/lib/i18n/context";
import styles from "./page.module.css";

// The "Anteprima pilot L3-v2" canvas as a React component: three cards in
// view, the same scale on all of them (the chart is drawn at 240px and
// scaled by one factor shared by the row), two views per card (declared vs
// enacted per construct, then the HEXACO profile), cards reorderable by
// their grip. Alphabetical by default (rule 5: no leaderboard).

export interface PreviewModel {
  name: string;
  monogram: string;
  hue: number;
  scores: number[] | null; // H,E,X,A,C,O, generic HEXACO
  gaps: [number | null, number | null][]; // per construct: [declared, enacted], 0-100
}

const TEXT = {
  en: {
    constructs: [
      { short: "Fidelity", sub: "of the report", full: "Report fidelity" },
      { short: "Disengage", sub: "from the goal", full: "Goal disengagement" },
      { short: "Prevention", sub: "focus", full: "Prevention focus" },
    ],
    declared: "declared (specific)",
    enacted: "enacted",
    hexaco: "declared (general), HEXACO",
    notMeasured: ["not", "measured"],
    position: (a: number, b: number, n: number) => `Models ${a}–${b} of ${n}`,
    alpha: "Alphabetical order",
    yours: "Your order",
    reset: "Back to alphabetical",
    prev: "Previous card",
    next: "Next card",
    move: (n: string) => `Move ${n} (left and right arrows)`,
    viewGaps: "Declared–enacted gap",
    viewRadar: "HEXACO profile",
    viewOf: (n: string) => `View of ${n}`,
    noHexaco: "no HEXACO run",
  },
  it: {
    constructs: [
      { short: "Fedeltà", sub: "del report", full: "Fedeltà del report" },
      { short: "Disimpegno", sub: "dall’obiettivo", full: "Disimpegno dall’obiettivo" },
      { short: "Prevention", sub: "focus", full: "Prevention focus" },
    ],
    declared: "dichiarato (specifico)",
    enacted: "agito",
    hexaco: "dichiarato (generico), HEXACO",
    notMeasured: ["non", "misurato"],
    position: (a: number, b: number, n: number) => `Modelli ${a}–${b} di ${n}`,
    alpha: "Ordine alfabetico",
    yours: "Ordine tuo",
    reset: "Torna all’ordine alfabetico",
    prev: "Card precedente",
    next: "Card successiva",
    move: (n: string) => `Sposta ${n} (frecce sinistra e destra)`,
    viewGaps: "Gap dichiarato–agito",
    viewRadar: "Profilo HEXACO",
    viewOf: (n: string) => `Vista di ${n}`,
    noHexaco: "nessun run HEXACO",
  },
};
type Text = (typeof TEXT)["en"];

const COMPACT_BELOW = 200;

// ---- view 1: one vertical dumbbell per construct, in a 160 viewBox
const TOP = 16;
const BOT = 128;
const COLS = [52, 94, 136];
const y = (v: number) => BOT - (v / 100) * (BOT - TOP);
const r1 = (v: number) => Math.round(v * 10) / 10;

function GapsSvg({ m, t }: { m: PreviewModel; t: Text }) {
  const aria = t.constructs
    .map((c, ci) => {
      const [d, e] = m.gaps[ci];
      if (d == null && e == null) return `${c.full}: ${t.notMeasured.join(" ")}`;
      const g = d != null && e != null ? `, gap ${d - e > 0 ? "+" : ""}${r1(d - e)}` : "";
      return `${c.full}: ${t.declared} ${d == null ? "–" : r1(d)}, ${t.enacted} ${e == null ? "–" : r1(e)}${g}`;
    })
    .join("; ");
  return (
    <svg viewBox="0 0 160 160" role="img" aria-label={`${m.name}. ${aria}`}>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={30} x2={152} y1={y(v)} y2={y(v)} stroke="oklch(82% 0.01 75)" strokeWidth={0.6} strokeDasharray={v === 0 ? undefined : "1.5 2"} />
          <text x={24} y={y(v) + 2.6} textAnchor="end" fontSize={7} fill="oklch(58% 0.02 75)">
            {v}
          </text>
        </g>
      ))}
      {COLS.map((cx, ci) => {
        const [d, e] = m.gaps[ci];
        const empty = d == null && e == null;
        return (
          <g key={cx}>
            <line
              x1={cx}
              x2={cx}
              y1={y(0)}
              y2={y(100)}
              stroke={empty ? "oklch(82% 0.01 75)" : "oklch(55% 0.02 75)"}
              strokeWidth={empty ? 1 : 1.5}
              strokeDasharray={empty ? "2 2" : undefined}
            />
            {empty && (
              <>
                <text x={cx} y={y(50) - 3} textAnchor="middle" fontSize={6} fill="oklch(58% 0.02 75)">
                  {t.notMeasured[0]}
                </text>
                <text x={cx} y={y(50) + 4} textAnchor="middle" fontSize={6} fill="oklch(58% 0.02 75)">
                  {t.notMeasured[1]}
                </text>
              </>
            )}
            {d != null && <circle cx={cx} cy={y(d)} r={4.5} fill={`oklch(75% 0.13 ${m.hue})`} />}
            {e != null && <circle cx={cx} cy={y(e)} r={2.5} fill="white" stroke={`oklch(35% 0.15 ${m.hue})`} strokeWidth={1.5} />}
            <text x={cx} y={142} textAnchor="middle" fontSize={7.5} fill="oklch(40% 0.02 75)" fontWeight={500}>
              {t.constructs[ci].short}
            </text>
            <text x={cx} y={151} textAnchor="middle" fontSize={6.5} fill="oklch(58% 0.02 75)">
              {t.constructs[ci].sub}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---- view 2: the HEXACO radar, no points on H
const ANGLES = [-90, -30, 30, 90, 150, 210];
const CODES = ["H", "E", "X", "A", "C", "O"];
const LABELS: Record<string, [number, number]> = { H: [80, 11], E: [139, 47], X: [139, 118], A: [80, 153], C: [21, 118], O: [21, 47] };
const pt = (deg: number, v: number) => {
  const r = (60 * v) / 100;
  const a = (deg * Math.PI) / 180;
  return [80 + r * Math.cos(a), 80 + r * Math.sin(a)];
};
const poly = (vals: number[]) => ANGLES.map((d, i) => pt(d, vals[i]).map((n) => n.toFixed(1)).join(",")).join(" ");

function RadarSvg({ m, t }: { m: PreviewModel; t: Text }) {
  const aria = m.scores ? `${m.name}. ${t.hexaco}: ` + CODES.map((c, i) => `${c} ${m.scores![i]}`).join(", ") : `${m.name}. ${t.noHexaco}`;
  return (
    <svg viewBox="0 0 160 160" role="img" aria-label={aria}>
      {[100, 75, 50].map((k, i) => (
        <polygon key={k} points={poly([k, k, k, k, k, k])} fill="none" stroke={`oklch(${88 + 2 * i}% 0.01 75)`} strokeWidth={1} />
      ))}
      {ANGLES.map((d) => {
        const [x2, y2] = pt(d, 100);
        return <line key={d} x1={80} y1={80} x2={x2} y2={y2} stroke="oklch(88% 0.01 75)" strokeWidth={1} />;
      })}
      {m.scores && <polygon points={poly(m.scores)} fill={`oklch(62% 0.14 ${m.hue} / 0.22)`} />}
      {CODES.map((c) => (
        <text key={c} x={LABELS[c][0]} y={LABELS[c][1]} textAnchor="middle" fontSize={9} fill="oklch(45% 0.02 75)">
          {c}
        </text>
      ))}
    </svg>
  );
}

function Swatch({ kind, hue }: { kind: "declared" | "enacted" | "hexaco"; hue: number }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      {kind === "declared" && <circle cx="5" cy="5" r="4.5" fill={`oklch(75% 0.13 ${hue})`} />}
      {kind === "enacted" && <circle cx="5" cy="5" r="3" fill="white" stroke={`oklch(35% 0.15 ${hue})`} strokeWidth="1.5" />}
      {kind === "hexaco" && <rect width="10" height="10" rx="1.5" fill={`oklch(62% 0.14 ${hue} / 0.22)`} />}
    </svg>
  );
}

function Card({
  m,
  t,
  onGripDown,
  onGripKey,
  dragging,
}: {
  m: PreviewModel;
  t: Text;
  onGripDown: (e: ReactPointerEvent<HTMLButtonElement>) => void;
  onGripKey: (dir: -1 | 1) => void;
  dragging: boolean;
}) {
  const [view, setView] = useState(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  return (
    <article className={`${styles.card} ${dragging ? styles.dragging : ""}`} aria-label={m.name} data-name={m.name}>
      <button
        type="button"
        className={styles.grip}
        aria-label={t.move(m.name)}
        onPointerDown={onGripDown}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            onGripKey(e.key === "ArrowLeft" ? -1 : 1);
          }
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <g fill="currentColor">
            {[2.5, 6, 9.5].flatMap((cy) => [3, 9].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.3} />))}
          </g>
        </svg>
      </button>
      <div className={styles.header}>
        <div className={styles.mono} style={{ background: `oklch(62% 0.14 ${m.hue})` }}>
          {m.monogram}
        </div>
        <div className={styles.name}>{m.name}</div>
      </div>
      <div
        className={styles.chartbox}
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const s = swipe.current;
          swipe.current = null;
          if (!s) return;
          const dx = e.clientX - s.x;
          const dy = e.clientY - s.y;
          if (Math.abs(dx) > 30 && Math.abs(dx) > Math.abs(dy)) setView(dx < 0 ? 1 : 0);
        }}
      >
        <div className={styles.viewport}>
          <div className={styles.track} style={{ transform: `translateX(${-240 * view}px)` }}>
            <div className={styles.view} aria-hidden={view !== 0}>
              <GapsSvg m={m} t={t} />
            </div>
            <div className={styles.view} aria-hidden={view !== 1}>
              <RadarSvg m={m} t={t} />
            </div>
          </div>
        </div>
      </div>
      <div className={styles.cardlegend}>
        {view === 0 ? (
          <>
            <span>
              <Swatch kind="declared" hue={m.hue} />
              {t.declared}
            </span>
            <span>
              <Swatch kind="enacted" hue={m.hue} />
              {t.enacted}
            </span>
          </>
        ) : (
          <span>
            <Swatch kind="hexaco" hue={m.hue} />
            {t.hexaco}
          </span>
        )}
      </div>
      <div className={styles.dots} role="group" aria-label={t.viewOf(m.name)}>
        {[t.viewGaps, t.viewRadar].map((label, v) => (
          <button
            key={v}
            type="button"
            className={styles.dot}
            aria-current={view === v}
            aria-label={label}
            onClick={() => setView(v)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setView(0);
              if (e.key === "ArrowRight") setView(1);
            }}
          />
        ))}
      </div>
    </article>
  );
}

export default function PreviewBoard({ models }: { models: PreviewModel[] }) {
  const t = TEXT[useLocale()];
  const alpha = [...models].sort((a, b) => a.name.localeCompare(b.name)).map((m) => m.name);
  const [order, setOrder] = useState(alpha);
  const [dragged, setDragged] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [compact, setCompact] = useState(false);
  const [first, setFirst] = useState(1);
  const [edges, setEdges] = useState({ start: true, end: true });
  const rail = useRef<HTMLDivElement>(null);

  const byName = new Map(models.map((m) => [m.name, m]));
  const isAlpha = order.every((n, i) => n === alpha[i]);

  const railGap = () => (rail.current ? parseFloat(getComputedStyle(rail.current).columnGap) || 0 : 0);
  const step = () => {
    const card = rail.current?.querySelector("article");
    return card ? card.getBoundingClientRect().width + railGap() : 1;
  };
  const updateNav = () => {
    const el = rail.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft >= el.scrollWidth - el.clientWidth - 2 });
    setFirst(Math.max(1, Math.min(Math.max(1, models.length - 2), Math.round(el.scrollLeft / step()) + 1)));
  };

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const fit = () => {
      const slot = (el.clientWidth - 2 * railGap()) / 3;
      const c = slot < COMPACT_BELOW;
      setCompact(c);
      setScale(Math.max(0.3, Math.min(1.25, (slot - (c ? 8 : 20) - 2) / 240)));
      updateNav();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (name: string, dir: -1 | 1) =>
    setOrder((o) => {
      const i = o.indexOf(name);
      const j = i + dir;
      if (j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // Drag by the grip: the card stays in the row and swaps places with
  // whichever card the pointer is over.
  const startDrag = (name: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragged(name);
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragged || !rail.current) return;
    const over = [...rail.current.querySelectorAll<HTMLElement>("article")].find((c) => {
      const r = c.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right;
    });
    const target = over?.dataset.name;
    if (target && target !== dragged)
      setOrder((o) => {
        const next = o.filter((n) => n !== dragged);
        next.splice(o.indexOf(target), 0, dragged);
        return next;
      });
  };

  return (
    <section className={styles.board}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.pos}>{t.position(first, Math.min(models.length, first + 2), models.length)}</span>
          <span aria-hidden="true">·</span>
          <span>{isAlpha ? t.alpha : t.yours}</span>
          <button type="button" className={styles.reset} disabled={isAlpha} onClick={() => setOrder(alpha)}>
            {t.reset}
          </button>
        </div>
      </div>
      <div className={styles.carousel}>
        <button type="button" className={styles.nav} aria-label={t.prev} disabled={edges.start} onClick={() => rail.current?.scrollBy({ left: -step() })}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M9 2 4 7l5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <div
          ref={rail}
          className={`${styles.rail} ${compact ? styles.compact : ""}`}
          style={{ ["--s" as string]: scale.toFixed(4) }}
          onScroll={updateNav}
          onPointerMove={onDragMove}
          onPointerUp={() => setDragged(null)}
          onPointerCancel={() => setDragged(null)}
        >
          {order.map((name) => (
            <Card
              key={name}
              m={byName.get(name)!}
              t={t}
              dragging={dragged === name}
              onGripDown={startDrag(name)}
              onGripKey={(dir) => move(name, dir)}
            />
          ))}
        </div>
        <button type="button" className={styles.nav} aria-label={t.next} disabled={edges.end} onClick={() => rail.current?.scrollBy({ left: step() })}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M5 2l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}
