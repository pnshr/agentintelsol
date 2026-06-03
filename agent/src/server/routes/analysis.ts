import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDemoAddress } from "../../config/demoAddresses";
import { paymentReceipts, reports, spendingEvents } from "../../db/schema";
import { WorkflowOrchestrator } from "../../workflow/workflowOrchestrator";
import type { ServerDependencies } from "../app";

const analyzeBodySchema = z.object({
  targetType: z.enum(["token", "wallet"]),
  targetAddress: z.string().min(1),
  triggerType: z
    .enum(["manual", "scheduled", "api", "agent_request"])
    .default("api"),
  requester: z.string().optional()
});

const idParamsSchema = z.object({
  id: z.string().min(1)
});

const runIdParamsSchema = z.object({
  runId: z.string().min(1)
});

export function registerAnalysisRoutes(
  server: FastifyInstance,
  dependencies: ServerDependencies
): void {
  server.post("/api/analyze", async (request, reply) => {
    const body = analyzeBodySchema.safeParse(request.body);

    if (!body.success) {
      return reply.status(400).send({
        error: "invalid_analysis_request",
        message: body.error.issues.map((issue) => issue.message).join("; ")
      });
    }

    const orchestrator = new WorkflowOrchestrator(dependencies);
    const workflowInput = {
      targetType: body.data.targetType,
      targetAddress: body.data.targetAddress,
      triggerType: body.data.triggerType,
      ...(body.data.requester ? { requester: body.data.requester } : {})
    };
    const result = await orchestrator.runIntelligenceWorkflow(workflowInput);

    return reply.status(result.status === "completed" ? 200 : 422).send(result);
  });

  server.get("/api/reports/:id", async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.status(400).send({
        error: "invalid_report_id",
        message: "Report id is required"
      });
    }

    const [report] = await dependencies.db
      .select()
      .from(reports)
      .where(eq(reports.id, params.data.id))
      .limit(1);

    if (!report) {
      return reply.status(404).send({
        error: "report_not_found",
        message: `No report found for id ${params.data.id}`
      });
    }

    return { report };
  });

  server.get("/api/payments/:runId", async (request, reply) => {
    const params = runIdParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.status(400).send({
        error: "invalid_run_id",
        message: "Run id is required"
      });
    }

    const [receipts, spending] = await Promise.all([
      dependencies.db
        .select()
        .from(paymentReceipts)
        .where(eq(paymentReceipts.runId, params.data.runId)),
      dependencies.db
        .select()
        .from(spendingEvents)
        .where(eq(spendingEvents.runId, params.data.runId))
    ]);

    return {
      runId: params.data.runId,
      receipts,
      spendingEvents: spending
    };
  });

  server.post("/api/scheduled-demo-run", async () => {
    const orchestrator = new WorkflowOrchestrator(dependencies);

    return orchestrator.runIntelligenceWorkflow({
      targetType: "token",
      targetAddress: getDemoAddress(dependencies.config, "token"),
      triggerType: "scheduled",
      requester: "scheduled-demo"
    });
  });
}
