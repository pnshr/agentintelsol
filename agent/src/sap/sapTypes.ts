import type { JsonRecord } from "../types/json";

export type SapMode = "mock" | "real";

export interface SapAgentMetadata {
  name: string;
  description: string;
  version: string;
  capabilities: string[];
  protocols: string[];
  endpoint?: string;
  x402Endpoint?: string;
  ownerWallet?: string;
  tags?: string[];
  metadataUri?: string;
  extra?: JsonRecord;
}

export interface SapRegistrationResult {
  mode: SapMode;
  agentId: string;
  registryEndpoint: string;
  status: "registered" | "dry_run" | "pending" | "failed";
  txSignature: string | null;
  registrationPayload: JsonRecord;
  createdAt: string;
}

export interface SapToolDiscoveryQuery {
  capability?: string;
  protocol?: string;
  targetType?: "token" | "wallet";
  tags?: string[];
  maxResults?: number;
  minReputationScore?: number;
}

export interface SapToolPricing {
  model: "free" | "x402" | "subscription" | "unknown";
  amountUsdc: number | null;
}

export interface SapToolReputation {
  score: number;
  uptimeBps: number;
  latencyMs: number;
  calls: number;
}

export interface SapToolDiscoveryResult {
  mode: SapMode;
  toolId: string;
  name: string;
  capability: string;
  protocol: string;
  endpoint: string;
  pricing: SapToolPricing;
  reputation: SapToolReputation;
  metadata: JsonRecord;
  discoveredAt: string;
}

export interface SapAgentStatus {
  mode: SapMode;
  agentId: string;
  registryEndpoint: string;
  status: "active" | "inactive" | "unknown";
  capabilities: string[];
  reputation: SapToolReputation;
  lastSeenAt: string;
}

export interface SapRecordedToolDiscovery {
  id: string;
  runId: string;
  toolId: string;
  capability: string;
  selectedTool: string;
  persisted: boolean;
  createdAt: string;
}
