import type { AppConfig } from "../config/env";
import type { JsonRecord } from "../types/json";
import {
  mockId,
  mockSolanaSignature,
  nowIso,
  numberFromHash
} from "../utils/mockData";
import {
  createSigner,
  decodeXPaymentResponse,
  wrapFetchWithPayment,
  type PaymentRequirementsSelector
} from "x402-fetch";
import type {
  AceAIClassificationInput,
  AceClientConfig,
  AceEntityEnrichmentInput,
  AcePreparedOrder,
  AceServiceCallResult,
  AceServiceName,
  AceWebSearchInput
} from "./aceTypes";

export class AceX402Client {
  private readonly config: AceClientConfig;
  private readonly runtimeOrderIds: Partial<Record<AceServiceName, string>> = {};

  public constructor(
    config: Pick<
      AppConfig,
      | "ACE_API_KEY"
      | "ACE_ACCOUNT_ID"
      | "ACE_SERVICE_BASE_URL"
      | "ACE_PLATFORM_BASE_URL"
      | "ACE_PLATFORM_TOKEN"
      | "ACE_X402_FACILITATOR_URL"
      | "ACE_X402_PRIVATE_KEY"
      | "ACE_X402_NETWORK"
      | "ACE_X402_MAX_PAYMENT_USDC"
      | "ACE_X402_REQUIRE_PAYMENT"
      | "ACE_X402_AUTO_CREATE_ORDERS"
      | "ACE_X402_ORDER_ID"
      | "ACE_X402_ORDER_ID_WEB_SEARCH"
      | "ACE_X402_ORDER_ID_ENTITY_ENRICHMENT"
      | "ACE_X402_ORDER_ID_AI_CLASSIFICATION"
      | "ACE_X402_ORDER_APPLICATION_ID_WEB_SEARCH"
      | "ACE_X402_ORDER_APPLICATION_ID_ENTITY_ENRICHMENT"
      | "ACE_X402_ORDER_APPLICATION_ID_AI_CLASSIFICATION"
      | "ACE_X402_ORDER_PACKAGE_ID_WEB_SEARCH"
      | "ACE_X402_ORDER_PACKAGE_ID_ENTITY_ENRICHMENT"
      | "ACE_X402_ORDER_PACKAGE_ID_AI_CLASSIFICATION"
      | "ACE_X402_ORDER_AMOUNT_WEB_SEARCH"
      | "ACE_X402_ORDER_AMOUNT_ENTITY_ENRICHMENT"
      | "ACE_X402_ORDER_AMOUNT_AI_CLASSIFICATION"
      | "ACE_MOCK_MODE"
      | "ACE_WEB_SEARCH_PATH"
      | "ACE_ENTITY_ENRICHMENT_PATH"
      | "ACE_AI_CLASSIFICATION_PATH"
      | "ACE_AI_MODEL"
    >
  ) {
    this.config = {
      apiKey: config.ACE_API_KEY,
      accountId: config.ACE_ACCOUNT_ID,
      serviceBaseUrl: config.ACE_SERVICE_BASE_URL,
      platformBaseUrl: config.ACE_PLATFORM_BASE_URL,
      platformToken: config.ACE_PLATFORM_TOKEN,
      facilitatorUrl: config.ACE_X402_FACILITATOR_URL,
      x402PrivateKey: config.ACE_X402_PRIVATE_KEY,
      x402Network: config.ACE_X402_NETWORK,
      x402MaxPaymentUsdc: config.ACE_X402_MAX_PAYMENT_USDC,
      x402RequirePayment: config.ACE_X402_REQUIRE_PAYMENT,
      x402AutoCreateOrders: config.ACE_X402_AUTO_CREATE_ORDERS,
      x402OrderId: config.ACE_X402_ORDER_ID,
      x402OrderIds: {
        web_search: config.ACE_X402_ORDER_ID_WEB_SEARCH,
        entity_enrichment: config.ACE_X402_ORDER_ID_ENTITY_ENRICHMENT,
        ai_classification: config.ACE_X402_ORDER_ID_AI_CLASSIFICATION
      },
      x402OrderApplicationIds: {
        web_search: config.ACE_X402_ORDER_APPLICATION_ID_WEB_SEARCH,
        entity_enrichment: config.ACE_X402_ORDER_APPLICATION_ID_ENTITY_ENRICHMENT,
        ai_classification: config.ACE_X402_ORDER_APPLICATION_ID_AI_CLASSIFICATION
      },
      x402OrderPackageIds: {
        web_search: config.ACE_X402_ORDER_PACKAGE_ID_WEB_SEARCH,
        entity_enrichment: config.ACE_X402_ORDER_PACKAGE_ID_ENTITY_ENRICHMENT,
        ai_classification: config.ACE_X402_ORDER_PACKAGE_ID_AI_CLASSIFICATION
      },
      x402OrderAmounts: {
        web_search: config.ACE_X402_ORDER_AMOUNT_WEB_SEARCH,
        entity_enrichment: config.ACE_X402_ORDER_AMOUNT_ENTITY_ENRICHMENT,
        ai_classification: config.ACE_X402_ORDER_AMOUNT_AI_CLASSIFICATION
      },
      servicePaths: {
        web_search: config.ACE_WEB_SEARCH_PATH,
        entity_enrichment: config.ACE_ENTITY_ENRICHMENT_PATH,
        ai_classification: config.ACE_AI_CLASSIFICATION_PATH
      },
      aiModel: config.ACE_AI_MODEL,
      mockMode: config.ACE_MOCK_MODE
    };
  }

