"use client";

import { useCallback, useState } from "react";
import { ModelScore, ProbeScore, L3ProbeScore, AnchoredScore } from "@/lib/hexaco";
import { ModelCard, versionKey, VersionOption } from "./ModelCard";
import styles from "@/app/page.module.css";

// Renders the grid and owns per-card version selection. Deliberately does
// NOT cache fetched runs across selections (sessionStorage used to, but that
// meant re-selecting an already-viewed version could show data from before a
// since-made edit — DB rows here get edited directly fairly often during
// development, so "always fresh" wins over the extra round trip).
interface ModelGridProps {
  initialModels: ModelScore[];
  /** Every model's version list, prefetched server-side (see app/page.tsx's getHomeData) so the first combo open of the session doesn't wait on a cold DB open. */
  initialVersions: Record<string, VersionOption[]>;
  /** The L2 (control) probe's enacted score matching each model's initially-displayed version, if one exists yet. */
  initialProbes: Record<string, ProbeScore>;
  /** The L3 (primary) probe's enacted score matching each model's initially-displayed version, if one exists yet. */
  initialL3Probes: Record<string, L3ProbeScore>;
  /** The declared side's anchored score (RF-v1) matching each model's initially-displayed version, if one exists yet. */
  initialAnchored: Record<string, AnchoredScore>;
}

export function ModelGrid({ initialModels, initialVersions, initialProbes, initialL3Probes, initialAnchored }: ModelGridProps) {
  const [dataByModel, setDataByModel] = useState<Record<string, ModelScore>>(() =>
    Object.fromEntries(initialModels.map((m) => [m.name, m]))
  );
  const [versionsByModel, setVersionsByModel] = useState<Record<string, VersionOption[]>>(initialVersions);
  const [probeByModel, setProbeByModel] = useState<Record<string, ProbeScore | undefined>>(initialProbes);
  const [l3ProbeByModel, setL3ProbeByModel] = useState<Record<string, L3ProbeScore | undefined>>(initialL3Probes);
  const [anchoredByModel, setAnchoredByModel] = useState<Record<string, AnchoredScore | undefined>>(initialAnchored);
  const [selectedKeyByModel, setSelectedKeyByModel] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialModels.map((m) => [m.name, versionKey({ assessedAt: m.assessedAt ?? null })]))
  );
  const [loadingModel, setLoadingModel] = useState<string | null>(null);

  const loadVersions = useCallback(
    (modelName: string) => {
      if (versionsByModel[modelName]) return;
      fetch(`/api/versions?model=${encodeURIComponent(modelName)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((versions: VersionOption[] | null) => {
          if (versions) setVersionsByModel((prev) => ({ ...prev, [modelName]: versions }));
        })
        .catch(() => {
          // combo just keeps showing the single currently-loaded version
        });
    },
    [versionsByModel]
  );

  const selectVersion = useCallback((modelName: string, key: string) => {
    setSelectedKeyByModel((prev) => ({ ...prev, [modelName]: key }));

    setLoadingModel(modelName);
    const assessedAt = key === "__seed__" ? "" : key;
    fetch(`/api/assessment?model=${encodeURIComponent(modelName)}&assessedAt=${encodeURIComponent(assessedAt)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((model: ModelScore | null) => {
        if (!model) return;
        setDataByModel((prev) => ({ ...prev, [modelName]: model }));
      })
      .finally(() => setLoadingModel((prev) => (prev === modelName ? null : prev)));

    // Independent of the assessment fetch above: a 404 here (no probe run
    // yet for this version) is expected, not an error — the card just
    // renders without a gap column (see ModelCard).
    fetch(`/api/probe?model=${encodeURIComponent(modelName)}&assessedAt=${encodeURIComponent(assessedAt)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((probe: ProbeScore | null) => {
        setProbeByModel((prev) => ({ ...prev, [modelName]: probe ?? undefined }));
      })
      .catch(() => {
        setProbeByModel((prev) => ({ ...prev, [modelName]: undefined }));
      });

    // Same "404 is expected, not an error" reasoning as the L2 fetch above.
    fetch(`/api/probe-l3?model=${encodeURIComponent(modelName)}&assessedAt=${encodeURIComponent(assessedAt)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((probe: L3ProbeScore | null) => {
        setL3ProbeByModel((prev) => ({ ...prev, [modelName]: probe ?? undefined }));
      })
      .catch(() => {
        setL3ProbeByModel((prev) => ({ ...prev, [modelName]: undefined }));
      });

    // Same "404 is expected, not an error" reasoning again, for the declared
    // side's anchored score (docs/declared-spec.md).
    fetch(`/api/declared?model=${encodeURIComponent(modelName)}&assessedAt=${encodeURIComponent(assessedAt)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((anchored: AnchoredScore | null) => {
        setAnchoredByModel((prev) => ({ ...prev, [modelName]: anchored ?? undefined }));
      })
      .catch(() => {
        setAnchoredByModel((prev) => ({ ...prev, [modelName]: undefined }));
      });
  }, []);

  return (
    <div className={styles.grid}>
      {initialModels.map((initial) => {
        const modelName = initial.name;
        return (
          <ModelCard
            key={modelName}
            model={dataByModel[modelName] ?? initial}
            probe={probeByModel[modelName]}
            l3Probe={l3ProbeByModel[modelName]}
            anchored={anchoredByModel[modelName]}
            versions={versionsByModel[modelName]}
            selectedKey={selectedKeyByModel[modelName]}
            isLoadingVersion={loadingModel === modelName}
            onOpenVersions={() => loadVersions(modelName)}
            onSelectVersion={(key) => selectVersion(modelName, key)}
          />
        );
      })}
    </div>
  );
}
