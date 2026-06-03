import type { FastifyInstance } from "fastify";
import { getIntegrationStatus } from "../../integrations/integrationStatus";
import type { ServerDependencies } from "../app";

export function registerIntegrationRoutes(
  server: FastifyInstance,
  dependencies: ServerDependencies
): void {
  server.get("/api/integration-status", async () =>
    getIntegrationStatus(dependencies.config)
  );
}
