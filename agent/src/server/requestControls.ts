import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "../config/env";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

const PUBLIC_PATHS = new Set(["/api/health", "/api/readiness"]);

export function registerRequestControls(
  server: FastifyInstance,
  config: AppConfig
): void {
  const rateBuckets = new Map<string, RateLimitBucket>();

  server.addHook("onRequest", async (request, reply) => {
    applySecurityHeaders(reply);
    if (!enforceRateLimit(request, reply, rateBuckets, config)) {
      return reply;
    }
    if (!enforceApiAuth(request, reply, config)) {
      return reply;
    }
  });
}

export function getCorsOrigins(config: AppConfig): true | string[] {
  const origins = config.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : true;
}

function applySecurityHeaders(reply: FastifyReply): void {
  reply.header("X-Content-Type-Options", "nosniff");
  reply.header("X-Frame-Options", "DENY");
  reply.header("Referrer-Policy", "no-referrer");
  reply.header("Cache-Control", "no-store");
}

function enforceRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  buckets: Map<string, RateLimitBucket>,
  config: AppConfig
): boolean {
  const now = Date.now();
  const key = request.ip;
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + config.RATE_LIMIT_WINDOW_MS
    });
    return true;
  }

  current.count += 1;

  if (current.count > config.RATE_LIMIT_MAX_REQUESTS) {
    reply.status(429).send({
      error: "rate_limit_exceeded",
      message: "Too many requests. Slow down and retry after the window resets."
    });
    return false;
  }

  return true;
}

function enforceApiAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig
): boolean {
  if (!config.API_AUTH_TOKEN || PUBLIC_PATHS.has(request.url.split("?")[0] ?? "")) {
    return true;
  }

  const expected = `Bearer ${config.API_AUTH_TOKEN}`;
  const actual = request.headers.authorization;

  if (actual !== expected) {
    reply.status(401).send({
      error: "unauthorized",
      message:
        "Missing or invalid API token. Provide Authorization: Bearer <token>."
    });
    return false;
  }

  return true;
}
