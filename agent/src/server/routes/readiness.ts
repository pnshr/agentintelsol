import type { FastifyInstance } from "fastify";
import { buildProductReadiness } from "../../product/productReadiness";
import type { ServerDependencies } from "../app";

export function registerReadinessRoutes(
  server: FastifyInstance,
  dependencies: ServerDependencies
): void {
  server.get("/api/readiness", async () => buildProductReadiness(dependencies));
}
