import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { getIntegrationStatus } from "../../integrations/integrationStatus";
import type { ServerDependencies } from "../app";

export function registerHealthRoutes(
  server: FastifyInstance,
  dependencies: ServerDependencies
): void {
  server.get("/api/health", async () => {
    const databaseStatus = await checkDatabase(dependencies);

    return {
      ok: databaseStatus.ok,
      service: "agentintel-broker-agent",
      env: dependencies.config.NODE_ENV,
      sapMockMode: dependencies.config.SAP_MOCK_MODE,
      synapseMockMode: dependencies.config.SYNAPSE_MOCK_MODE,
      aceMockMode: dependencies.config.ACE_MOCK_MODE,
      sentinelMockMode: dependencies.config.SENTINEL_MOCK_MODE,
      integrationStatus: getIntegrationStatus(dependencies.config),
      database: databaseStatus,
      uptimeSeconds: Math.round(process.uptime())
    };
  });
}

async function checkDatabase(dependencies: ServerDependencies): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    await dependencies.db.run(sql`SELECT 1`);
    return { ok: true, message: "connected" };
  } catch (error) {
    dependencies.logger.error({ error }, "Database health check failed");
    return { ok: false, message: "unavailable" };
  }
}
