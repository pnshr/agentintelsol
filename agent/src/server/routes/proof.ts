import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { getIntegrationStatus } from "../../integrations/integrationStatus";
import {
  aceServiceCalls,
  paymentReceipts,
  reports,
  sentinelChecks,
  spendingEvents,
  toolDiscoveries,
  workflowRuns
} from "../../db/schema";
import { sha256Hex } from "../../utils/stableJson";
import type { ServerDependencies } from "../app";

const runIdParamsSchema = z.object({
  runId: z.string().min(1)
});

export function registerProofRoutes(
  server: FastifyInstance,
  dependencies: ServerDependencies
): void {
  const handleAuditBundle = async (
    request: FastifyRequest,
    reply: FastifyReply
  ) => {
    const params = runIdParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.status(400).send({
        error: "invalid_run_id",
        message: "Run id is required"
      });
    }

    const runId = params.data.runId;
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

    const [
      discoveries,
      aceCalls,
      receipts,
      spending,
      sentinels,
      reportRows
    ] = await Promise.all([
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

    const mockReceiptCount = receipts.filter((receipt) =>
      isMockReceipt(receipt.receiptPayload)
    ).length;
    const auditSubject = {
      auditBundleVersion: "agentintel-audit-v1",
      integrationStatus: getIntegrationStatus(dependencies.config),
      mockModeNotice:
        mockReceiptCount > 0
          ? "This audit bundle contains mock x402 receipts. They are not real payment settlements."
          : null,
      run,
      toolDiscoveries: discoveries,
      aceServiceCalls: aceCalls,
      paymentReceipts: receipts,
      spendingEvents: spending,
      sentinelChecks: sentinels,
      report: reportRows[0] ?? null,
      verificationSummary: {
        hasCompleteWorkflow: run.status === "completed",
        sapDiscoveryRecords: discoveries.length,
        sapDiscoveryMatchedTools: discoveries.filter(
          (discovery) =>
            !String(discovery.selectedTool ?? "")
              .toLowerCase()
              .includes("no sap tools matched")
        ).length,
        sapDiscoveryModes: Array.from(
          new Set(
            discoveries.map((discovery) =>
              readDiscoveryMode(discovery.discoveryPayload)
            )
          )
        ),
        aceServiceCalls: aceCalls.length,
        paymentReceipts: receipts.length,
        mockPaymentReceipts: mockReceiptCount,
        sentinelChecks: sentinels.length,
        hasReport: reportRows.length > 0,
        paidCallsHaveReasons: aceCalls.every(
          (call) => call.reasonForCall.trim().length > 0
        ),
        totalRecordedSpend: spending.reduce((sum, event) => sum + event.amount, 0)
      }
    };
    const auditPayload = {
      ...auditSubject,
      auditBundleVersion: "agentintel-audit-v1",
      generatedAt: new Date().toISOString(),
      auditHashInputNotice:
        "auditHash excludes generatedAt so repeated exports of the same stored audit data are verifiable."
    };
    const bundle = {
      ...auditPayload,
      auditHashAlgorithm: "sha256-stable-json",
      auditHash: sha256Hex(auditSubject)
    };

    const query = request.query as { download?: string } | undefined;
    if (query?.download === "1" || query?.download === "true") {
      reply.header(
        "Content-Disposition",
        `attachment; filename="agentintel-audit-${runId}.json"`
      );
    }

    return bundle;
  };

  server.get("/api/audit/:runId", handleAuditBundle);
  server.get("/api/proof/:runId", handleAuditBundle);
}

function readDiscoveryMode(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { mode?: unknown }).mode === "string"
  ) {
    return (value as { mode: string }).mode;
  }

  return "unknown";
}

function isMockReceipt(receiptPayload: unknown): boolean {
  if (
    typeof receiptPayload !== "object" ||
    receiptPayload === null ||
    Array.isArray(receiptPayload)
  ) {
    return false;
  }

  return (receiptPayload as { mock?: unknown }).mock === true;
}
