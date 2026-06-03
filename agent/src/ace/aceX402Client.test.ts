import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { AceX402Client } from "./aceX402Client";

const originalFetch = globalThis.fetch;

const baseConfig = {
  ACE_API_KEY: "ace-api-token",
  ACE_ACCOUNT_ID: "ace-account",
  ACE_SERVICE_BASE_URL: "https://api.acedata.cloud",
  ACE_PLATFORM_BASE_URL: "https://platform.acedata.cloud",
  ACE_PLATFORM_TOKEN: "ace-platform-token",
  ACE_X402_FACILITATOR_URL: "https://platform.acedata.cloud",
  ACE_X402_PRIVATE_KEY: "0x0000000000000000000000000000000000000000000000000000000000000001",
  ACE_X402_NETWORK: "base",
  ACE_X402_MAX_PAYMENT_USDC: 1,
  ACE_X402_REQUIRE_PAYMENT: true,
  ACE_X402_AUTO_CREATE_ORDERS: true,
  ACE_X402_ORDER_ID: "",
  ACE_X402_ORDER_ID_WEB_SEARCH: "",
  ACE_X402_ORDER_ID_ENTITY_ENRICHMENT: "",
  ACE_X402_ORDER_ID_AI_CLASSIFICATION: "",
  ACE_X402_ORDER_APPLICATION_ID_WEB_SEARCH: "app-web",
  ACE_X402_ORDER_APPLICATION_ID_ENTITY_ENRICHMENT: "app-entity",
  ACE_X402_ORDER_APPLICATION_ID_AI_CLASSIFICATION: "app-ai",
  ACE_X402_ORDER_PACKAGE_ID_WEB_SEARCH: "pkg-web",
  ACE_X402_ORDER_PACKAGE_ID_ENTITY_ENRICHMENT: "pkg-entity",
  ACE_X402_ORDER_PACKAGE_ID_AI_CLASSIFICATION: "pkg-ai",
  ACE_X402_ORDER_AMOUNT_WEB_SEARCH: 1,
  ACE_X402_ORDER_AMOUNT_ENTITY_ENRICHMENT: 1,
  ACE_X402_ORDER_AMOUNT_AI_CLASSIFICATION: 1,
  ACE_MOCK_MODE: false,
  ACE_WEB_SEARCH_PATH: "/serp/google",
  ACE_ENTITY_ENRICHMENT_PATH: "/webextrator/extract",
  ACE_AI_CLASSIFICATION_PATH: "/openai/chat/completions",
  ACE_AI_MODEL: "gpt-4o-mini"
} satisfies ConstructorParameters<typeof AceX402Client>[0];

describe("AceX402Client order preparation", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("creates one fresh order per distinct selected service", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];

    globalThis.fetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1]
    ) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      calls.push({ url: String(input), body });

      return new Response(JSON.stringify({ id: `order-${calls.length}` }), {
        status: 201,
        headers: { "Content-Type": "application/json" }
      });
    }) as typeof fetch;

    const client = new AceX402Client(baseConfig);
    const prepared = await client.prepareOrdersForServices([
      "ai_classification",
      "ai_classification",
      "web_search"
    ]);

    assert.equal(calls.length, 2);
    assert.deepEqual(
      prepared.map((order) => ({
        serviceName: order.serviceName,
        orderId: order.orderId,
        created: order.created
      })),
      [
        {
          serviceName: "ai_classification",
          orderId: "order-1",
          created: true
        },
        {
          serviceName: "web_search",
          orderId: "order-2",
          created: true
        }
      ]
    );
    assert.equal(calls[0]?.url, "https://platform.acedata.cloud/api/v1/orders/");
    assert.equal(calls[0]?.body.application_id, "app-ai");
    assert.equal(calls[0]?.body.package_id, "pkg-ai");
  });

  it("fails early when auto-create is enabled without an application id", async () => {
    const client = new AceX402Client({
      ...baseConfig,
      ACE_X402_ORDER_APPLICATION_ID_AI_CLASSIFICATION: ""
    });

    await assert.rejects(
      () => client.prepareOrdersForServices(["ai_classification"]),
      /ACE_X402_ORDER_APPLICATION_ID_AI_CLASSIFICATION/
    );
  });
});
