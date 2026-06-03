import type { JsonRecord } from "../types/json";

export type SentinelMode = "mock" | "real";

export type SentinelTargetType = "token" | "wallet";

export interface SentinelGatewayTool {
  name: string;
  plugin?: string;
  category?: string;
  protocol?: string;
  description?: string;
  pricePerCall?: number;
  currency?: string;
}

export interface SentinelGatewayHealth {
  status?: string;
  network?: string;
  sapNetwork?: string;
  usdcMint?: string;
}

export interface SentinelPaymentChallenge {
  error?: string;
  protocol?: string;
  tool?: string;
  pricePerCall?: number;
  currency?: string;
  acceptedTokens?: string[];
  network?: string;
  minEscrowDeposit?: number;
  hint?: string;
  reason?: string;
}

export interface SentinelGatewayPreflightResult {
  mode: SentinelMode;
  endpoint: string;
  sentinelAgentId: string;
  merchantWallet: string;
  depositorWallet: string | null;
  tokenTool: string;
  walletTool: string;
  health: SentinelGatewayHealth | null;
  toolCount: number;
  selectedToolsFound: boolean;
  paymentChallengeSeen: boolean;
  paymentChallenge: SentinelPaymentChallenge | null;
  checkedAt: string;
}

export interface SentinelCheckContext {
  runId?: string;
  evidence?: Record<string, unknown>;
  requestedBy?: string;
  notes?: string;
}

export interface SentinelCheckResult {
  mode: SentinelMode;
  sentinelAgentId: string;
  targetType: SentinelTargetType;
  targetAddress: string;
  checkType: "risk_screen" | "reputation_screen";
  status: "passed" | "review" | "failed" | "mocked";
  confidence: number;
  riskFlags: string[];
  resultSummary: string;
  proofPayload: JsonRecord;
  rawResponse: JsonRecord;
  checkedAt: string;
}