  public async prepareOrdersForServices(
    serviceNames: AceServiceName[]
  ): Promise<AcePreparedOrder[]> {
    const uniqueServiceNames = Array.from(new Set(serviceNames));

    if (this.config.mockMode || uniqueServiceNames.length === 0) {
      return [];
    }

    if (!this.config.x402AutoCreateOrders) {
      return uniqueServiceNames
        .map((serviceName) => ({
          serviceName,
          orderId: this.getOrderId(serviceName),
          created: false,
          source: "configured" as const
        }))
        .filter((order) => order.orderId.trim().length > 0);
    }

    const preparedOrders: AcePreparedOrder[] = [];

    for (const serviceName of uniqueServiceNames) {
      const existingRuntimeOrderId = this.runtimeOrderIds[serviceName];

      if (existingRuntimeOrderId) {
        preparedOrders.push({
          serviceName,
          orderId: existingRuntimeOrderId,
          created: false,
          source: "created"
        });
        continue;
      }

      const orderId = await this.createFreshX402Order(serviceName);
      this.runtimeOrderIds[serviceName] = orderId;
      preparedOrders.push({
        serviceName,
        orderId,
        created: true,
        source: "created"
      });
    }

    return preparedOrders;
  }

  public async callWebSearchService(
    input: AceWebSearchInput
  ): Promise<AceServiceCallResult> {
    if (!this.config.mockMode) {
      return this.callRealPaidService(
        "web_search",
        this.config.servicePaths.web_search,
        buildRealWebSearchPayload(input),
        truncate(input.query),
        input.reasonForCall
      );
    }

    const maxResults = input.maxResults ?? 5;
    const rawResults = Array.from({ length: maxResults }, (_, index) => ({
      title: `Mock web result ${index + 1} for ${input.query}`,
      url: `https://search.mock.agentintel.local/result/${mockId("web", { input, index }, 10)}`,
      snippet:
        "Mock search evidence with source, freshness, and relevance fields for downstream workflow logic.",
      freshnessDays: numberFromHash(`${input.query}:freshness:${index}`, 1, 90)
    }));

    return this.buildMockResult({
      serviceName: "web_search",
      inputSummary: truncate(input.query),
      outputSummary: `${rawResults.length} mock web results returned`,
      reasonForCall: input.reasonForCall,
      cost: 0.03,
      rawResponse: {
        query: input.query,
        results: rawResults,
        mock: true
      }
    });
  }

  public async callEntityEnrichmentService(
    input: AceEntityEnrichmentInput
  ): Promise<AceServiceCallResult> {
    if (!this.config.mockMode) {
      return this.callRealPaidService(
        "entity_enrichment",
        this.config.servicePaths.entity_enrichment,
        buildRealEntityEnrichmentPayload(
          input,
          this.config.servicePaths.entity_enrichment,
          this.config.aiModel
        ),
        truncate(input.entity),
        input.reasonForCall
      );
    }

    const confidence = numberFromHash(input.entity, 68, 96) / 100;

    return this.buildMockResult({
      serviceName: "entity_enrichment",
      inputSummary: truncate(input.entity),
      outputSummary: `Mock enrichment returned ${Math.round(confidence * 100)}% confidence`,
      reasonForCall: input.reasonForCall,
      cost: 0.04,
      rawResponse: {
        entity: input.entity,
        detectedProfiles: input.profiles ?? [],
        detectedLinks: input.links ?? [],
        confidence,
        attributes: input.attributes ?? {},
        signals: [
          "profile_presence_checked",
          "domain_context_extracted",
          "entity_aliases_normalized"
        ],
        mock: true
      }
    });
  }

  public async callAIClassificationService(
    input: AceAIClassificationInput
  ): Promise<AceServiceCallResult> {
    if (!this.config.mockMode) {
      return this.callRealPaidService(
        "ai_classification",
        this.config.servicePaths.ai_classification,
        buildRealAIClassificationPayload(input, this.config.aiModel),
        `${input.targetType}:${input.targetAddress}`,
        input.reasonForCall
      );
    }

    const observationCount = Math.max(3, Object.keys(input.evidence).length);

    return this.buildMockResult({
      serviceName: "ai_classification",
      inputSummary: `${input.targetType}:${input.targetAddress}`,
      outputSummary: `Mock classifier produced ${observationCount} evidence observations`,
      reasonForCall: input.reasonForCall,
      cost: 0.05,
      rawResponse: {
        targetType: input.targetType,
        targetAddress: input.targetAddress,
        rubricVersion: input.rubricVersion ?? "mock-rubric-v1",
        observations: [
          "on_chain_evidence_reviewed",
          "external_context_reviewed",
          "classification_requires_orchestrator_policy"
        ],
        evidenceKeys: Object.keys(input.evidence),
        mock: true
      }
    });
  }

