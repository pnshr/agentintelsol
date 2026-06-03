import type { JsonRecord } from "../types/json";

export type SynapseMode = "mock" | "real";

export interface SynapseRpcConfig {
  rpcUrl: string;
  apiKey: string;
  mockMode: boolean;
}

export interface SynapseRpcEnvelope<T> {
  mode: SynapseMode;
  source: "synapse_rpc";
  fetchedAt: string;
  rawResponse: JsonRecord;
  data: T;
}

export interface TokenMetadata {
  mintAddress: string;
  name: string;
  symbol: string;
  uri: string | null;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  updateAuthority: string | null;
  metadataAddress: string | null;
}

export interface TokenSupply {
  mintAddress: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  uiAmountString: string;
  slot: number;
}

export interface TokenHolder {
  rank: number;
  owner: string;
  tokenAccount: string;
  amount: string;
  uiAmount: number;
  percentage: number;
}

export interface RecentTransfer {
  signature: string;
  slot: number;
  blockTime: string;
  source: string;
  destination: string;
  mint: string | null;
  amount: number | null;
  status: "confirmed" | "finalized" | "failed";
}

export interface WalletTransaction {
  signature: string;
  slot: number;
  blockTime: string;
  feeLamports: number;
  programIds: string[];
  tokenMints: string[];
  status: "confirmed" | "finalized" | "failed";
}

export interface AccountInfo {
  address: string;
  executable: boolean;
  lamports: number;
  ownerProgram: string;
  rentEpoch: number | null;
  dataLength: number;
}
