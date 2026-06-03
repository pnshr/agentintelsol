import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { Logger } from "pino";
import type { AppConfig } from "../config/env";
import type { AppDatabase } from "../db/runsRepository";
import { registerHealthRoutes } from "./routes/health";
import { registerAnalysisRoutes } from "./routes/analysis";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerIntegrationRoutes } from "./routes/integrations";
import { registerProofRoutes } from "./routes/proof";
import { registerReadinessRoutes } from "./routes/readiness";
import { registerRunRoutes } from "./routes/runs";
import { registerBalanceRoutes } from "./routes/balances";
import { getCorsOrigins, registerRequestControls } from "./requestControls";

export interface ServerDependencies {
  config: AppConfig;
  db: AppDatabase;
  logger: Logger;
}

export function buildServer(dependencies: ServerDependencies): FastifyInstance {
  const server = Fastify({
    logger:
      dependencies.config.NODE_ENV === "test"
        ? false
        : {
            level: "info"
          }
  });

  server.decorate("config", dependencies.config);
  server.decorate("db", dependencies.db);

  void server.register(cors, {
    origin: getCorsOrigins(dependencies.config)
  });

  registerRequestControls(server, dependencies.config);

  server.setErrorHandler((error, request, reply) => {
    const statusCode = getErrorStatusCode(error);
    const message = getErrorMessage(error);

    dependencies.logger.error(
      {
        error,
        method: request.method,
        url: request.url
      },
      "Unhandled API error"
    );

    return reply.status(statusCode).send({
      error: statusCode >= 500 ? "internal_server_error" : "request_error",
      message:
        statusCode >= 500
          ? "Unexpected server error. Check backend logs for details."
          : message
    });
  });

  server.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      error: "not_found",
      message: `No route found for ${request.method} ${request.url}`
    })
  );

  registerHealthRoutes(server, dependencies);
  registerRunRoutes(server, dependencies);
  registerAnalysisRoutes(server, dependencies);
  registerDashboardRoutes(server, dependencies);
  registerIntegrationRoutes(server, dependencies);
  registerBalanceRoutes(server, dependencies);
  registerProofRoutes(server, dependencies);
  registerReadinessRoutes(server, dependencies);

  return server;
}

function getErrorStatusCode(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    error.statusCode >= 400
  ) {
    return error.statusCode;
  }

  return 500;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Request failed";
}
