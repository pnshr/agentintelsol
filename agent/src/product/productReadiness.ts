import { desc } from "drizzle-orm";
import type { AppConfig } from "../config/env";
import type { AppDatabase } from "../db/runsRepository";
import {
  aceServiceCalls,
  paymentReceipts,
  reports,
  sentinelChecks,
  spendingEvents,
  toolDiscoveries,
  workflowRuns
} from "../db/schema";
import {
  getIntegrationStatus,
  type IntegrationStatus
} from "../integrations/integrationStatus";

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
      proofReadyRunId: string | null;
      mockReceiptCount: number;
  };
}

interface ProductReadinessDependencies {
  config: AppConfig;
  db: AppDatabase;
}

export async function buildProductReadiness(
  dependencies: ProductReadinessDependencies
): Promise<ProductReadiness> {
  const [runs, services, receipts, sentinels, reportRows, spending, discoveries] =
    await Promise.all([
      dependencies.db
        .select()
        .from(workflowRuns)
        .orderBy(desc(workflowRuns.startedAt)),
      dependencies.db.select().from(aceServiceCalls),
      dependencies.db.select().from(paymentReceipts),
      dependencies.db.select().from(sentinelChecks),
      dependencies.db.select().from(reports),
      dependencies.db.select().from(spendingEvents),
      dependencies.db.select().from(toolDiscoveries)
    ]);

  const integrationStatus = getIntegrationStatus(dependencies.config);
  const completedRuns = runs.filter((run) => run.status === "completed");
  const failedRuns = runs.filter((run) => run.status === "failed");
  const distinctAceServices = new Set(
    services.map((service) => service.serviceName)
  );
  const mockReceiptCount = receipts.filter((receipt) =>
    isMockReceipt(receipt.receiptPayload)
  ).length;
  const proofReadyRun = completedRuns.find((run) =>
    hasCompleteProofForRun(run.id, services, receipts, sentinels, reportRows)
  );
  const realProofRun = completedRuns.find((run) =>
    hasCompleteRealProofForRun(run.id, services, receipts, sentinels, reportRows)
  );
  const allIntegrationsConfigured = Object.values(integrationStatus).every(
    (status) => status === "configured"
  );
  const productionRequiresReal =
    dependencies.config.NODE_ENV === "production" &&
    dependencies.config.REQUIRE_REAL_INTEGRATIONS_FOR_PRODUCTION;
  const mainnetReady = allIntegrationsConfigured && Boolean(realProofRun);
  const status: ProductReadinessStatus = mainnetReady
    ? "mainnet_ready"
    : proofReadyRun
      ? "local_demo_ready"
      : "blocked";
  const blockers = buildBlockers({
    integrationStatus,
    hasProofRun: Boolean(proofReadyRun),
    hasRealProofRun: Boolean(realProofRun),
    productionRequiresReal
  });
  const checks = buildChecks({
    config: dependencies.config,
    integrationStatus,
    completedRuns,
    failedRuns,
    services,
    receipts,
    sentinels,
    reportRows,
    discoveries,
    spending,
    proofReadyRunId: proofReadyRun?.id ?? null,
    realProofRunId: realProofRun?.id ?? null,
    mockReceiptCount,
    productionRequiresReal
  });

  return {
    generatedAt: new Date().toISOString(),
    status,
    summary: summarizeStatus(status, mainnetReady),
    integrationStatus,
    blockers,
    checks,
    metrics: {
      totalRuns: runs.length,
      completedRuns: completedRuns.length,
      failedRuns: failedRuns.length,
      totalAceServiceCalls: services.length,
      distinctAceServices: distinctAceServices.size,
      totalPaymentReceipts: receipts.length,
      totalSentinelChecks: sentinels.length,
      totalReports: reportRows.length,
      totalSpend: spending.reduce((sum, event) => sum + event.amount, 0),
      latestCompletedRunId: completedRuns[0]?.id ?? null,
      completeRunId: proofReadyRun?.id ?? null,
      proofReadyRunId: proofReadyRun?.id ?? null,
      mockReceiptCount
    }
  };
}

