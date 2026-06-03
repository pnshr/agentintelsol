import type { FastifyInstance } from "fastify";
import { getBalanceSummary } from "../../balances/balanceService";
import type { ServerDependencies } from "../app";

export function registerBalanceRoutes(
  server: FastifyInstance,
  dependencies: ServerDependencies
): void {
  server.get("/api/balances", async () => getBalanceSummary(dependencies.config));
}
