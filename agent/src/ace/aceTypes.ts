import type { PaymentStatus } from "../types/domain";
import type { JsonRecord } from "../types/json";

export type AceMode = "mock" | "real";

export type AceServiceName =
  | "web_search"
  | "entity_enrichment"
  | "ai_classification";

export interface AceClientConfig {
  apiKey: string;
  accountId: string;
  serviceBaseUrl: string;
  platformBaseUrl: string;
  platformToken: string;
  facilitatorUrl: string;
  x402PrivateKey: string;
  x402Network: string;
  x402MaxPaymentUsdc: number;
  x402RequirePayment: boolean;
  x402OrderId: string;
  x402OrderIds: Partial<Record<AceServiceName, string>>;
  servicePaths: Record<AceServiceName, string>;
  aiModel: string;
  mockMode: boolean;
}

export interface AceWebSearchInput {
  query: string;
  reasonForCall: string;
  maxResults?: number;
}

export interface AceEntityEnrichmentInput {
  entity: string;
  reasonForCall: string;
  links?: string[];
  profiles?: string[];
  attributes?: JsonRecord;
}

export interface AceAIClassificationInput {
  targetType: "token" | "wallet";
  targetAddress: string;
  reasonForCall: string;
  evidence: Record<string, unknown>;
  rubricVersion?: string;
}

export interface AceServiceCallResult {
  mode: AceMode;
  serviceName: AceServiceName;
  inputSummary: string;
  outputSummary: string;
  cost: number;
  paymentStatus: PaymentStatus;
  facilitator: string;
  txSignature: string | null;
  mockReceiptId: string | null;
  receiptPayload: JsonRecord;
  rawResponse: JsonRecord;
}