  private buildMockResult(input: {
    serviceName: AceServiceName;
    inputSummary: string;
    outputSummary: string;
    reasonForCall: string;
    cost: number;
    rawResponse: AceServiceCallResult["rawResponse"];
  }): AceServiceCallResult {
    const receiptSeed = {
      serviceName: input.serviceName,
      inputSummary: input.inputSummary,
      reasonForCall: input.reasonForCall,
      accountId: this.config.accountId || "mock-account"
    };
    const mockReceiptId = mockId("ace_receipt", receiptSeed, 18);

    return {
      mode: "mock",
      serviceName: input.serviceName,
      inputSummary: input.inputSummary,
      outputSummary: input.outputSummary,
      cost: input.cost,
      paymentStatus: "mocked",
      facilitator:
        this.config.facilitatorUrl || "mock://ace-x402-facilitator",
      txSignature: null,
      mockReceiptId,
      receiptPayload: {
        receiptId: mockReceiptId,
        paymentProtocol: "x402",
        network: "base",
        asset: "USDC",
        amount: input.cost,
        serviceName: input.serviceName,
        reasonForCall: input.reasonForCall,
        mock: true,
        createdAt: nowIso(),
        mockSettlementSignature: mockSolanaSignature(receiptSeed)
      },
      rawResponse: {
        ...input.rawResponse,
        serviceName: input.serviceName,
        mockReceiptId
      }
    };
  }

  private async callRealPaidService(
    serviceName: AceServiceName,
    path: string,
    payload: unknown,
    inputSummary: string,
    reasonForCall: string
  ): Promise<AceServiceCallResult> {
    this.assertRealServiceConfig();

    const endpoint = new URL(path, ensureTrailingSlash(this.config.serviceBaseUrl));
    const x402OrderPayment = await this.payX402OrderIfConfigured(
      serviceName,
      reasonForCall
    );
    const firstResponse = await this.fetchAceService(endpoint, payload);
    const firstPayload = await readJsonResponse(firstResponse);

    if (firstResponse.status === 402) {
      const paidResponse = await this.fetchAceServiceWithX402(endpoint, payload);
      const paidPayload = await readJsonResponse(paidResponse);
      const directPayment = buildX402ProofFromHeaders({
        headers: paidResponse.headers,
        serviceName,
        reasonForCall,
        facilitatorUrl: this.config.facilitatorUrl || endpoint.origin,
        statusCode: paidResponse.status
      });

      if (!paidResponse.ok) {
        throw new Error(
          `Ace ${serviceName} x402-paid request failed with HTTP ${paidResponse.status}: ${JSON.stringify(paidPayload)}`
        );
      }

      if (!directPayment && this.config.x402RequirePayment) {
        throw new Error(
          `Ace ${serviceName} returned 402 and was retried with x402 payment, but no X-PAYMENT-RESPONSE header was returned. Refusing to claim real x402 proof.`
        );
      }

      const payment = directPayment ?? x402OrderPayment;
      return this.buildRealResult({
        serviceName,
        inputSummary,
        reasonForCall,
        responsePayload: paidPayload,
        payment,
        responseStatus: paidResponse.status
      });
    }

    if (!firstResponse.ok) {
      throw new Error(
        `Ace ${serviceName} failed with HTTP ${firstResponse.status}: ${JSON.stringify(firstPayload)}`
      );
    }

    if (this.config.x402RequirePayment && !x402OrderPayment) {
      throw new Error(
        `ACE_X402_REQUIRE_PAYMENT=true but no x402 receipt was produced for ${serviceName}. Configure a per-service ACE_X402_ORDER_ID_* value, enable ACE_X402_AUTO_CREATE_ORDERS with Ace application ids, or use an Ace endpoint that returns an x402 challenge.`
      );
    }

    return this.buildRealResult({
      serviceName,
      inputSummary,
      reasonForCall,
      responsePayload: firstPayload,
      payment: x402OrderPayment,
      responseStatus: firstResponse.status
    });
  }

