import { desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  aceServiceCalls,
  paymentReceipts,
  reports,
  sentinelChecks,
  spendingEvents,
  toolDiscoveries,
  workflowRuns
} from "../../db/schema";
import type { ServerDependencies } from "../app";

const runParamsSchema = z.object({
  id: z.string().min(1)
});

export function registerDashboardRoutes(
  server: FastifyInstance,
  dependencies: ServerDependencies
): void {
  server.get("/api/dashboard/summary", async () => {
    const [runs, services, receipts, spending, sentinels, reportRows] = await Promise.all([
      dependencies.db
        .select()
        .from(workflowRuns)
        .orderBy(desc(workflowRuns.startedAt)),
      dependencies.db.select().from(aceServiceCalls),
      dependencies.db.select().from(paymentReceipts),
      dependencies.db.select().from(spendingEvents),
      dependencies.db.select().from(sentinelChecks),
      dependencies.db.select().from(reports)
    ]);

    const completedRuns = runs.filter((run) => run.status === "completed").length;
    const failedRuns = runs.filter((run) => run.status === "failed").length;
    const totalSpend = spending.reduce((sum, event) => sum + event.amount, 0);
    const proofRun = runs.find((run) =>
      hasCompleteRealProofForRun(run.id, services, receipts, sentinels, reportRows)
    );
    const proofRunServices = proofRun
      ? services.filter((service) => service.runId === proofRun.id)
      : [];
    const proofRunReceipts = proofRun
      ? receipts.filter((receipt) => receipt.runId === proofRun.id)
      : [];
    const proofRunReport = proofRun
      ? reportRows.find((report) => report.runId === proofRun.id)
      : null;

    return {
      agentName: "AgentIntel Broker",
      sapAgentId: dependencies.config.SAP_AGENT_ID || "mock-sap-agent",
      totalRuns: runs.length,
      completedRuns,
      failedRuns,
      totalAceServiceCalls: services.length,
      totalX402Payments: receipts.length,
      totalSpend,
      lastRunStatus: runs[0]?.status ?? "none",
      mockModes: {
        sap: dependencies.config.SAP_MOCK_MODE,
        synapse: dependencies.config.SYNAPSE_MOCK_MODE,
        ace: dependencies.config.ACE_MOCK_MODE,
        sentinel: dependencies.config.SENTINEL_MOCK_MODE
      },
      verifiedRun: proofRun
        ? {
            runId: proofRun.id,
            targetType: proofRun.targetType,
            targetAddress: proofRun.targetAddress,
            totalCost: proofRun.totalCost,
            aceServiceCalls: proofRunServices.length,
            paymentReceipts: proofRunReceipts.length,
            mockPaymentReceipts: proofRunReceipts.filter((receipt) =>
              isMockReceipt(receipt.receiptPayload)
            ).length,
            verdict: proofRunReport?.verdict ?? null,
            score: proofRunReport?.score ?? null,
            completedAt: proofRun.completedAt
          }
        : null
    };
  });

  server.get("/api/dashboard/runs", async () => {
    const [runs, services, receipts, sentinels, reportRows] = await Promise.all([
      dependencies.db
        .select()
        .from(workflowRuns)
        .orderBy(desc(workflowRuns.startedAt)),
      dependencies.db.select().from(aceServiceCalls),
      dependencies.db.select().from(paymentReceipts),
      dependencies.db.select().from(sentinelChecks),
      dependencies.db.select().from(reports)
    ]);
    const realProofRunId =
      runs.find((run) =>
        hasCompleteRealProofForRun(run.id, services, receipts, sentinels, reportRows)
      )?.id ?? null;

    return {
      runs: runs.map((run) => {
        const runServices = services.filter((service) => service.runId === run.id);
        const runReceipts = receipts.filter((receipt) => receipt.runId === run.id);
        const report = reportRows.find((item) => item.runId === run.id);

        return {
          id: run.id,
          targetType: run.targetType,
          targetAddress: run.targetAddress,
          triggerType: run.triggerType,
          requester: run.requester,
          status: run.status,
          totalServices: runServices.length,
          totalCost: run.totalCost,
          verdict: report?.verdict ?? "pending",
          score: report?.score ?? null,
          reportId: report?.id ?? null,
          createdAt: run.startedAt,
          completedAt: run.completedAt,
          error: run.error,
          isVerifiedRun: run.id === realProofRunId,
          mockReceiptCount: runReceipts.filter((receipt) =>
            isMockReceipt(receipt.receiptPayload)
          ).length
        };
      })
    };
  });

  server.get("/api/dashboard/runs/:id", async (request, reply) => {
    const params = runParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.status(400).send({
        error: "invalid_run_id",
        message: "Run id is required"
      });
    }

    const runId = params.data.id;
    const [run] = await dependencies.db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
      .limit(1);

    if (!run) {
      return reply.status(404).send({
        error: "run_not_found",
        message: `No workflow run found for id ${runId}`
      });
    }

    const [discoveries, services, receipts, spending, sentinels, reportRows] =
      await Promise.all([
        dependencies.db
          .select()
          .from(toolDiscoveries)
          .where(eq(toolDiscoveries.runId, runId)),
        dependencies.db
          .select()
          .from(aceServiceCalls)
          .where(eq(aceServiceCalls.runId, runId)),
        dependencies.db
          .select()
          .from(paymentReceipts)
          .where(eq(paymentReceipts.runId, runId)),
        dependencies.db
          .select()
          .from(spendingEvents)
          .where(eq(spendingEvents.runId, runId)),
        dependencies.db
          .select()
          .from(sentinelChecks)
          .where(eq(sentinelChecks.runId, runId)),
        dependencies.db.select().from(reports).where(eq(reports.runId, runId))
      ]);

    const report = reportRows[0] ?? null;

    return {
      run,
      timeline: buildTimeline({
        run,
        discoveries,
        services,
        sentinels,
        report
      }),
      toolDiscoveries: discoveries,
      aceServiceCalls: services,
      paymentReceipts: receipts,
      spendingEvents: spending,
      sentinelChecks: sentinels,
      report
    };
  });

  server.get("/api/dashboard/receipts", async () => {
    const rows = await dependencies.db
      .select()
      .from(paymentReceipts)
      .orderBy(desc(paymentReceipts.createdAt));

    return { receipts: rows };
  });

  server.get("/api/dashboard/reports", async () => {
    const rows = await dependencies.db
      .select()
      .from(reports)
      .orderBy(desc(reports.createdAt));

    return { reports: rows };
  });
}

