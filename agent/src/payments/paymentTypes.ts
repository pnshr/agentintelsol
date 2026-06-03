import type { PaymentStatus } from "../types/domain";
import type { JsonRecord } from "../types/json";

export type SpendingPolicyErrorCode =
  | "RUN_NOT_FOUND"
  | "MISSING_REASON_FOR_CALL"
  | "MAX_RUN_SPEND_EXCEEDED"
  | "MAX_DAILY_SPEND_EXCEEDED"
  | "MAX_TOOL_CALLS_EXCEEDED"
  | "REPEATED_TARGET_LIMIT_EXCEEDED"
  | "SELF_PAYMENT_LOOP"
  | "INVALID_RECEIPT"
  | "INVALID_COST";

export interface SpendingPolicyErrorDetails {
  runId?: string;
  targetType?: "token" | "wallet";
  targetAddress?: string;
  serviceName?: string;
  limit?: number;
  actual?: number;
  estimatedCost?: number;
  reason?: string;
}

export class SpendingPolicyError extends Error {
  public readonly code: SpendingPolicyErrorCode;
  public readonly details: SpendingPolicyErrorDetails;

  public constructor(
    code: SpendingPolicyErrorCode,
    message: string,
    details: SpendingPolicyErrorDetails = {}
  ) {
    super(message);
    this.name = "SpendingPolicyError";
    this.code = code;
    this.details = details;
  }
}

export interface SpendingPolicyCheckSuccess {
  allowed: true;
  runId?: string;
  remainingRunBudget?: number;
  remainingDailyBudget?: number;
  currentRunSpend?: number;
  currentDailySpend?: number;
  currentToolCalls?: number;
}

export interface PaymentReceiptForPolicy {
  serviceName: string;
  cost: number;
  status: PaymentStatus;
  facilitator: string;
  timestamp: string;
  reasonForCall?: string;
  txSignature?: string | null;
  mockReceiptId?: string | null;
  receiptPayload?: JsonRecord | null;
}

export interface RecordedSpendingEvent {
  id: string;
  runId: string;
  serviceName: string;
  cost: number;
  status: PaymentStatus;
  facilitator: string;
  createdAt: string;
}

export interface SpendingPolicyConfig {
  maxDailySpendUsdc: number;
  maxSpendPerRunUsdc: number;
  maxToolCallsPerRun: number;
  selfAgentId?: string;
  selfAccountId?: string;
}