  private async fetchAceService(endpoint: URL, payload: unknown): Promise<Response> {
    return fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        "X-AgentIntel-Account": this.config.accountId
      },
      body: JSON.stringify(payload)
    });
  }

  private async fetchAceServiceWithX402(
    endpoint: URL,
    payload: unknown
  ): Promise<Response> {
    const fetchWithPayment = await this.buildX402Fetch();
    return fetchWithPayment(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        "X-AgentIntel-Account": this.config.accountId
      },
      body: JSON.stringify(payload)
    });
  }

  private async createFreshX402Order(
    serviceName: AceServiceName
  ): Promise<string> {
    this.assertOrderCreationConfig(serviceName);

    const applicationId =
      this.config.x402OrderApplicationIds[serviceName]?.trim() ?? "";
    const packageId = this.config.x402OrderPackageIds[serviceName]?.trim() ?? "";
    const amount = this.config.x402OrderAmounts[serviceName] ?? 1;
    const endpoint = new URL(
      "/api/v1/orders/",
      ensureTrailingSlash(this.config.platformBaseUrl)
    );
    const payload: JsonRecord = {
      application_id: applicationId,
      amount,
      description:
        `AgentIntel Broker ${SERVICE_LABELS[serviceName]} order ` +
        new Date().toISOString()
    };

    if (packageId) {
      payload.package_id = packageId;
    }

    // TODO(real Ace): keep this aligned with the official Ace Platform SDK once
    // order creation is exposed there. The current implementation mirrors the
    // platform console's POST /api/v1/orders/ flow.
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.getPlatformToken()}`,
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const responsePayload = await readJsonResponse(response);

    if (!response.ok) {
      throw new Error(
        formatAceOrderCreationFailure(
          serviceName,
          response.status,
          responsePayload
        )
      );
    }

    const orderId = extractAceOrderId(responsePayload);

    if (!orderId) {
      throw new Error(
        `Ace order creation for ${serviceName} succeeded with HTTP ${response.status}, but no order id was returned. Response keys: ${Object.keys(responsePayload).join(", ") || "none"}.`
      );
    }

    return orderId;
  }

  private async payX402OrderIfConfigured(
    serviceName: AceServiceName,
    reasonForCall: string
  ): Promise<AceX402PaymentProof | null> {
    const orderId = this.getOrderId(serviceName);
    if (!orderId) {
      return null;
    }

    this.assertX402Config(serviceName);

    const endpoint = new URL(
      `/api/v1/orders/${encodeURIComponent(orderId)}/pay/`,
      ensureTrailingSlash(this.config.platformBaseUrl)
    );
    await this.assertOrderPaymentWithinConfiguredLimit(
      endpoint,
      { pay_way: "X402" },
      serviceName,
      orderId
    );
    const fetchWithPayment = await this.buildX402Fetch();
    const response = await fetchWithPayment(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.getPlatformToken()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ pay_way: "X402" })
    });
    const payload = await readJsonResponse(response);
    const payment = buildX402ProofFromHeaders({
      headers: response.headers,
      serviceName,
      reasonForCall,
      facilitatorUrl:
        this.config.facilitatorUrl || this.config.platformBaseUrl,
      statusCode: response.status,
      extraPayload: {
        orderId,
        platformResponse: sanitizeAceOrderPaymentResponse(payload)
      }
    });

    if (!response.ok) {
      throw new Error(
        formatAceOrderPaymentFailure(serviceName, orderId, response.status, payload)
      );
    }

    if (!payment) {
      throw new Error(
        `Ace x402 order ${orderId} returned HTTP ${response.status} without X-PAYMENT-RESPONSE. Refusing to record a real x402 receipt without facilitator proof.`
      );
    }

    return payment;
  }

  private async assertOrderPaymentWithinConfiguredLimit(
    endpoint: URL,
    body: JsonRecord,
    serviceName: AceServiceName,
    orderId: string
  ): Promise<void> {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.getPlatformToken()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const payload = await readJsonResponse(response);

    if (response.status === 402) {
      const requirement = extractX402RequirementSummary(
        payload,
        this.config.x402Network
      );

      if (!requirement) {
        return;
      }

      const maxAllowedAtomic = usdcToAtomic(this.config.x402MaxPaymentUsdc);

      if (requirement.maxAmountRequiredAtomic > maxAllowedAtomic) {
        throw new Error(
          [
            `Ace x402 payment for ${serviceName} order ${orderId} requires ${formatUsdc(requirement.maxAmountRequiredUsdc)} USDC,`,
            `which exceeds ACE_X402_MAX_PAYMENT_USDC=${formatUsdc(this.config.x402MaxPaymentUsdc)}.`,
            "Choose a smaller Ace package/order, fund the Base USDC payer wallet, or raise ACE_X402_MAX_PAYMENT_USDC only if this spend is intentional.",
            requirement.network ? `Network: ${requirement.network}.` : "",
            requirement.asset ? `Asset: ${requirement.asset}.` : ""
          ]
            .filter(Boolean)
            .join(" ")
        );
      }

      return;
    }

    if (!response.ok) {
      throw new Error(
        formatAceOrderPaymentFailure(serviceName, orderId, response.status, payload)
      );
    }
  }

  private buildRealResult(input: {
    serviceName: AceServiceName;
    inputSummary: string;
    reasonForCall: string;
    responsePayload: JsonRecord;
    payment: AceX402PaymentProof | null;
    responseStatus: number;
  }): AceServiceCallResult {
    const providerCost = extractCost(input.responsePayload);
    const cost = input.payment?.cost ?? providerCost;
    const receiptPayload: JsonRecord = input.payment
      ? {
          ...input.payment.receiptPayload,
          serviceName: input.serviceName,
          reasonForCall: input.reasonForCall,
          serviceResponseStatus: input.responseStatus,
          mock: false
        }
      : {
          mock: false,
          serviceName: input.serviceName,
          reasonForCall: input.reasonForCall,
          paymentProtocol: "none",
          note:
            "Real Ace service call completed without x402 payment proof. Do not claim this receipt as x402 settlement.",
          responseStatus: input.responseStatus,
          createdAt: nowIso()
        };

    return {
      mode: "real",
      serviceName: input.serviceName,
      inputSummary: input.inputSummary,
      outputSummary: summarizeRealResponse(input.responsePayload),
      cost,
      paymentStatus: input.payment ? "settled" : "not_required",
      facilitator:
        input.payment?.facilitator ??
        (this.config.facilitatorUrl || this.config.platformBaseUrl),
      txSignature: input.payment?.txSignature ?? extractTxSignature(input.responsePayload),
      mockReceiptId: null,
      receiptPayload,
      rawResponse: {
        mock: false,
        serviceName: input.serviceName,
        responseStatus: input.responseStatus,
        responsePayload: input.responsePayload,
        x402Payment: input.payment?.receiptPayload ?? null
      }
    };
  }

  private async buildX402Fetch(): Promise<typeof fetch> {
    this.assertX402Config("ai_classification");
    const signer = await createSigner(
      this.config.x402Network,
      this.config.x402PrivateKey
    );
    const maxValue = usdcToAtomic(this.config.x402MaxPaymentUsdc);
    const fetchWithPayment = wrapFetchWithPayment(
      fetch,
      signer,
      maxValue,
      selectExactPaymentForConfiguredNetwork(this.config.x402Network)
    ) as typeof fetch;

    return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const clockOffsetMs = await this.getX402ClockOffsetMs();
      return withDateNowOffset(clockOffsetMs, () =>
        fetchWithPayment(input, init)
      );
    }) as typeof fetch;
  }

  private async getX402ClockOffsetMs(): Promise<number> {
    if (this.config.x402Network !== "base") {
      return 0;
    }

    // x402 v1 builds EIP-3009 validity windows from Date.now().
    // In sandboxed environments the OS clock can drift from Base block time,
    // causing USDC to revert with "authorization is expired". Use Base's
    // latest block timestamp while creating the payment header.
    const response = await fetch("https://mainnet.base.org", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: mockId("base_time", Date.now(), 8),
        method: "eth_getBlockByNumber",
        params: ["latest", false]
      })
    });
    const payload = toJsonRecord(await readJsonResponse(response));
    const result = toJsonRecord(payload.result);
    const timestamp = readString(result, "timestamp");

    if (!timestamp) {
      return 0;
    }

    const blockTimestampMs = Number.parseInt(timestamp, 16) * 1000;

    if (!Number.isFinite(blockTimestampMs)) {
      return 0;
    }

    return blockTimestampMs - Date.now() + 10_000;
  }

  private getOrderId(serviceName: AceServiceName): string {
    return (
      this.runtimeOrderIds[serviceName]?.trim() ||
      this.config.x402OrderIds[serviceName]?.trim() ||
      this.config.x402OrderId.trim()
    );
  }

  private getPlatformToken(): string {
    return this.config.platformToken.trim() || this.config.apiKey.trim();
  }

  private assertRealServiceConfig(): void {
    const missing = [
      ["ACE_API_KEY", this.config.apiKey],
      ["ACE_ACCOUNT_ID", this.config.accountId],
      ["ACE_SERVICE_BASE_URL", this.config.serviceBaseUrl]
    ]
      .filter(([, value]) => !value?.trim())
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `ACE_MOCK_MODE=false requires ${missing.join(", ")} for real Ace service calls. ` +
          "Set ACE_MOCK_MODE=true for local demos or provide real Ace API configuration."
      );
    }
  }

  private assertX402Config(serviceName: AceServiceName): void {
    const missing = [
      ["ACE_PLATFORM_BASE_URL", this.config.platformBaseUrl],
      ["ACE_PLATFORM_TOKEN or ACE_API_KEY", this.getPlatformToken()],
      ["ACE_X402_FACILITATOR_URL", this.config.facilitatorUrl],
      ["ACE_X402_PRIVATE_KEY", this.config.x402PrivateKey],
      ["ACE_X402_NETWORK", this.config.x402Network]
    ]
      .filter(([, value]) => !value?.trim())
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `Real Ace x402 payment for ${serviceName} requires ${missing.join(", ")}. ` +
          "Set ACE_MOCK_MODE=true for local demos or provide real Ace/x402 configuration."
      );
    }
  }

  private assertOrderCreationConfig(serviceName: AceServiceName): void {
    const serviceEnvSuffix = SERVICE_ENV_SUFFIXES[serviceName];
    const missing = [
      ["ACE_PLATFORM_BASE_URL", this.config.platformBaseUrl],
      ["ACE_PLATFORM_TOKEN or ACE_API_KEY", this.getPlatformToken()],
      [
        `ACE_X402_ORDER_APPLICATION_ID_${serviceEnvSuffix}`,
        this.config.x402OrderApplicationIds[serviceName] ?? ""
      ],
      [
        `ACE_X402_ORDER_PACKAGE_ID_${serviceEnvSuffix}`,
        this.config.x402OrderPackageIds[serviceName] ?? ""
      ]
    ]
      .filter(([, value]) => !value?.trim())
      .map(([name]) => name);
    const amount = this.config.x402OrderAmounts[serviceName] ?? 0;

    if (!Number.isFinite(amount) || amount <= 0) {
      missing.push(`ACE_X402_ORDER_AMOUNT_${serviceEnvSuffix}`);
    }

    if (missing.length > 0) {
      throw new Error(
        `ACE_X402_AUTO_CREATE_ORDERS=true requires ${missing.join(", ")} before creating a fresh Ace order for ${serviceName}. ` +
          "Set these account-specific Ace application/package ids from Ace Platform. `application_id` is not the same as `service.id`. " +
          "Run `npm --prefix agent run ace:service-map` to inspect the required service mapping, or disable auto-create and provide fresh ACE_X402_ORDER_ID_* values manually."
      );
    }
  }
}

interface AceX402PaymentProof {
  cost: number;
  facilitator: string;
  txSignature: string | null;
  receiptPayload: JsonRecord;
}

interface X402RequirementSummary {
  network: string | null;
  asset: string | null;
  maxAmountRequiredAtomic: bigint;
  maxAmountRequiredUsdc: number;
}

const SERVICE_LABELS: Record<AceServiceName, string> = {
  web_search: "web search",
  entity_enrichment: "entity enrichment",
  ai_classification: "AI classification"
};

const SERVICE_ENV_SUFFIXES: Record<AceServiceName, string> = {
  web_search: "WEB_SEARCH",
  entity_enrichment: "ENTITY_ENRICHMENT",
  ai_classification: "AI_CLASSIFICATION"
};

function truncate(value: string, maxLength = 160): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 3)}...`;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

