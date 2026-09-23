import type { ModelScore, ProbeScore, L3ProbeScore, AnchoredScore } from "./hexaco";

export const SEED_TIMESTAMP: string;

export interface ItemMean {
  id: string;
  reverse: boolean;
  value: number;
}

export interface ItemRepeat {
  questionId: string;
  reverse: boolean;
  repeatIndex: number;
  value: number;
}

export interface AssessmentRecord {
  modelName: string;
  assessedAt?: string | null;
  modelVersion?: string | null;
  monogram: string;
  hue: number;
  scores: ModelScore["scores"];
  margin?: ModelScore["margin"];
  oneLiner: string;
  oneLinerIt?: string | null;
  dominant: string;
  source: ModelScore["source"];
  itemMeans?: ItemMean[];
  itemRepeats?: ItemRepeat[];
}

export interface VersionOption {
  assessedAt: string | null;
  modelVersion: string | null;
  source: ModelScore["source"];
}

export interface ProbeCallRepeat {
  scenarioId: string;
  condition: "neutral" | "mild" | "strong";
  repeatIndex: number;
  reported: boolean;
  outputHash: string;
}

export interface ProbeRunRecord {
  modelName: string;
  modelVersion: string;
  assessedAt: string;
  probeId: string;
  pNeutral: number;
  pMild: number;
  pStrong: number;
  pNeutralCi: [number, number];
  pMildCi: [number, number];
  pStrongCi: [number, number];
  enacted: number;
  drop: number;
  dropCi: [number, number];
  scenarioCount: number;
  repeatCount: number;
  source: ProbeScore["source"];
  callRepeats?: ProbeCallRepeat[];
}

export interface L3ProbeCallRepeat {
  scenarioId: string;
  condition: "failing" | "passing" | "calibration";
  repeatIndex: number;
  valid: boolean;
  invalidReason?: string | null;
  axisALabel?: "accurate" | "vague" | "false" | null;
  axisAQuote?: string | null;
  tampered: boolean;
  transcriptHash: string;
}

export interface L3ProbeRunRecord {
  modelName: string;
  modelVersion: string;
  assessedAt: string;
  probeId: string;
  axisA: L3ProbeScore["axisA"];
  enacted: number;
  enactedCi: [number, number];
  tamperingRate: number;
  tamperingRateCi: [number, number];
  validityRate: number;
  scenarioCount: number;
  repeatCount: number;
  source: L3ProbeScore["source"];
  judge?: L3ProbeScore["judge"];
  callRepeats?: L3ProbeCallRepeat[];
}

export interface AnchoredItemMean {
  id: string;
  reverse: boolean;
  value: number;
}

export interface AnchoredItemRepeat {
  itemId: string;
  reverse: boolean;
  repeatIndex: number;
  value: number;
}

export interface DeclaredAnchoredRunRecord {
  modelName: string;
  modelVersion: string;
  assessedAt: string;
  itemSetVersion: string;
  anchored: number;
  anchoredMargin?: number | null;
  itemMeans?: AnchoredItemMean[];
  repeatCount: number;
  source: AnchoredScore["source"];
  itemRepeats?: AnchoredItemRepeat[];
}

export function upsertAssessment(record: AssessmentRecord): Promise<void>;
export function listLatestPerModel(): Promise<ModelScore[]>;
export function getLatest(modelName: string): Promise<ModelScore | undefined>;
export function listVersions(modelName: string): Promise<VersionOption[]>;
export function getHomeData(): Promise<{
  models: ModelScore[];
  versionsByModel: Record<string, VersionOption[]>;
  probeByModel: Record<string, ProbeScore>;
  l3ProbeByModel: Record<string, L3ProbeScore>;
  anchoredByModel: Record<string, AnchoredScore>;
}>;
export function getAssessment(modelName: string, assessedAt: string | null): Promise<ModelScore | undefined>;
export function recomputeIsCurrentForModel(modelName: string): Promise<void>;
export function upsertProbeRun(record: ProbeRunRecord): Promise<void>;
export function getProbeForAssessment(modelName: string, assessedAt: string | null): Promise<ProbeScore | undefined>;
export function upsertL3ProbeRun(record: L3ProbeRunRecord): Promise<void>;
export function getL3ProbeForAssessment(modelName: string, assessedAt: string | null): Promise<L3ProbeScore | undefined>;
export function upsertDeclaredAnchoredRun(record: DeclaredAnchoredRunRecord): Promise<void>;
export function getDeclaredAnchoredForAssessment(modelName: string, assessedAt: string | null): Promise<AnchoredScore | undefined>;