function hasCompleteRealProofForRun(
  runId: string,
  services: Array<typeof aceServiceCalls.$inferSelect>,
  receipts: Array<typeof paymentReceipts.$inferSelect>,
  sentinels: Array<typeof sentinelChecks.$inferSelect>,
  reportRows: Array<typeof reports.$inferSelect>
): boolean {
  const runServices = services.filter((service) => service.runId === runId);
  const runReceipts = receipts.filter((receipt) => receipt.runId === runId);
  const runSentinels = sentinels.filter((sentinel) => sentinel.runId === runId);

  return (
    new Set(runServices.map((service) => service.serviceName)).size >= 3 &&
    runReceipts.length >= 3 &&
    runReceipts.every(
      (receipt) => receipt.status === "settled" && !isMockReceipt(receipt.receiptPayload)
    ) &&
    runSentinels.length > 0 &&
    runSentinels.every((sentinel) => !isMockReceipt(sentinel.proofPayload)) &&
    reportRows.some((report) => report.runId === runId)
  );
}

function isMockReceipt(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { mock?: unknown }).mock === true
  );
}

function buildTimeline(input: {
  run: typeof workflowRuns.$inferSelect;
  discoveries: Array<typeof toolDiscoveries.$inferSelect>;
  services: Array<typeof aceServiceCalls.$inferSelect>;
  sentinels: Array<typeof sentinelChecks.$inferSelect>;
  report: typeof reports.$inferSelect | null;
}) {
  const serviceSteps = input.services.map((service, index) => ({
    label: `Ace service #${index + 1} paid and called`,
    status: "completed",
    detail: `${service.serviceName}: ${service.paymentStatus}`,
    timestamp: service.createdAt
  }));

  return [
    {
      label: "Trigger received",
      status: "completed",
      detail: `${input.run.triggerType} trigger for ${input.run.targetType}`,
      timestamp: input.run.startedAt
    },
    {
      label: "Synapse RPC data fetched",
      status: input.run.status === "failed" ? "unknown" : "completed",
      detail: "On-chain evidence fetched by workflow adapter",
      timestamp: input.run.startedAt
    },
    {
      label: "SAP tools discovered",
      status: input.discoveries.length > 0 ? "completed" : "pending",
      detail: buildSapDiscoveryTimelineDetail(input.discoveries),
      timestamp: input.discoveries[0]?.createdAt ?? input.run.startedAt
    },
    ...serviceSteps,
    {
      label: "Sentinel called",
      status: input.sentinels.length > 0 ? "completed" : "pending",
      detail: input.sentinels[0]?.resultSummary ?? "No Sentinel result yet",
      timestamp: input.sentinels[0]?.createdAt ?? input.run.completedAt
    },
    {
      label: "Report generated",
      status: input.report ? "completed" : "pending",
      detail: input.report
        ? `${input.report.verdict} (${input.report.score})`
        : "No report yet",
      timestamp: input.report?.createdAt ?? input.run.completedAt
    }
  ];
}

function buildSapDiscoveryTimelineDetail(
  discoveries: Array<typeof toolDiscoveries.$inferSelect>
): string {
  if (discoveries.length === 0) {
    return "No SAP discovery record stored";
  }

  const noMatchRecord = discoveries.find((discovery) =>
    String(discovery.selectedTool ?? "").toLowerCase().includes("no sap tools matched")
  );

  if (noMatchRecord) {
    return "SAP registry query completed in real mode; 0 matching external tools were returned by the current index query.";
  }

  return `${discoveries.length} SAP tool discovery records stored`;
}