async function readJsonResponse(response: Response): Promise<JsonRecord> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return toJsonRecord(JSON.parse(text));
  } catch {
    return {
      rawText: text
    };
  }
}

function buildX402ProofFromHeaders(input: {
  headers: Headers;
  serviceName: AceServiceName;
  reasonForCall: string;
  facilitatorUrl: string;
  statusCode: number;
  extraPayload?: JsonRecord;
}): AceX402PaymentProof | null {
  const paymentHeader =
    input.headers.get("x-payment-response") ??
    input.headers.get("X-PAYMENT-RESPONSE");

  if (!paymentHeader) {
    return null;
  }

  const decoded = toJsonRecord(decodeXPaymentResponse(paymentHeader));
  const cost =
    extractCost(decoded) || extractAceOrderCost(input.extraPayload) || 0;
  const txSignature = extractTxSignature(decoded);

  return {
    cost,
    facilitator: input.facilitatorUrl,
    txSignature,
    receiptPayload: {
      mock: false,
      paymentProtocol: "x402",
      network: readString(decoded, "network") ?? "base",
      asset: readString(decoded, "asset") ?? "USDC",
      amount: cost,
      serviceName: input.serviceName,
      reasonForCall: input.reasonForCall,
      facilitator: input.facilitatorUrl,
      txSignature,
      xPaymentResponse: paymentHeader,
      decodedPaymentResponse: decoded,
      responseStatus: input.statusCode,
      createdAt: nowIso(),
      ...(input.extraPayload ?? {})
    }
  };
}

