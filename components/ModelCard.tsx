"use client";

import { useEffect, useRef, useState } from "react";
import { ModelScore, ProbeScore, L3ProbeScore, AnchoredScore } from "@/lib/hexaco";
import { useLocale } from "@/lib/i18n/context";
import { dateLocale, Locale } from "@/lib/i18n/locale";
import { dict } from "@/lib/i18n/dictionaries";
import { RadarChart } from "./RadarChart";
import { GapColumn } from "./GapColumn";
import styles from "./ModelCard.module.css";

export interface VersionOption {
  assessedAt: string | null;
  modelVersion: string | null;
  source: ModelScore["source"];
}

// "__seed__" stands in for the illustrative entry with no real timestamp
// (mirrors SEED_TIMESTAMP="" in lib/db.mjs, but <select> option values can't
// be an empty string reliably across browsers, so it gets its own token).
export function versionKey(v: { assessedAt: string | null }): string {
  return v.assessedAt ?? "__seed__";
}

function formatVersionLabel(v: VersionOption, locale: Locale): string {
  if (v.modelVersion) return v.modelVersion;
  return v.assessedAt
    ? new Date(v.assessedAt).toLocaleString(dateLocale(locale), {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : dict(locale).card.seed;
}

// Runs of the same model_version are re-assessments of that version; the
// combo only needs the newest one per version (list arrives ranked
// highest-version-first, so the first occurrence of a version is the one to
// keep — see isNewer in lib/db.mjs).
function dedupeByVersion(options: VersionOption[]): VersionOption[] {
  const seen = new Set<string | null>();
  return options.filter((v) => {
    if (seen.has(v.modelVersion)) return false;
    seen.add(v.modelVersion);
    return true;
  });
}

// Integer part of the first number in a model_version string ("gpt-5.2" -> 5,
// "gpt-4o-mini" -> 4), mirroring versionRank in lib/db.mjs at whole-version
// granularity. Null for versionless entries (seed/unparseable).
function majorVersion(modelVersion: string | null): number | null {
  if (!modelVersion) return null;
  const match = modelVersion.match(/\d+(\.\d+)?/);
  return match ? Math.floor(Number(match[0])) : null;
}

const PANEL_VIEWPORT_MARGIN = 12;
const PANEL_MIN_HEIGHT = 80;
const PANEL_MAX_HEIGHT = 240;

interface VersionComboProps {
  options: VersionOption[];
  currentKey: string;
  hue: number;
  disabled?: boolean;
  ariaLabel: string;
  onOpen?: () => void;
  onSelect: (key: string) => void;
}

// Custom listbox instead of a native <select>: a native popup can flip open
// upward past the card's top edge and paint over the radar chart / one-liner
// above it. This one is anchored below the trigger only, with its height
// clamped (scrolling) to whatever room is actually left in the viewport.
function VersionCombo({ options, currentKey, hue, disabled, ariaLabel, onOpen, onSelect }: VersionComboProps) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [maxHeight, setMaxHeight] = useState<number>();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function close(e: Event) {
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKeyDown);
    // Closes on scroll rather than re-measuring: the panel is anchored to
    // the trigger via normal document flow, so it moves with the page, but
    // the *available space below it* changes as the viewport moves.
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const current = options.find((v) => versionKey(v) === currentKey) ?? options[0];

  return (
    <div className={styles.combo} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.versionSelect}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => {
          if (!open) {
            onOpen?.();
            const rect = buttonRef.current?.getBoundingClientRect();
            const available = rect ? window.innerHeight - rect.bottom - PANEL_VIEWPORT_MARGIN : PANEL_MAX_HEIGHT;
            setMaxHeight(Math.max(PANEL_MIN_HEIGHT, Math.min(PANEL_MAX_HEIGHT, available)));
          }
          setOpen((o) => !o);
        }}
      >
        {current ? formatVersionLabel(current, locale) : ""}
        <svg
          className={styles.comboCaret}
          viewBox="0 0 10 6"
          fill="none"
          aria-hidden
        >
          <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className={styles.comboPanel} role="listbox" aria-label={ariaLabel} style={{ maxHeight }}>
          {(() => {
            let prevMajor: number | null | undefined;
            return options.map((v) => {
              const key = versionKey(v);
              const selected = key === currentKey;
              const major = majorVersion(v.modelVersion);
              // Highlights the first (highest-ranked) entry of each new major
              // version as it appears going down the list, e.g. the top gpt-5.x
              // and the top gpt-4.x, since the list is already sorted highest
              // version first.
              const isMajorBoundary = major !== null && major !== prevMajor;
              prevMajor = major;
              // Selected always wins as bold black; an unselected major-
              // boundary entry gets the model's own brand color instead.
              const style =
                !selected && isMajorBoundary ? { color: `oklch(55% 0.14 ${hue})` } : undefined;
              return (
                <li
                  key={key}
                  role="option"
                  aria-selected={selected}
                  style={style}
                  className={`${styles.comboOption} ${selected ? styles.comboOptionSelected : ""} ${
                    isMajorBoundary ? styles.comboOptionMajor : ""
                  }`}
                  onClick={() => {
                    onSelect(key);
                    setOpen(false);
                  }}
                >
                  {formatVersionLabel(v, locale)}
                </li>
              );
            });
          })()}
        </ul>
      )}
    </div>
  );
}

