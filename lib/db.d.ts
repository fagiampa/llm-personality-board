import type { ModelScore } from "./hexaco";

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

export function upsertAssessment(record: AssessmentRecord): Promise<void>;
export function listLatestPerModel(): Promise<ModelScore[]>;
export function getLatest(modelName: string): Promise<ModelScore | undefined>;
export function listVersions(modelName: string): Promise<VersionOption[]>;
export function getAssessment(modelName: string, assessedAt: string | null): Promise<ModelScore | undefined>;
export function recomputeIsCurrentForModel(modelName: string): Promise<void>;