function extractX402RequirementSummary(
  payload: JsonRecord,
  configuredNetwork: string
): X402RequirementSummary | null {
  const accepts = Array.isArray(payload.accepts) ? payload.accepts : [];

  if (accepts.length === 0) {
    return null;
  }

  const selected = selectExactPaymentForConfiguredNetwork(configuredNetwork)(
    accepts,
    configuredNetwork,
    "exact"
  );
  const record = toJsonRecord(selected);
  const rawAmount =
    readString(record, "maxAmountRequired") ??
    readString(record, "amount") ??
    String(record.maxAmountRequired ?? record.amount ?? "");

  if (!rawAmount.trim()) {
    return null;
  }

  let atomicAmount: bigint;

  try {
    atomicAmount = BigInt(rawAmount);
  } catch {
    const parsed = Number(rawAmount);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    atomicAmount = usdcToAtomic(parsed);
  }

  return {
    network: readString(record, "network"),
    asset: readString(record, "asset"),
    maxAmountRequiredAtomic: atomicAmount,
    maxAmountRequiredUsdc: Number(atomicAmount) / 1_000_000
  };
}

function formatAceOrderPaymentFailure(
  serviceName: AceServiceName,
  orderId: string,
  status: number,
  payload: JsonRecord
): string {
  const details = payload.detail;
  const detailText = Array.isArray(details)
    ? details.map(String).join("; ")
    : typeof details === "string"
      ? details
      : "";
  const traceId = readString(payload, "trace_id");
  const stateMatch = detailText.match(/state\s+([A-Za-z_]+)/i);
  const state = stateMatch?.[1];

  if (detailText.toLowerCase().includes("order is not payable")) {
    return [
      `Ace x402 order for ${serviceName} is no longer payable`,
      `(order ${orderId}${state ? `, state ${state}` : ""}).`,
      "Create a fresh Ace Data Cloud order id for this service and update ACE_X402_ORDER_ID_*.",
      "Do not reuse Finished or Failed orders for new paid workflow runs.",
      traceId ? `Ace trace_id: ${traceId}.` : ""
    ]
      .filter(Boolean)
      .join(" ");
  }

  return `Ace x402 order payment for ${serviceName} failed with HTTP ${status}: ${JSON.stringify(payload)}`;
}