interface ModelCardProps {
  model: ModelScore;
  /** The L2 (control) probe's enacted score for this same model_version, if one has been run yet — a model can have a declared profile with no enacted one. */
  probe?: ProbeScore;
  /** The L3 (primary) probe's enacted score for this same model_version. Wins over `probe` when both exist — see the note below the props. */
  l3Probe?: L3ProbeScore;
  /** The declared side's anchored score (RF-v1, docs/declared-spec.md) for this same model_version, if administered yet. */
  anchored?: AnchoredScore;
  /** Available (model, timestamp) versions for the combo; undefined while not yet loaded. */
  versions?: VersionOption[];
  selectedKey?: string;
  isLoadingVersion?: boolean;
  /** Lazily loads `versions` (e.g. on first focus of the combo). */
  onOpenVersions?: () => void;
  onSelectVersion?: (key: string) => void;
}

export function ModelCard({
  model,
  probe,
  l3Probe,
  anchored,
  versions,
  selectedKey,
  isLoadingVersion,
  onOpenVersions,
  onSelectVersion,
}: ModelCardProps) {
  const locale = useLocale();
  const t = dict(locale);

  // One card, one gap column (CLAUDE.md, "Model cards and the shared
  // scale") — when a model has both probes' data, L3 wins: it's the primary
  // probe (docs/probe-l3-spec.md), L2 is only a control, and L3's enacted
  // score is report fidelity about real agentic work rather than omission
  // under a one-shot pressure clause.
  const enacted = l3Probe?.enacted ?? probe?.enacted;
  // The reasoning level behind each measured point (lib/reasoningConfig.mjs),
  // shown so a reader knows what configuration a number came from. L2 has
  // no reasoning record, so an L2-fallback enacted point shows none.
  const enactedReasoning = l3Probe?.enacted !== undefined ? l3Probe.reasoning : undefined;
  const hasEnactedReasoningSource = l3Probe?.enacted !== undefined;
  const sameReasoning =
    anchored !== undefined &&
    hasEnactedReasoningSource &&
    JSON.stringify(anchored.reasoning ?? null) === JSON.stringify(enactedReasoning ?? null);
  // The three-level record (docs/declared-spec.md): generic always exists
  // (it's the existing HEXACO H score), anchored/enacted may not yet.
  // GapColumn itself enforces the one rule that must never bend — no
  // segment drawn straight from generic to enacted.
  const generic = model.scores[0];

  // Badge = has this version had a complete L3 run (every scenario of the
  // current frozen set), not recency: the old "live"/"Archived" pair implied
  // continuous re-assessment of the newest version, which isn't done (it's
  // a separate project — see /methodology). Which version a card shows by
  // default still follows ModelScore.isCurrent. An L2-only version is "to do".
  const isComplete = l3Probe?.complete === true;
  // "live" descriptions are only ever generated in English (see
  // scripts/assess.mjs); oneLinerIt is a translation added afterwards and
  // may not exist yet for older/unbackfilled runs — fall back to English.
  const oneLiner = locale === "it" ? model.oneLinerIt ?? model.oneLiner : model.oneLiner;

  // Until `versions` loads, show just the currently-displayed run as the
  // only option so the combo never renders empty.
  const currentKey = selectedKey ?? versionKey({ assessedAt: model.assessedAt ?? null });
  const options = dedupeByVersion(
    versions ?? [{ assessedAt: model.assessedAt ?? null, modelVersion: model.model ?? null, source: model.source }]
  );

  return (
    <div className={styles.card}>
      <div className={`${styles.sourceBadge} ${isComplete ? styles.statusComplete : styles.statusTodo}`}>
        <span className={styles.sourceDot} />
        {isComplete ? t.card.complete : t.card.todo}
      </div>

      <div className={styles.header}>
        <div
          className={styles.monogram}
          style={{ background: `oklch(62% 0.14 ${model.hue})` }}
        >
          {model.monogram}
        </div>
        <div className={styles.headerText}>
          <div className={styles.name}>{model.name}</div>
        </div>
      </div>

      <div className={styles.oneLiner}>{oneLiner}</div>

      <div className={styles.radarRow}>
        <RadarChart
          scores={model.scores}
          hue={model.hue}
          margin={model.margin}
          className={styles.radar}
        />
        {(anchored !== undefined || enacted !== undefined) && (
          <GapColumn
            generic={generic}
            anchored={anchored?.anchored}
            enacted={enacted}
            hue={model.hue}
            className={styles.gapColumn}
            ariaLabel={t.card.gapAriaLabel(generic, anchored?.anchored, enacted)}
          />
        )}
      </div>

      {(anchored !== undefined || enacted !== undefined) && (
        <div className={styles.gapLegend}>
          <span className={styles.gapLegendItem}>
            <span className={styles.gapLegendDot} style={{ background: `oklch(55% 0.14 ${model.hue})` }} />
            {t.card.generic}
          </span>
          {anchored !== undefined && (
            <span className={styles.gapLegendItem}>
              <span className={`${styles.gapLegendDot} ${styles.gapLegendDotLarge}`} style={{ background: `oklch(75% 0.13 ${model.hue})` }} />
              {t.card.anchored}
            </span>
          )}
          {enacted !== undefined && (
            <span className={styles.gapLegendItem}>
              <span
                className={styles.gapLegendDot}
                style={{ background: "white", border: `1.5px solid oklch(35% 0.15 ${model.hue})` }}
              />
              {t.card.enacted}
            </span>
          )}
        </div>
      )}

      {(anchored !== undefined || hasEnactedReasoningSource) && (
        <div className={styles.reasoningNote}>
          {t.card.reasoningLabel}:{" "}
          {sameReasoning || !hasEnactedReasoningSource
            ? t.card.reasoning(anchored !== undefined ? anchored.reasoning : enactedReasoning)
            : anchored === undefined
              ? t.card.reasoning(enactedReasoning)
              : `${t.card.anchored} ${t.card.reasoning(anchored.reasoning)} · ${t.card.enacted} ${t.card.reasoning(enactedReasoning)}`}
        </div>
      )}

      {onSelectVersion ? (
        <VersionCombo
          options={options}
          currentKey={currentKey}
          hue={model.hue}
          disabled={isLoadingVersion}
          ariaLabel={t.card.versionAriaLabel(model.name)}
          onOpen={onOpenVersions}
          onSelect={onSelectVersion}
        />
      ) : (
        model.model && (
          <div className={styles.modelTag}>
            {model.model}
            {model.assessedAt &&
              ` · ${new Date(model.assessedAt).toLocaleDateString(dateLocale(locale), { day: "2-digit", month: "short" })}`}
          </div>
        )
      )}
    </div>
  );
}
