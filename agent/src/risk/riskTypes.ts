import type { SentinelCheckResult } from "../sentinel/sentinelTypes";
import type { JsonRecord } from "../types/json";
import type { OnChainEvidence, StoredAceCall } from "../workflow/workflowTypes";

export type RiskVerdict =
  | "safe"
  | "monitor"
  | "high_risk"
  | "avoid"
  | "unknown";

export interface RiskEngineInput {
  targetType: "token" | "wallet";
  targetAddress: string;
  onChainEvidence: OnChainEvidence;
  aceCalls: StoredAceCall[];
  sentinel: SentinelCheckResult;
}

export interface RiskEngineResult {
  score: number;
  verdict: RiskVerdict;
  reasons: string[];
  signals: JsonRecord;
  confidence: number;
}

export interface RiskComponent {
  name: string;
  risk: number;
  reason: string;
}
