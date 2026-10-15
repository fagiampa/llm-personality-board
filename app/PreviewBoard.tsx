"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocale } from "@/lib/i18n/context";
import styles from "./page.module.css";

// The "Anteprima pilot L3-v2" canvas as a React component: three cards in
// view, the same scale on all of them (the chart is drawn at 240px and
// scaled by one factor shared by the row), two views per card (declared vs
// enacted per construct, then the HEXACO profile), cards reorderable by
// their grip. Alphabetical by default (rule 5: no leaderboard).
//
// One card per family in the row (model_name: Claude, ChatGPT...). A family
// with several versions is a deck: its toggle lays the versions out on a
// vertical column that crosses the row at that card, with up/down arrows
// like the row's left/right ones. The card in the row is the version at the
// crossing; the column's cards are the same size, at the same scale.

export interface PreviewModel {
  name: string;
  family: string; // model_name (e.g. "Claude"): versions of one family stack as a deck
  monogram: string;
  hue: number;
  scores: number[] | null; // H,E,X,A,C,O, generic HEXACO
  gaps: [number | null, number | null][]; // per construct: [declared, enacted], 0-100
  // Report fidelity has no value because most `failing` runs hit the turn
  // cap and never reported: drawn as an off-scale dashed mark, not a value.
  noReport?: boolean;
}

const TEXT = {
  en: {
    constructs: [
      { short: "Fidelity", sub: "of the report", full: "Report fidelity" },
      { short: "Knowing", sub: "when to stop", full: "Knowing when to stop" },
      { short: "Sticking", sub: "to the evidence", full: "Sticking to the evidence" },
    ],
    declared: "declared",
    enacted: "enacted",
    hexaco: "declared (general), HEXACO",
    notMeasured: ["not", "measured"],
    noReport: "few reports: predominantly ran out of turns without stopping",
    prev: "Previous card",
    next: "Next card",
    move: (n: string) => `Move ${n} (left and right arrows)`,
    viewGaps: "Declared–enacted gap",
    viewRadar: "HEXACO profile",
    viewOf: (n: string) => `View of ${n}`,
    noHexaco: "no HEXACO run",
    versionsWord: "versions",
    openDeck: (f: string, n: number) => `Show the ${n} ${f} versions`,
    closeDeck: (f: string) => `Close the ${f} versions`,
    up: "Previous version",
    down: "Next version",
  },
  it: {
    constructs: [
      { short: "Fedeltà", sub: "del report", full: "Fedeltà del report" },
      { short: "Sapersi", sub: "fermare", full: "Sapersi fermare" },
      { short: "Attenersi", sub: "all’evidenza", full: "Attenersi all’evidenza" },
    ],
    declared: "dichiarato",
    enacted: "agito",
    hexaco: "dichiarato (generico), HEXACO",
    notMeasured: ["non", "misurato"],
    noReport: "pochi report: prevalentemente ha esaurito i turni senza fermarsi",
    prev: "Card precedente",
    next: "Card successiva",
    move: (n: string) => `Sposta ${n} (frecce sinistra e destra)`,
    viewGaps: "Gap dichiarato–agito",
    viewRadar: "Profilo HEXACO",
    viewOf: (n: string) => `Vista di ${n}`,
    noHexaco: "nessun run HEXACO",
    versionsWord: "versioni",
    openDeck: (f: string, n: number) => `Mostra le ${n} versioni di ${f}`,
    closeDeck: (f: string) => `Chiudi le versioni di ${f}`,
    up: "Versione precedente",
    down: "Versione successiva",
  },
};
type Text = (typeof TEXT)["en"];

const COMPACT_BELOW = 200;
const GAP = 14; // between the column's cards, as between the row's
const NAV = 34; // the arrow buttons
const SPREAD_MS = 280;

// ---- view 1: one vertical dumbbell per construct, in a 160 viewBox
const TOP = 16;
// 120, not 128 (2026-10-15): room under the 0 line for the no-report mark and
// the construct labels. Same for every card, so the shared scale holds.
const BOT = 120;
const COLS = [52, 94, 136];
const y = (v: number) => BOT - (v / 100) * (BOT - TOP);
const r1 = (v: number) => Math.round(v * 10) / 10;

