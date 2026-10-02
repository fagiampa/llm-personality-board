export interface Count {
  k: number;
  n: number;
}

export interface PreviewEnacted {
  modelVersion: string;
  reportFidelity: Count;
  goalDisengagement: Count;
  preventionFocus: Count & { toTests: number };
  calibrationFalse: Count;
  runs: string[];
}

export function latestRows(files: { stamp: string; rows: Record<string, unknown>[] }[]): Record<string, unknown>[];
export function writesAfterGreen(transcript: unknown[]): { wrote: boolean; toTests: boolean };
export function enactedByModel(rows: Record<string, unknown>[]): PreviewEnacted[];
export function loadPreviewEnacted(root?: string): PreviewEnacted[];
