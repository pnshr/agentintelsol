import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getWorkflowRunById, listWorkflowRuns } from "../../db/runsRepository";
import type { ServerDependencies } from "../app";

const runParamsSchema = z.object({
  id: z.string().min(1)
});

export function registerRunRoutes(
  server: FastifyInstance,
  dependencies: ServerDependencies
): void {
  server.get("/api/runs", async () => {
    const runs = await listWorkflowRuns(dependencies.db);
    return { runs };
  });

  server.get("/api/runs/:id", async (request, reply) => {
    const params = runParamsSchema.safeParse(request.params);

    if (!params.success) {
      return reply.status(400).send({
        error: "invalid_run_id",
        message: "Run id is required"
      });
    }

    const run = await getWorkflowRunById(dependencies.db, params.data.id);

    if (!run) {
      return reply.status(404).send({
        error: "run_not_found",
        message: `No workflow run found for id ${params.data.id}`
      });
    }

    return { run };
  });
}
