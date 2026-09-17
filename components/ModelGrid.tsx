"use client";

import { useCallback, useState } from "react";
import { ModelScore } from "@/lib/hexaco";
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
}

export function ModelGrid({ initialModels, initialVersions }: ModelGridProps) {
  const [dataByModel, setDataByModel] = useState<Record<string, ModelScore>>(() =>
    Object.fromEntries(initialModels.map((m) => [m.name, m]))
  );
  const [versionsByModel, setVersionsByModel] = useState<Record<string, VersionOption[]>>(initialVersions);
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
  }, []);

  return (
    <div className={styles.grid}>
      {initialModels.map((initial) => {
        const modelName = initial.name;
        return (
          <ModelCard
            key={modelName}
            model={dataByModel[modelName] ?? initial}
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