// The points are one colour scheme for every model (trial, 2026-10-15): told
// apart by lightness and shape, not hue — light disc, dark hollow ring,
// dark filled dot — so they read the same on every card, for colour-blind
// viewers and in greyscale. The model's hue stays on its monogram and
// HEXACO polygon.
const MARK = {
  declared: "oklch(78% 0.06 245)",
  ink: "oklch(28% 0.02 260)",
};

function GapsSvg({ m, t }: { m: PreviewModel; t: Text }) {
  const aria = t.constructs
    .map((c, ci) => {
      const [d, e] = m.gaps[ci];
      if (ci === 0 && m.noReport && e == null) return `${c.full}: ${t.declared} ${d == null ? "–" : r1(d)}, ${t.noReport}`;
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
        // A construct with no values is the same column with no points on it
        // (decided 2026-10-14); "not measured" stays in the aria label only.
        return (
          <g key={cx}>
            <line x1={cx} x2={cx} y1={y(0)} y2={y(100)} stroke="oklch(55% 0.02 75)" strokeWidth={1.5} />
            {d != null && <circle cx={cx} cy={y(d)} r={4.5} fill={MARK.declared} />}
            {e != null && <circle cx={cx} cy={y(e)} r={2.5} fill="white" stroke={MARK.ink} strokeWidth={1.5} />}
            {ci === 0 && m.noReport && e == null && (
              // Below the 0 line on purpose: off the scale, so it never reads as a value.
              // The column runs on through the mark, dashed like it, so the
              // extension reads as off-scale too.
              <>
                <line x1={cx} x2={cx} y1={y(0)} y2={y(0) + 17} stroke="oklch(55% 0.02 75)" strokeWidth={1.2} strokeDasharray="1.4 1.2" />
                {/* filled, in enacted's dark tone: not the hollow enacted ring, not the light declared disc */}
                <circle cx={cx} cy={y(0) + 10} r={3} fill={MARK.ink} />
              </>
            )}
            {/* Low enough to leave room for the off-scale no-report mark under the 0 line. */}
            <text x={cx} y={148} textAnchor="middle" fontSize={7.5} fill="oklch(40% 0.02 75)" fontWeight={500}>
              {t.constructs[ci].short}
            </text>
            <text x={cx} y={157} textAnchor="middle" fontSize={6.5} fill="oklch(58% 0.02 75)">
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

function Swatch({ kind }: { kind: "declared" | "enacted" | "noReport" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden="true">
      {kind === "declared" && <circle cx="5" cy="5" r="4.5" fill={MARK.declared} />}
      {kind === "enacted" && <circle cx="5" cy="5" r="3" fill="white" stroke={MARK.ink} strokeWidth="1.5" />}
      {kind === "noReport" && (
        // the filled dot on its dashed off-scale line, as drawn under the column
        <>
          <line x1="5" x2="5" y1="0" y2="10" stroke="oklch(55% 0.02 75)" strokeWidth="1.2" strokeDasharray="1.4 1.2" />
          <circle cx="5" cy="5" r="3" fill={MARK.ink} />
        </>
      )}
    </svg>
  );
}

/** One legend for the whole board, outside the cards (trial, 2026-10-15). */
export function MarkLegend({ showNoReport }: { showNoReport: boolean }) {
  const t = TEXT[useLocale()];
  return (
    <div className={styles.legendBar}>
      <span>
        <Swatch kind="declared" />
        {t.declared}
      </span>
      <span>
        <Swatch kind="enacted" />
        {t.enacted}
      </span>
      {showNoReport && (
        <span>
          <Swatch kind="noReport" />
          {t.noReport}
        </span>
      )}
    </div>
  );
}

interface Deck {
  count: number;
  open: boolean;
  onToggle: () => void;
  onStep: (dir: -1 | 1) => void;
}

function Card({
  m,
  t,
  grip,
  dragging = false,
  deck,
  className = "",
  style,
}: {
  m: PreviewModel;
  t: Text;
  // the row's cards are reorderable; a card in the open column is not
  grip?: { onDown: (e: ReactPointerEvent<HTMLButtonElement>) => void; onKey: (dir: -1 | 1) => void };
  dragging?: boolean;
  deck?: Deck;
  className?: string;
  style?: CSSProperties;
}) {
  const [view, setView] = useState(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const stacked = deck != null && deck.count > 1;
  return (
    <article
      className={`${styles.card} ${dragging ? styles.dragging : ""} ${stacked ? (deck.open ? styles.deckOpen : styles.deck) : ""} ${className}`}
      aria-label={m.name}
      data-family={m.family}
      style={style}
    >
      {grip && (
        <button
          type="button"
          className={styles.grip}
          aria-label={t.move(m.family)}
          onPointerDown={grip.onDown}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              grip.onKey(e.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <g fill="currentColor">
              {[2.5, 6, 9.5].flatMap((cy) => [3, 9].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.3} />))}
            </g>
          </svg>
        </button>
      )}
      {stacked && (
        <button
          type="button"
          className={styles.deckToggle}
          aria-expanded={deck.open}
          aria-label={deck.open ? t.closeDeck(m.family) : t.openDeck(m.family, deck.count)}
          onClick={deck.onToggle}
          onKeyDown={(e) => {
            if (deck.open && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
              e.preventDefault();
              deck.onStep(e.key === "ArrowUp" ? -1 : 1);
            }
          }}
        >
          <span>{deck.count}</span>
          <span className={styles.deckWord}>{t.versionsWord}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path
              d={deck.open ? "M2 6.5 5 3.5l3 3" : "M2 3.5 5 6.5l3-3"}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
      <div className={styles.header}>
        <div className={styles.mono} style={{ background: `oklch(62% 0.14 ${m.hue})` }}>
          {m.monogram}
        </div>
        <div className={styles.name}>{m.name}</div>
      </div>
      {/* View switch under the model's name (moved from the card's foot, 2026-10-15). */}
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
    </article>
  );
}

function Chevron({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Geo = { left: number; top: number; width: number; height: number };

export default function PreviewBoard({ models }: { models: PreviewModel[] }) {
  const t = TEXT[useLocale()];
  // family -> its versions, alphabetical (rule 5), the first one on top of the deck
  const families = useMemo(() => {
    const map = new Map<string, PreviewModel[]>();
    for (const m of [...models].sort((a, b) => a.name.localeCompare(b.name))) {
      if (!map.has(m.family)) map.set(m.family, []);
      map.get(m.family)!.push(m);
    }
    return map;
  }, [models]);
  const alpha = [...families.keys()].sort((a, b) => a.localeCompare(b));
  const [order, setOrder] = useState(alpha);
  const [dragged, setDragged] = useState<string | null>(null);
  // the row's fit to its width; while a deck is open, also the fit of the
  // whole cross to the window's height (vScale), the smaller of the two for
  // every card at once — still one scale shared by all of them
  const [fitScale, setFitScale] = useState(1);
  const [vScale, setVScale] = useState<number | null>(null);
  const [vh, setVh] = useState(0);
  const [compact, setCompact] = useState(false);
  const [edges, setEdges] = useState({ start: true, end: true });
  // the open deck, which of its versions sits at the crossing, and where the crossing is
  const [open, setOpen] = useState<string | null>(null);
  const [spread, setSpread] = useState(false);
  const [current, setCurrent] = useState<Record<string, number>>({});
  const [geo, setGeo] = useState<Geo | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const padApplied = useRef(0);
  const closing = useRef<ReturnType<typeof setTimeout>>();

  const versionsOf = (f: string) => families.get(f) ?? [];
  const at = (f: string) => current[f] ?? 0;
  const deckEl = (f: string) => rail.current?.querySelector<HTMLElement>(`article[data-family="${CSS.escape(f)}"]`) ?? null;

  const railGap = () => (rail.current ? parseFloat(getComputedStyle(rail.current).columnGap) || 0 : 0);
  const step = () => {
    const card = rail.current?.querySelector("article");
    return card ? card.getBoundingClientRect().width + railGap() : 1;
  };

  const measure = (): Geo | null => {
    const st = stage.current;
    const el = open ? deckEl(open) : null;
    if (!st || !el) return null;
    const s = st.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const next = { left: r.left - s.left, top: r.top - s.top, width: r.width, height: r.height };
    setGeo((g) =>
      g &&
      Math.abs(g.left - next.left) < 0.5 &&
      Math.abs(g.top - next.top) < 0.5 &&
      Math.abs(g.width - next.width) < 0.5 &&
      Math.abs(g.height - next.height) < 0.5
        ? g
        : next
    );
    return next;
  };

  const updateNav = () => {
    const el = rail.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft >= el.scrollWidth - el.clientWidth - 2 });
    measure();
  };

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const fit = () => {
      const slot = (el.clientWidth - 2 * railGap()) / 3;
      const c = slot < COMPACT_BELOW;
      setCompact(c);
      setFitScale(Math.max(0.3, Math.min(1.25, (slot - (c ? 8 : 20) - 2) / 240)));
      updateNav();
    };
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Room above and below the row for the column: one card and one arrow on
  // each side, whatever the crossing, so stepping through the versions moves
  // only the column — the row stays put. Open, the cards go short (no
  // legend, a one-line header) and the chart shrinks until the column's
  // three slots and both arrows fit the window's height; the cross is then
  // centred on screen. Closed, the window scrolls back by what was removed.
  const openVersions = open ? versionsOf(open) : [];
  const crossing = open != null && openVersions.length > 1;
  const scale = crossing && vScale != null ? Math.min(fitScale, vScale) : fitScale;
  const c = open ? at(open) : 0;
  const side = crossing && geo ? geo.height + 2 * GAP + NAV : 0;
  const pad = 2 * side;
  useLayoutEffect(() => {
    const delta = pad - padApplied.current;
    padApplied.current = pad;
    if (pad > 0 && delta !== 0) stage.current?.scrollIntoView({ block: "center" });
    else if (delta < 0) window.scrollBy(0, delta);
    // Read from the DOM as just laid out, at the scale it was drawn with —
    // never from the geo state, which may still hold the previous scale's
    // height (that mismatch fed a new scale back forever).
    const fresh = measure();
    if (crossing && fresh) {
      const chrome = fresh.height - 240 * scale; // what of a card isn't the chart
      const room = (window.innerHeight - 24 - 6 * GAP - 2 * NAV) / 3;
      const next = Math.max(0.3, Math.min(1.25, (room - chrome) / 240));
      setVScale((v) => (v != null && Math.abs(next - v) <= 0.005 ? v : next));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pad, open, scale, compact, current, vh]);

  const close = () => {
    setSpread(false);
    clearTimeout(closing.current);
    closing.current = setTimeout(() => {
      setOpen(null);
      setGeo(null);
      setVScale(null);
    }, SPREAD_MS);
  };

  const toggle = (f: string) => {
    if (open === f) return close();
    clearTimeout(closing.current);
    // bring the deck fully into the row's view first
    const r = rail.current;
    const el = deckEl(f);
    if (r && el) {
      const rr = r.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      if (er.left < rr.left) r.scrollBy({ left: er.left - rr.left });
      else if (er.right > rr.right) r.scrollBy({ left: er.right - rr.right });
    }
    setSpread(false);
    setGeo(null);
    setOpen(f);
    requestAnimationFrame(() => requestAnimationFrame(() => setSpread(true)));
  };

  // the toggle the user pressed is hidden under the column while it's open:
  // focus follows to the column's toggle, and back to the row's on close
  const lastOpen = useRef<string | null>(null);
  useEffect(() => {
    if (spread) stage.current?.querySelector<HTMLElement>('[data-column] [aria-expanded="true"]')?.focus({ preventScroll: true });
  }, [spread]);
  useEffect(() => {
    if (open) lastOpen.current = open;
    else if (lastOpen.current) {
      deckEl(lastOpen.current)?.querySelector<HTMLElement>("[aria-expanded]")?.focus({ preventScroll: true });
      lastOpen.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stepVersion = (f: string, dir: -1 | 1) =>
    setCurrent((cur) => ({ ...cur, [f]: Math.max(0, Math.min(versionsOf(f).length - 1, (cur[f] ?? 0) + dir)) }));

  // Esc, or a press anywhere outside the deck and its column, closes it
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(`[data-family="${CSS.escape(open)}"], [data-column]`)) close();
    };
    const onResize = () => setVh(window.innerHeight);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const move = (f: string, dir: -1 | 1) =>
    setOrder((o) => {
      const i = o.indexOf(f);
      const j = i + dir;
      if (j < 0 || j >= o.length) return o;
      const next = [...o];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // Drag by the grip: the card stays in the row and swaps places with
  // whichever card the pointer is over. Not while a deck is open.
  const startDrag = (f: string) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (open) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragged(f);
  };
  const onDragMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragged || !rail.current) return;
    const over = [...rail.current.querySelectorAll<HTMLElement>("article")].find((card) => {
      const r = card.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right;
    });
    const target = over?.dataset.family;
    if (target && target !== dragged)
      setOrder((o) => {
        const next = o.filter((x) => x !== dragged);
        next.splice(o.indexOf(target), 0, dragged);
        return next;
      });
  };

  // The column: every version of the open family on one vertical strip,
  // seen through a window of three slots whose middle one is the crossing.
  // Stepping slides the strip; while open, the family's card in the row is
  // hidden under the strip's middle card, which takes over its toggle.
  const navLeft = geo ? geo.left + geo.width / 2 - NAV / 2 : 0;
  const column =
    open && geo && crossing ? (
      <div data-column>
        <div
          className={styles.colWindow}
          style={{ left: geo.left, top: geo.top - geo.height - GAP, width: geo.width, height: 3 * geo.height + 2 * GAP }}
        >
          {openVersions.map((m, i) => (
            <Card
              key={m.name}
              m={m}
              t={t}
              className={styles.colCard}
              deck={
                i === c
                  ? { count: openVersions.length, open: true, onToggle: close, onStep: (dir) => stepVersion(open, dir) }
                  : undefined
              }
              style={{
                left: 0,
                top: geo.height + GAP,
                width: geo.width,
                height: geo.height,
                transform: `translateY(${spread ? (i - c) * (geo.height + GAP) : 0}px)`,
                opacity: spread || i === c ? 1 : 0,
                zIndex: i === c ? 2 : 1,
              }}
            />
          ))}
        </div>
        <button
          type="button"
          className={`${styles.nav} ${styles.vnav}`}
          aria-label={t.up}
          disabled={c === 0}
          style={{ left: navLeft, top: geo.top - geo.height - GAP - GAP / 2 - NAV, opacity: spread ? (c === 0 ? 0.35 : 1) : 0 }}
          onClick={() => stepVersion(open, -1)}
        >
          <Chevron d="M2 9l5-5 5 5" />
        </button>
        <button
          type="button"
          className={`${styles.nav} ${styles.vnav}`}
          aria-label={t.down}
          disabled={c === openVersions.length - 1}
          style={{
            left: navLeft,
            top: geo.top + 2 * geo.height + GAP + GAP / 2,
            opacity: spread ? (c === openVersions.length - 1 ? 0.35 : 1) : 0,
          }}
          onClick={() => stepVersion(open, 1)}
        >
          <Chevron d="M2 5l5 5 5-5" />
        </button>
      </div>
    ) : null;

  return (
    <section className={styles.board}>
      <div
        ref={stage}
        className={`${styles.stage} ${compact ? styles.compact : ""} ${crossing ? styles.short : ""}`}
        style={{ ["--s" as string]: scale.toFixed(4), paddingBlock: side }}
      >
        <div className={styles.carousel}>
          <button type="button" className={styles.nav} aria-label={t.prev} disabled={edges.start} onClick={() => rail.current?.scrollBy({ left: -step() })}>
            <Chevron d="M9 2 4 7l5 5" />
          </button>
          <div
            ref={rail}
            className={styles.rail}
            onScroll={updateNav}
            onPointerMove={onDragMove}
            onPointerUp={() => setDragged(null)}
            onPointerCancel={() => setDragged(null)}
          >
            {order.map((f) => {
              const vs = versionsOf(f);
              return (
                <Card
                  key={`${f}-${vs[at(f)].name}`}
                  m={vs[at(f)]}
                  t={t}
                  dragging={dragged === f}
                  className={open === f && crossing && geo ? styles.under : open && open !== f ? styles.dim : ""}
                  grip={{ onDown: startDrag(f), onKey: (dir) => move(f, dir) }}
                  deck={{ count: vs.length, open: open === f, onToggle: () => toggle(f), onStep: (dir) => stepVersion(f, dir) }}
                />
              );
            })}
          </div>
          <button type="button" className={styles.nav} aria-label={t.next} disabled={edges.end} onClick={() => rail.current?.scrollBy({ left: step() })}>
            <Chevron d="M5 2l5 5-5 5" />
          </button>
        </div>
        {column}
      </div>
    </section>
  );
}
