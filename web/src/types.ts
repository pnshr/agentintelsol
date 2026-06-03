export type PageKey =
  | "home"
  | "new-analysis"
  | "runs"
  | "run-detail"
  | "receipts"
  | "reports"
  | "integration-status"
  | "readiness";

export type IntegrationReadiness = "mock" | "configured" | "missing_config";

export interface IntegrationStatus {
  sap: IntegrationReadiness;
  synapseRpc: IntegrationReadiness;
  aceX402: IntegrationReadiness;
  sentinel: IntegrationReadiness;
}

export interface VerifiedRunSummary {
  runId: string;
  targetType: "token" | "wallet";
  targetAddress: string;
  totalCost: number;
  aceServiceCalls: number;
  paymentReceipts: number;
  mockPaymentReceipts: number;
  verdict: string | null;
  score: number | null;
  completedAt: string | null;
}

export interface DashboardSummary {
  agentName: string;
  sapAgentId: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  totalAceServiceCalls: number;
  totalX402Payments: number;
  totalSpend: number;
  lastRunStatus: string;
  mockModes: {
    sap: boolean;
    synapse: boolean;
    ace: boolean;
    sentinel: boolean;
  };
  verifiedRun: VerifiedRunSummary | null;
}

export interface BalanceCheck {
  status: "ready" | "needs_funding" | "unconfigured" | "error";
  message: string;
}

export interface BalanceSummary {
  checkedAt: string;
  ace: {
    network: string;
    walletAddress: string | null;
    usdcBalance: number | null;
    nativeBalance: number | null;
    requiredUsdcForFullRun: number;
    check: BalanceCheck;
  };
  sentinel: {
    network: "solana";
    walletAddress: string | null;
    solBalance: number | null;
    minEscrowSol: number;
    check: BalanceCheck;
  };
}

export interface DashboardRun {
  id: string;
  targetType: "token" | "wallet";
  targetAddress: string;
  triggerType: string;
  requester: string | null;
  status: string;
  totalServices: number;
  totalCost: number;
  verdict: string;
  score: number | null;
  reportId: string | null;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
  isVerifiedRun?: boolean;
  mockReceiptCount?: number;
}

export interface WorkflowRun {
  id: string;
  targetType: "token" | "wallet";
  targetAddress: string;
  triggerType: string;
  requester: string | null;
  status: string;
  startedAt: string;
  completedAt: string | null;
  totalCost: number;
  error: string | null;
}

export interface TimelineStep {
  label: string;
  status: string;
  detail: string;
  timestamp: string | null;
}

export interface AceServiceCall {
  id: string;
  runId: string;
  serviceName: string;
  inputSummary: string;
  outputSummary: string | null;
  reasonForCall: string;
  paymentStatus: string;
  cost: number;
  receiptId: string | null;
  createdAt: string;
}

export interface PaymentReceipt {
  id: string;
  runId: string;
  serviceName: string;
  facilitator: string;
  txSignature: string | null;
  receiptPayload: Record<string, unknown> | null;
  status: string;
  createdAt: string;
}

export interface ReportRow {
  id: string;
  runId: string;
  targetType: "token" | "wallet";
  targetAddress: string;
  score: number;
  verdict: string;
  jsonReport: Record<string, unknown>;
  markdownReport: string;
  createdAt: string;
}

export interface RunDetail {
  run: WorkflowRun;
  timeline: TimelineStep[];
  toolDiscoveries: Array<Record<string, unknown>>;
  aceServiceCalls: AceServiceCall[];
  paymentReceipts: PaymentReceipt[];
  spendingEvents: Array<Record<string, unknown>>;
  sentinelChecks: Array<Record<string, unknown>>;
  report: ReportRow | null;
}

export interface AuditBundle {
  auditBundleVersion: string;
  generatedAt: string;
  integrationStatus: IntegrationStatus;
  mockModeNotice: string | null;
  auditHashAlgorithm: string;
  auditHash: string;
  run: WorkflowRun;
  toolDiscoveries: Array<Record<string, unknown>>;
  aceServiceCalls: AceServiceCall[];
  paymentReceipts: PaymentReceipt[];
  spendingEvents: Array<Record<string, unknown>>;
  sentinelChecks: Array<Record<string, unknown>>;
  report: ReportRow | null;
  verificationSummary: Record<string, unknown>;
}

export type ProductReadinessStatus =
  | "mainnet_ready"
  | "local_demo_ready"
  | "blocked";

export type ProductReadinessCheckStatus = "pass" | "warning" | "fail";

export interface ProductReadinessCheck {
  id: string;
  label: string;
  status: ProductReadinessCheckStatus;
  detail: string;
}

export interface ProductReadiness {
  generatedAt: string;
  status: ProductReadinessStatus;
  summary: string;
  integrationStatus: IntegrationStatus;
  blockers: string[];
  checks: ProductReadinessCheck[];
  metrics: {
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    totalAceServiceCalls: number;
    distinctAceServices: number;
    totalPaymentReceipts: number;
    totalSentinelChecks: number;
    totalReports: number;
    totalSpend: number;
    latestCompletedRunId: string | null;
    completeRunId: string | null;
    mockReceiptCount: number;
  };
}

export interface AnalyzeRequest {
  targetType: "token" | "wallet";
  targetAddress: string;
  triggerType: "manual" | "scheduled" | "api" | "agent_request";
  requester?: string;
}

export interface AnalyzeResult {
  runId: string;
  reportId: string | null;
  status: "completed" | "failed";
  report?: {
    score: number;
    verdict: string;
    jsonReport: Record<string, unknown>;
    markdownReport: string;
  };
  error?: string;
}