function buildBlockers(input: {
  integrationStatus: IntegrationStatus;
  hasProofRun: boolean;
  hasRealProofRun: boolean;
  productionRequiresReal: boolean;
}): string[] {
  const blockers: string[] = [];

  for (const [name, status] of Object.entries(input.integrationStatus)) {
    if (status !== "configured") {
      blockers.push(`${name} is ${status}; production real-mode operation needs configured mode.`);
    }
  }

  if (!input.hasProofRun) {
    blockers.push(
      "No completed workflow run has the full audit set: 3 Ace calls, receipts, Sentinel, and report."
    );
  }

  if (!input.hasRealProofRun) {
    blockers.push(
      "No completed workflow run has non-mock payment receipts and non-mock Sentinel evidence."
    );
  }

  if (input.productionRequiresReal && blockers.length > 0) {
    blockers.push(
      "Production real-integration gate is enabled, so these blockers must be cleared before launch."
    );
  }

  return blockers;
}

function buildChecks(input: {
  config: AppConfig;
  integrationStatus: IntegrationStatus;
  completedRuns: Array<typeof workflowRuns.$inferSelect>;
  failedRuns: Array<typeof workflowRuns.$inferSelect>;
  services: Array<typeof aceServiceCalls.$inferSelect>;
  receipts: Array<typeof paymentReceipts.$inferSelect>;
  sentinels: Array<typeof sentinelChecks.$inferSelect>;
  reportRows: Array<typeof reports.$inferSelect>;
  discoveries: Array<typeof toolDiscoveries.$inferSelect>;
  spending: Array<typeof spendingEvents.$inferSelect>;
  proofReadyRunId: string | null;
  realProofRunId: string | null;
  mockReceiptCount: number;
  productionRequiresReal: boolean;
}): ProductReadinessCheck[] {
  const latestProofRunServices = input.proofReadyRunId
    ? input.services.filter((service) => service.runId === input.proofReadyRunId)
    : [];
  const latestProofRunReceipts = input.proofReadyRunId
    ? input.receipts.filter((receipt) => receipt.runId === input.proofReadyRunId)
    : [];
  const latestProofRunMockReceiptCount = latestProofRunReceipts.filter((receipt) =>
    isMockReceipt(receipt.receiptPayload)
  ).length;

  return [
    {
      id: "api_auth",
      label: "API protection",
      status: input.config.API_AUTH_TOKEN ? "pass" : "warning",
      detail: input.config.API_AUTH_TOKEN
        ? "API token protection is enabled for non-public endpoints."
        : "API token is not set. Fine for local demo; set API_AUTH_TOKEN before hosted use."
    },
    {
      id: "rate_limit",
      label: "Rate limiting",
      status: "pass",
      detail: `${input.config.RATE_LIMIT_MAX_REQUESTS} requests per ${input.config.RATE_LIMIT_WINDOW_MS}ms per client IP.`
    },
    {
      id: "sap",
      label: "SAP readiness",
      status: statusForIntegration(input.integrationStatus.sap),
      detail: integrationDetail("SAP", input.integrationStatus.sap, input.realProofRunId)
    },
    {
      id: "synapse_rpc",
      label: "Synapse RPC readiness",
      status: statusForIntegration(input.integrationStatus.synapseRpc),
      detail: integrationDetail(
        "Synapse RPC",
        input.integrationStatus.synapseRpc,
        input.realProofRunId
      )
    },
    {
      id: "ace_x402",
      label: "Ace x402 readiness",
      status: statusForIntegration(input.integrationStatus.aceX402),
      detail: integrationDetail(
        "Ace x402",
        input.integrationStatus.aceX402,
        input.realProofRunId
      )
    },
    {
      id: "sentinel",
      label: "Sentinel readiness",
      status: statusForIntegration(input.integrationStatus.sentinel),
      detail: integrationDetail(
        "Sentinel",
        input.integrationStatus.sentinel,
        input.realProofRunId
      )
    },
    {
      id: "complete_workflow",
      label: "Complete workflow audit",
      status: input.proofReadyRunId ? "pass" : "fail",
      detail: input.proofReadyRunId
        ? `Run ${input.proofReadyRunId} has tool discovery, paid calls, receipts, Sentinel, and report.`
        : "Run an analysis workflow to produce a complete audit trail."
    },
    {
      id: "three_services",
      label: "3 distinct Ace services",
      status: new Set(latestProofRunServices.map((item) => item.serviceName)).size >= 3
        ? "pass"
        : "fail",
      detail: `${new Set(latestProofRunServices.map((item) => item.serviceName)).size} distinct services in the complete run.`
    },
    {
      id: "payments",
      label: "Payment receipts",
      status:
        latestProofRunReceipts.length >= 3
          ? latestProofRunMockReceiptCount > 0
            ? "warning"
            : "pass"
          : "fail",
      detail:
        latestProofRunReceipts.length >= 3
          ? `${latestProofRunReceipts.length} receipts stored for the complete run; ${latestProofRunMockReceiptCount} are mock. Historical mock receipts in this local database: ${input.mockReceiptCount}.`
          : "At least 3 receipts are required for a complete paid workflow."
    },
    {
      id: "reasoned_buying",
      label: "Reasoned tool buying",
      status: input.services.every(
        (service) => service.reasonForCall.trim().length > 0
      )
        ? "pass"
        : "fail",
      detail: "Every stored Ace service call must include reason_for_call."
    },
    {
      id: "anti_wash",
      label: "Anti-wash controls",
      status: input.spending.length > 0 ? "pass" : "warning",
      detail:
        "SpendingPolicy enforces per-run spend, daily spend, tool-call count, repeated target, and self-payment controls."
    },
    {
      id: "real_evidence",
      label: "Real integration evidence",
      status: input.realProofRunId ? "pass" : "fail",
      detail: input.realProofRunId
        ? `Run ${input.realProofRunId} has non-mock receipts and Sentinel evidence.`
        : "No real integration run exists yet. Mock evidence is for local development only."
    },
    {
      id: "production_gate",
      label: "Production launch gate",
      status: input.productionRequiresReal
        ? input.realProofRunId
          ? "pass"
          : "fail"
        : "warning",
      detail: input.productionRequiresReal
        ? "Production requires real integrations before launch."
        : "Set REQUIRE_REAL_INTEGRATIONS_FOR_PRODUCTION=true for hosted production deployments."
    }
  ];
}

