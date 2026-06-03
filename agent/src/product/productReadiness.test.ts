import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { AppConfig } from "../config/env";
import { createDatabase, type DatabaseContext } from "../db/client";
import { initializeDatabase } from "../db/initialize";
import {
  aceServiceCalls,
  paymentReceipts,
  reports,
  sentinelChecks,
  spendingEvents,
  toolDiscoveries,
  workflowRuns
} from "../db/schema";
import { buildProductReadiness } from "./productReadiness";

const baseConfig: AppConfig = {
  AGENT_PUBLIC_URL: "",
  AGENT_X402_ENDPOINT: "",
  OOBE_API_KEY: "",
  SAP_AGENT_ID: "agentintel-self",
  SAP_PRIVATE_KEY: "",
  SAP_REGISTRY_ENDPOINT: "",
  SAP_ENABLE_MAINNET_WRITES: false,
  SAP_MOCK_MODE: true,
  SYNAPSE_RPC_URL: "",
  SYNAPSE_API_KEY: "",
  SYNAPSE_MOCK_MODE: true,
  ACE_API_KEY: "",
  ACE_SERVICE_BASE_URL: "",
  ACE_PLATFORM_BASE_URL: "https://platform.acedata.cloud",
  ACE_PLATFORM_TOKEN: "",
  ACE_X402_FACILITATOR_URL: "",
  ACE_X402_PRIVATE_KEY: "",
  ACE_X402_NETWORK: "base",
  BASE_RPC_URL: "https://mainnet.base.org",
  ACE_X402_MAX_PAYMENT_USDC: 1,
  ACE_X402_REQUIRE_PAYMENT: false,
  ACE_X402_ORDER_ID: "",
  ACE_X402_ORDER_ID_WEB_SEARCH: "",
  ACE_X402_ORDER_ID_ENTITY_ENRICHMENT: "",
  ACE_X402_ORDER_ID_AI_CLASSIFICATION: "",
  ACE_ACCOUNT_ID: "ace-self-account",
  ACE_WEB_SEARCH_PATH: "/serp/google",
  ACE_ENTITY_ENRICHMENT_PATH: "/webextrator/extract",
  ACE_AI_CLASSIFICATION_PATH: "/openai/chat/completions",
  ACE_AI_MODEL: "gpt-4o-mini",
  ACE_MOCK_MODE: true,
  SENTINEL_AGENT_ID: "",
  SENTINEL_ENDPOINT: "",
  SENTINEL_CHECK_PATH: "/tools/:name",
  SENTINEL_HTTP_METHOD: "POST",
  SENTINEL_API_KEY: "",
  SENTINEL_MERCHANT_WALLET: "",
  SENTINEL_DEPOSITOR_WALLET: "",
  SENTINEL_TOOL_TOKEN: "spl-token_rugCheck",
  SENTINEL_TOOL_WALLET: "spl-token_getTokenAccounts",
  SENTINEL_MIN_ESCROW_LAMPORTS: 10_000_000,
  SENTINEL_ESCROW_NONCE: 0,
  SENTINEL_ESCROW_DEPOSIT_LAMPORTS: 10_000_000,
  SENTINEL_OPEN_ESCROW_WRITE: false,
  SENTINEL_MOCK_MODE: true,
  DEMO_TOKEN_ADDRESS: "So11111111111111111111111111111111111111112",
  DEMO_WALLET_ADDRESS: "11111111111111111111111111111111",
  DATABASE_URL: ":memory:",
  API_AUTH_TOKEN: "",
  CORS_ORIGIN: "",
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX_REQUESTS: 240,
  REQUIRE_REAL_INTEGRATIONS_FOR_PRODUCTION: false,
  MAX_DAILY_SPEND_USDC: 1,
  MAX_SPEND_PER_RUN_USDC: 0.1,
  MAX_TOOL_CALLS_PER_RUN: 3,
  NODE_ENV: "test",
  PORT: 3001
};

describe("ProductReadiness", () => {
  let database: DatabaseContext;

  beforeEach(() => {
    database = createDatabase(baseConfig);
    initializeDatabase(database.sqlite);
  });

  afterEach(() => {
    database.sqlite.close();
  });

  it("is blocked when there is no complete proof-ready run", async () => {
    const readiness = await buildProductReadiness({
      config: baseConfig,
      db: database.db
    });

    assert.equal(readiness.status, "blocked");
    assert.equal(readiness.metrics.proofReadyRunId, null);
    assert.ok(readiness.blockers.some((blocker) => blocker.includes("No completed workflow")));
  });

  it("marks a complete mock workflow as local demo ready only", async () => {
    await seedCompleteMockRun("run-ready");

    const readiness = await buildProductReadiness({
      config: baseConfig,
      db: database.db
    });

    assert.equal(readiness.status, "local_demo_ready");
    assert.equal(readiness.metrics.proofReadyRunId, "run-ready");
    assert.equal(readiness.metrics.mockReceiptCount, 3);
    assert.ok(
      readiness.blockers.some((blocker) =>
        blocker.includes("No completed workflow run has non-mock payment receipts")
      )
    );
  });

  async function seedCompleteMockRun(runId: string) {
    const now = new Date("2026-05-21T00:00:00.000Z");
    await database.db.insert(workflowRuns).values({
      id: runId,
      targetType: "token",
      targetAddress: "So11111111111111111111111111111111111111112",
      triggerType: "api",
      requester: "test",
      status: "completed",
      startedAt: now,
      completedAt: now,
      totalCost: 0.12,
      error: null
    });

    await database.db.insert(toolDiscoveries).values({
      id: "discovery-1",
      runId,
      provider: "sap",
      capability: "ai:risk-classification",
      selectedTool: "tool-1",
      discoveryPayload: { mock: true },
      createdAt: now
    });

    for (const [index, serviceName] of [
      "web_search",
      "entity_enrichment",
      "ai_classification"
    ].entries()) {
      await database.db.insert(paymentReceipts).values({
        id: `receipt-${index}`,
        runId,
        serviceName,
        facilitator: "mock://ace-x402-facilitator",
        txSignature: null,
        receiptPayload: { mock: true, serviceName },
        status: "mocked",
        createdAt: now
      });

      await database.db.insert(aceServiceCalls).values({
        id: `call-${index}`,
        runId,
        serviceName,
        inputSummary: serviceName,
        outputSummary: "mock output",
        reasonForCall: "Deterministic test reason",
        paymentStatus: "mocked",
        cost: 0.04,
        receiptId: `receipt-${index}`,
        createdAt: now
      });

      await database.db.insert(spendingEvents).values({
        id: `spend-${index}`,
        runId,
        serviceName,
        reason: "Deterministic test reason",
        amount: 0.04,
        currency: "USDC",
        paymentStatus: "mocked",
        facilitator: "mock://ace-x402-facilitator",
        receiptPayload: { mock: true, serviceName },
        receiptTimestamp: now,
        createdAt: now
      });
    }

    await database.db.insert(sentinelChecks).values({
      id: "sentinel-1",
      runId,
      sentinelAgentId: "sentinel-mock",
      checkType: "risk_screen",
      status: "mocked",
      requestSummary: "test",
      resultSummary: "mock sentinel result",
      proofPayload: { mock: true },
      createdAt: now
    });

    await database.db.insert(reports).values({
      id: "report-1",
      runId,
      targetType: "token",
      targetAddress: "So11111111111111111111111111111111111111112",
      score: 64,
      verdict: "monitor",
      jsonReport: { runId, mock: true },
      markdownReport: "# Test report",
      createdAt: now
    });
  }
});
