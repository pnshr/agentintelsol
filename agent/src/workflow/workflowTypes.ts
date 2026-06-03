import type {
  AceAIClassificationInput,
  AceEntityEnrichmentInput,
  AceServiceCallResult,
  AceServiceName,
  AceWebSearchInput
} from "../ace/aceTypes";
import type { SapToolDiscoveryResult } from "../sap/sapTypes";
import type { SentinelCheckResult } from "../sentinel/sentinelTypes";
import type {
  AccountInfo,
  RecentTransfer,
  SynapseRpcEnvelope,
  TokenHolder,
  TokenMetadata,
  TokenSupply,
  WalletTransaction
} from "../synapse/synapseTypes";
import type { GeneratedReport } from "../reports/reportTypes";
export type { GeneratedReport };

export type WorkflowTargetType = "token" | "wallet";

export type WorkflowTriggerType =
  | "manual"
  | "scheduled"
  | "api"
  | "agent_request";

export interface RunIntelligenceWorkflowInput {
  targetType: WorkflowTargetType;
  targetAddress: string;
  triggerType: WorkflowTriggerType;
  requester?: string;
}

export type ToolDecisionInputPayload =
  | AceWebSearchInput
  | AceEntityEnrichmentInput
  | AceAIClassificationInput;

export interface ToolDecision {
  serviceName: AceServiceName;
  reasonForCall: string;
  inputPayload: ToolDecisionInputPayload;
  estimatedCost: number;
}

export interface TokenOnChainEvidence {
  targetType: "token";
  accountInfo: SynapseRpcEnvelope<AccountInfo>;
  metadata: SynapseRpcEnvelope<TokenMetadata>;
  supply: SynapseRpcEnvelope<TokenSupply>;
  topHolders: SynapseRpcEnvelope<TokenHolder[]>;
  recentTransfers: SynapseRpcEnvelope<RecentTransfer[]>;
}

export interface WalletOnChainEvidence {
  targetType: "wallet";
  accountInfo: SynapseRpcEnvelope<AccountInfo>;
  transactions: SynapseRpcEnvelope<WalletTransaction[]>;
  recentTransfers: SynapseRpcEnvelope<RecentTransfer[]>;
}

export type OnChainEvidence = TokenOnChainEvidence | WalletOnChainEvidence;

export interface StoredAceCall {
  serviceResult: AceServiceCallResult;
  receiptId: string;
}

export interface WorkflowRunResult {
  runId: string;
  reportId: string | null;
  status: "completed" | "failed";
  report?: GeneratedReport;
  error?: string;
  selectedTools?: ToolDecision[];
  sapTools?: SapToolDiscoveryResult[];
  aceCalls?: StoredAceCall[];
  sentinel?: SentinelCheckResult;
}
