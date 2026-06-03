import type { SapToolDiscoveryResult } from "../sap/sapTypes";
import type { SentinelCheckResult } from "../sentinel/sentinelTypes";
import type { JsonRecord } from "../types/json";
import type {
  OnChainEvidence,
  RunIntelligenceWorkflowInput,
  StoredAceCall,
  ToolDecision
} from "../workflow/workflowTypes";
import type { RiskEngineResult } from "../risk/riskTypes";

export interface GeneratedReport {
  jsonReport: JsonRecord;
  markdownReport: string;
  score: number;
  verdict: string;
}

export interface ReportGenerationInput {
  runId: string;
  workflowInput: RunIntelligenceWorkflowInput;
  onChainEvidence: OnChainEvidence;
  sapTools: SapToolDiscoveryResult[];
  selectedTools: ToolDecision[];
  aceCalls: StoredAceCall[];
  sentinel: SentinelCheckResult;
  risk: RiskEngineResult;
  totalCost: number;
  generatedAt?: Date;
}