function formatAceOrderCreationFailure(
  serviceName: AceServiceName,
  status: number,
  payload: JsonRecord
): string {
  const details = payload.detail;
  const detailText = Array.isArray(details)
    ? details.map(String).join("; ")
    : typeof details === "string"
      ? details
      : "";
  const traceId = readString(payload, "trace_id");
  const suffix = SERVICE_ENV_SUFFIXES[serviceName];

  if (status === 401 || status === 403) {
    return [
      `Ace order auto-create for ${serviceName} was rejected with HTTP ${status}.`,
      "The configured ACE_PLATFORM_TOKEN/ACE_API_KEY does not have permission to create platform orders.",
      `Use an Ace Platform token with order creation permission, or create a fresh order manually and set ACE_X402_ORDER_ID_${suffix}.`,
      detailText ? `Ace detail: ${detailText}.` : "",
      traceId ? `Ace trace_id: ${traceId}.` : ""
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    `Ace order auto-create for ${serviceName} failed with HTTP ${status}.`,
    detailText ? `Ace detail: ${detailText}.` : "",
    traceId ? `Ace trace_id: ${traceId}.` : "",
    `Response: ${JSON.stringify(payload)}`
  ]
    .filter(Boolean)
    .join(" ");
}

function extractAceOrderId(payload: JsonRecord): string | null {
  return (
    readString(payload, "id") ??
    readString(payload, "order_id") ??
    readString(payload, "orderId") ??
    readString(toJsonRecord(payload.order), "id") ??
    readString(toJsonRecord(payload.data), "id")
  );
}

function selectExactPaymentForConfiguredNetwork(
  configuredNetwork: string
): PaymentRequirementsSelector {
  return (requirements, network, scheme) => {
    const requestedNetworks = Array.isArray(network)
      ? network
      : network
        ? [network]
        : [configuredNetwork];
    const requestedNetworkNames = requestedNetworks.map(String);
    const preferred = requirements.find((requirement) => {
      const record = requirement as unknown as JsonRecord;
      const matchesNetwork =
        typeof record.network === "string" &&
        requestedNetworkNames.includes(record.network);
      const matchesScheme =
        !scheme || record.scheme === scheme || record.scheme === "exact";
      const asset = typeof record.asset === "string" ? record.asset.toLowerCase() : "";
      const isUsdc =
        !asset ||
        asset.includes("usdc") ||
        asset === "0x833589fcd6edb6e08f4c7c32d4f71b54b268aa0e" ||
        asset === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
      return matchesNetwork && matchesScheme && isUsdc;
    });

    if (preferred) {
      return preferred;
    }

    const fallback = requirements[0];
    if (!fallback) {
      throw new Error("x402 payment challenge did not include any payment requirements.");
    }

    return fallback;
  };
}

function usdcToAtomic(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("ACE_X402_MAX_PAYMENT_USDC must be a positive finite number.");
  }

  return BigInt(Math.ceil(value * 1_000_000));
}

function formatUsdc(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6
  });
}

async function withDateNowOffset<T>(
  offsetMs: number,
  callback: () => Promise<T>
): Promise<T> {
  if (!Number.isFinite(offsetMs) || Math.abs(offsetMs) < 1_000) {
    return callback();
  }

  const originalDateNow = Date.now;
  Date.now = () => originalDateNow() + offsetMs;

  try {
    return await callback();
  } finally {
    Date.now = originalDateNow;
  }
}

function buildRealWebSearchPayload(input: AceWebSearchInput): JsonRecord {
  return {
    page: 1,
    type: "search",
    query: input.query,
    number: input.maxResults ?? 5,
    country: "US",
    language: "en"
  };
}

function buildRealEntityEnrichmentPayload(
  input: AceEntityEnrichmentInput,
  path: string,
  model: string
): JsonRecord {
  if (path.toLowerCase().includes("webextrator")) {
    return {
      url: deriveEntityEnrichmentUrl(input),
      expected_type: "general",
      enable_llm: true,
      timeout: 20,
      wait_until: "domcontentloaded",
      block_resources: ["image", "font", "media"]
    };
  }

  return {
    model,
    question:
      "Return concise JSON-style entity enrichment for this Solana intelligence target. " +
      "Focus on legitimacy, social/web footprint, aliases, suspicious impersonation signs, " +
      "and whether the provided links/profiles look consistent. " +
      `Entity: ${input.entity}. Links: ${(input.links ?? []).join(", ") || "none"}. ` +
      `Profiles: ${(input.profiles ?? []).join(", ") || "none"}. ` +
      `Attributes: ${JSON.stringify(input.attributes ?? {})}.`,
    stateful: false
  };
}