function hasCompleteProofForRun(
  runId: string,
  services: Array<typeof aceServiceCalls.$inferSelect>,
  receipts: Array<typeof paymentReceipts.$inferSelect>,
  sentinels: Array<typeof sentinelChecks.$inferSelect>,
  reportRows: Array<typeof reports.$inferSelect>
): boolean {
  return (
    new Set(
      services.filter((service) => service.runId === runId).map((service) => service.serviceName)
    ).size >= 3 &&
    receipts.filter((receipt) => receipt.runId === runId).length >= 3 &&
    sentinels.some((sentinel) => sentinel.runId === runId) &&
    reportRows.some((report) => report.runId === runId)
  );
}

function hasCompleteRealProofForRun(
  runId: string,
  services: Array<typeof aceServiceCalls.$inferSelect>,
  receipts: Array<typeof paymentReceipts.$inferSelect>,
  sentinels: Array<typeof sentinelChecks.$inferSelect>,
  reportRows: Array<typeof reports.$inferSelect>
): boolean {
  const runReceipts = receipts.filter((receipt) => receipt.runId === runId);
  const runSentinels = sentinels.filter((sentinel) => sentinel.runId === runId);

  return (
    hasCompleteProofForRun(runId, services, receipts, sentinels, reportRows) &&
    runReceipts.every(
      (receipt) => receipt.status === "settled" && !isMockReceipt(receipt.receiptPayload)
    ) &&
    runSentinels.every((sentinel) => !isMockReceipt(sentinel.proofPayload))
  );
}

function statusForIntegration(
  value: IntegrationStatus[keyof IntegrationStatus]
): ProductReadinessCheckStatus {
  if (value === "configured") {
    return "pass";
  }

  return value === "mock" ? "warning" : "fail";
}

function integrationDetail(
  name: string,
  value: IntegrationStatus[keyof IntegrationStatus],
  realProofRunId: string | null
): string {
  if (value === "configured") {
    if (realProofRunId) {
      return `${name} configuration is present and covered by run ${realProofRunId}.`;
    }

    return `${name} configuration is present. A successful real run is still required.`;
  }

  if (value === "mock") {
    return `${name} is in mock mode. This supports local development only.`;
  }

  return `${name} mock mode is disabled but required config is missing.`;
}

function summarizeStatus(
  status: ProductReadinessStatus,
  mainnetReady: boolean
): string {
  if (mainnetReady || status === "mainnet_ready") {
    return "Production real-integration gate is green based on configuration and stored evidence.";
  }

  if (status === "local_demo_ready") {
    return "Local workflow is complete, but production real-mode operation is blocked by integration gaps.";
  }

  return "Product is blocked until a complete workflow run exists.";
}

function isMockReceipt(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { mock?: unknown }).mock === true
  );
}
