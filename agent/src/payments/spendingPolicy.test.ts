import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { AppConfig } from "../config/env";
import { createDatabase, type DatabaseContext } from "../db/client";
import { initializeDatabase } from "../db/initialize";
import { aceServiceCalls, spendingEvents, workflowRuns } from "../db/schema";
import { SpendingPolicyError } from "./paymentTypes";
import { SpendingPolicy } from "./spendingPolicy";

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
  ACE_X402_AUTO_CREATE_ORDERS: false,
  ACE_X402_ORDER_ID: "",
  ACE_X402_ORDER_ID_WEB_SEARCH: "",
  ACE_X402_ORDER_ID_ENTITY_ENRICHMENT: "",
  ACE_X402_ORDER_ID_AI_CLASSIFICATION: "",
  ACE_X402_ORDER_APPLICATION_ID_WEB_SEARCH: "",
  ACE_X402_ORDER_APPLICATION_ID_ENTITY_ENRICHMENT: "",
  ACE_X402_ORDER_APPLICATION_ID_AI_CLASSIFICATION: "",
  ACE_X402_ORDER_PACKAGE_ID_WEB_SEARCH: "",
  ACE_X402_ORDER_PACKAGE_ID_ENTITY_ENRICHMENT: "",
  ACE_X402_ORDER_PACKAGE_ID_AI_CLASSIFICATION: "",
  ACE_X402_ORDER_AMOUNT_WEB_SEARCH: 1,
  ACE_X402_ORDER_AMOUNT_ENTITY_ENRICHMENT: 1,
  ACE_X402_ORDER_AMOUNT_AI_CLASSIFICATION: 1,
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

describe("SpendingPolicy", () => {
  let database: DatabaseContext;

  beforeEach(() => {
    database = createDatabase(baseConfig);
    initializeDatabase(database.sqlite);
  });

  afterEach(() => {
    database.sqlite.close();
  });

  it("blocks paid calls that exceed max spend per run", async () => {
    const runId = await seedRun();
    const policy = createPolicy({ MAX_SPEND_PER_RUN_USDC: 0.05 });

    await seedSpendingEvent(runId, 0.04);

    await assertPolicyError(
      () =>
        policy.checkCanCallPaidService(
          runId,
          "web_search",
          0.02,
          "Need web evidence for metadata links"
        ),
      "MAX_RUN_SPEND_EXCEEDED"
    );
  });

  it("blocks paid calls with missing reason_for_call", async () => {
    const runId = await seedRun();
    const policy = createPolicy();

    await assertPolicyError(
      () => policy.checkCanCallPaidService(runId, "web_search", 0.01, "   "),
      "MISSING_REASON_FOR_CALL"
    );
  });

  it("blocks paid calls after the per-run tool-call limit", async () => {
    const runId = await seedRun();
    const policy = createPolicy({ MAX_TOOL_CALLS_PER_RUN: 1 });

    await database.db.insert(aceServiceCalls).values({
      id: randomUUID(),
      runId,
      serviceName: "web_search",
      inputSummary: "metadata link",
      outputSummary: "one result",
      reasonForCall: "Initial web verification",
      paymentStatus: "mocked",
      cost: 0.01,
      receiptId: null,
      createdAt: new Date()
    });

    await assertPolicyError(
      () =>
        policy.checkCanCallPaidService(
          runId,
          "entity_enrichment",
          0.01,
          "Need entity context after web result"
        ),
      "MAX_TOOL_CALLS_EXCEEDED"
    );
  });

  it("blocks more than three identical targets per day", async () => {
    const policy = createPolicy();

    for (let index = 0; index < 3; index += 1) {
      await seedRun({
        id: `repeat-${index}`,
        targetAddress: "RepeatedTarget111111111111111111111111111111111"
      });
    }

    await assertPolicyError(
      () =>
        policy.checkCanStartRun(
          "token",
          "RepeatedTarget111111111111111111111111111111111"
        ),
      "REPEATED_TARGET_LIMIT_EXCEEDED"
    );
  });

  it("allows and records a normal valid service call", async () => {
    const runId = await seedRun();
    const policy = createPolicy();

    const allowed = await policy.checkCanCallPaidService(
      runId,
      "web_search",
      0.03,
      "Web search was purchased because token metadata contained external links"
    );

    assert.equal(allowed.allowed, true);
    assert.equal(allowed.currentRunSpend, 0);

    const recorded = await policy.recordSpendingEvent(runId, "web_search", 0.03, {
      serviceName: "web_search",
      cost: 0.03,
      status: "mocked",
      facilitator: "mock://ace-x402-facilitator",
      timestamp: new Date().toISOString(),
      mockReceiptId: "mock-receipt-1",
      receiptPayload: {
        reasonForCall:
          "Web search was purchased because token metadata contained external links",
        mock: true
      }
    });

    assert.equal(recorded.runId, runId);
    assert.equal(await policy.calculateRunSpend(runId), 0.03);
    assert.equal(await policy.calculateDailySpend(), 0.03);
    assert.deepEqual(await policy.validateNoWashPattern(runId), {
      allowed: true,
      runId
    });
  });

  it("blocks agent-to-itself payment loops", async () => {
    const runId = await seedRun();
    const policy = createPolicy();

    await assertPolicyError(
      () =>
        policy.checkCanCallPaidService(
          runId,
          "agentintel-self",
          0.01,
          "Attempted self payment should be blocked"
        ),
      "SELF_PAYMENT_LOOP"
    );
  });

  function createPolicy(overrides: Partial<AppConfig> = {}): SpendingPolicy {
    return SpendingPolicy.fromAppConfig(database.db, {
      ...baseConfig,
      ...overrides
    });
  }

  async function seedRun(
    input: {
      id?: string;
      targetType?: "token" | "wallet";
      targetAddress?: string;
    } = {}
  ): Promise<string> {
    const id = input.id ?? randomUUID();

    await database.db.insert(workflowRuns).values({
      id,
      targetType: input.targetType ?? "token",
      targetAddress:
        input.targetAddress ?? "So11111111111111111111111111111111111111112",
      triggerType: "api",
      requester: "test",
      status: "running",
      startedAt: new Date(),
      completedAt: null,
      totalCost: 0,
      error: null
    });

    return id;
  }

  async function seedSpendingEvent(
    runId: string,
    amount: number
  ): Promise<void> {
    const timestamp = new Date();

    await database.db.insert(spendingEvents).values({
      id: randomUUID(),
      runId,
      serviceName: "web_search",
      reason: "Seeded test spend",
      amount,
      currency: "USDC",
      paymentStatus: "mocked",
      facilitator: "mock://ace-x402-facilitator",
      receiptPayload: {
        serviceName: "web_search",
        cost: amount,
        status: "mocked",
        facilitator: "mock://ace-x402-facilitator",
        timestamp: timestamp.toISOString()
      },
      receiptTimestamp: timestamp,
      createdAt: timestamp
    });
  }
});

async function assertPolicyError(
  action: () => Promise<unknown>,
  code: SpendingPolicyError["code"]
): Promise<void> {
  await assert.rejects(
    action,
    (error: unknown) =>
      error instanceof SpendingPolicyError && error.code === code
  );
}