function deriveEntityEnrichmentUrl(input: AceEntityEnrichmentInput): string {
  const explicitUrl = [...(input.links ?? []), ...(input.profiles ?? [])].find(
    isHttpUrl
  );

  if (explicitUrl) {
    return explicitUrl;
  }

  const mintAddress = readAttributeString(input.attributes, "mintAddress");
  if (mintAddress) {
    return `https://solscan.io/token/${encodeURIComponent(mintAddress)}`;
  }

  const walletAddress = readAttributeString(input.attributes, "walletAddress");
  if (walletAddress) {
    return `https://solscan.io/account/${encodeURIComponent(walletAddress)}`;
  }

  return `https://www.google.com/search?q=${encodeURIComponent(
    `${input.entity} Solana legitimacy`
  )}`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function readAttributeString(
  attributes: JsonRecord | undefined,
  key: string
): string | null {
  const value = attributes?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function buildRealAIClassificationPayload(
  input: AceAIClassificationInput,
  model: string
): JsonRecord {
  return {
    model,
    messages: [
      {
        role: "system",
        content:
          "You are AgentIntel Broker's constrained risk classifier. Return compact JSON with risk level, key observations, confidence, and recommended verdict. Do not invent facts beyond supplied evidence."
      },
      {
        role: "user",
        content: JSON.stringify({
          targetType: input.targetType,
          targetAddress: input.targetAddress,
          reasonForCall: input.reasonForCall,
          rubricVersion: input.rubricVersion ?? "agentintel-v1",
          evidence: input.evidence
        })
      }
    ],
    temperature: 0.1
  };
}

function summarizeRealResponse(payload: JsonRecord): string {
  const summary =
    payload.summary ??
    payload.outputSummary ??
    payload.message ??
    payload.answer ??
    readOpenAiMessage(payload);

  if (typeof summary === "string") {
    return truncate(summary, 220);
  }

  return `Real Ace response keys: ${Object.keys(payload).join(", ") || "none"}`;
}

function extractCost(payload: JsonRecord): number {
  const cost =
    payload.cost ??
    payload.amount ??
    payload.price ??
    payload.maxAmountRequired ??
    findNestedValue(payload, [
      "maxAmountRequired",
      "amount",
      "amountPaid",
      "value"
    ]);

  if (typeof cost === "number" && Number.isFinite(cost)) {
    return cost > 1000 ? cost / 1_000_000 : cost;
  }

  if (typeof cost === "string") {
    const parsed = Number(cost);
    return Number.isFinite(parsed) ? (parsed > 1000 ? parsed / 1_000_000 : parsed) : 0;
  }

  return 0;
}

function extractAceOrderCost(payload: JsonRecord | undefined): number {
  const platformResponse = toJsonRecord(payload?.platformResponse);
  const metadata = toJsonRecord(platformResponse.metadata);
  const paymentRequirements = metadata.payment_requirements;

  if (Array.isArray(paymentRequirements)) {
    const baseRequirement = paymentRequirements.find((requirement) => {
      const record = toJsonRecord(requirement);
      return readString(record, "network") === "base";
    });
    const requirement = toJsonRecord(baseRequirement ?? paymentRequirements[0]);
    const requiredAmount = readString(requirement, "maxAmountRequired");

    if (requiredAmount) {
      const parsed = Number(requiredAmount);
      if (Number.isFinite(parsed)) {
        return parsed > 1000 ? parsed / 1_000_000 : parsed;
      }
    }
  }

  const price = readNumber(platformResponse, "price");
  return price ?? 0;
}

function extractTxSignature(payload: JsonRecord): string | null {
  const signature =
    payload.transaction ??
    payload.txSignature ??
    payload.transactionSignature ??
    payload.settlementTx ??
    payload.transactionHash ??
    payload.txHash ??
    payload.signature ??
    findNestedValue(payload, [
      "txSignature",
      "transaction",
      "transactionSignature",
      "settlementTx",
      "transactionHash",
      "txHash",
      "signature"
    ]);

  return typeof signature === "string" ? signature : null;
}

function sanitizeAceOrderPaymentResponse(payload: JsonRecord): JsonRecord {
  const metadata = toJsonRecord(payload.metadata);
  const lastSettlement = toJsonRecord(metadata.last_settlement);
  const paymentRequirements = metadata.payment_requirements;

  return {
    id: readString(payload, "id"),
    description: readString(payload, "description"),
    price: readNumber(payload, "price"),
    state: readString(payload, "state"),
    payWay: readString(payload, "pay_way"),
    payId: readString(payload, "pay_id"),
    createdAt: readString(payload, "created_at"),
    updatedAt: readString(payload, "updated_at"),
    metadata: {
      lastSettlement: {
        payer: readString(lastSettlement, "payer"),
        network: readString(lastSettlement, "network"),
        success:
          typeof lastSettlement.success === "boolean"
            ? lastSettlement.success
            : null,
        transaction: readString(lastSettlement, "transaction")
      },
      paymentRequirements: Array.isArray(paymentRequirements)
        ? paymentRequirements.map((requirement) => {
            const record = toJsonRecord(requirement);
            return {
              network: readString(record, "network"),
              asset: readString(record, "asset"),
              payTo: readString(record, "payTo"),
              scheme: readString(record, "scheme"),
              maxAmountRequired: readString(record, "maxAmountRequired")
            };
          })
        : []
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toJsonRecord(value: unknown): JsonRecord {
  return JSON.parse(
    JSON.stringify(value ?? {}, (_key, nested) =>
      typeof nested === "bigint" ? nested.toString() : nested
    )
  ) as JsonRecord;
}

function readString(value: unknown, key: string): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const nested = value[key];
  return typeof nested === "string" && nested.trim().length > 0 ? nested : null;
}

function readNumber(value: unknown, key: string): number | null {
  if (!isRecord(value)) {
    return null;
  }

  const nested = value[key];
  if (typeof nested === "number" && Number.isFinite(nested)) {
    return nested;
  }

  if (typeof nested === "string") {
    const parsed = Number(nested);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readOpenAiMessage(payload: JsonRecord): string | null {
  const choices = payload.choices;
  if (!Array.isArray(choices)) {
    return null;
  }

  const first = choices[0];
  if (!isRecord(first) || !isRecord(first.message)) {
    return null;
  }

  const content = first.message.content;
  return typeof content === "string" ? content : null;
}

function findNestedValue(value: unknown, keys: string[]): unknown {
  if (!isRecord(value)) {
    return null;
  }

  for (const key of keys) {
    if (value[key] !== undefined) {
      return value[key];
    }
  }

  for (const nested of Object.values(value)) {
    if (isRecord(nested)) {
      const found = findNestedValue(nested, keys);
      if (found !== null && found !== undefined) {
        return found;
      }
    }

    if (Array.isArray(nested)) {
      for (const item of nested) {
        const found = findNestedValue(item, keys);
        if (found !== null && found !== undefined) {
          return found;
        }
      }
    }
  }

  return null;
}
