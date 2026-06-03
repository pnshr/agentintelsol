import type { AppConfig } from "../config/env";
import { createHash } from "node:crypto";
import type { JsonRecord, JsonValue } from "../types/json";
import { mockId, nowIso, numberFromHash } from "../utils/mockData";
import type {
  SentinelCheckContext,
  SentinelCheckResult,
  SentinelGatewayHealth,
  SentinelGatewayPreflightResult,
  SentinelGatewayTool,
  SentinelPaymentChallenge,
  SentinelTargetType
} from "./sentinelTypes";

type SentinelClientConfig = Pick<
  AppConfig,
  | "SENTINEL_AGENT_ID"
  | "SENTINEL_ENDPOINT"
  | "SENTINEL_CHECK_PATH"
  | "SENTINEL_HTTP_METHOD"
  | "SENTINEL_API_KEY"
  | "SENTINEL_MERCHANT_WALLET"
  | "SENTINEL_DEPOSITOR_WALLET"
  | "SENTINEL_TOOL_TOKEN"
  | "SENTINEL_TOOL_WALLET"
  | "SENTINEL_MIN_ESCROW_LAMPORTS"
  | "SENTINEL_MOCK_MODE"
>;

export class SentinelGatewayPaymentError extends Error {
  public readonly challenge: SentinelPaymentChallenge;

  public constructor(message: string, challenge: SentinelPaymentChallenge) {
    super(message);
    this.name = "SentinelGatewayPaymentError";
    this.challenge = challenge;
  }
}

export class SentinelClient {
  private readonly config: SentinelClientConfig;

  public constructor(config: SentinelClientConfig) {
    this.config = config;
  }

  public async callSentinelCheck(
    targetType: SentinelTargetType,
    targetAddress: string,
    context: SentinelCheckContext
  ): Promise<SentinelCheckResult> {
    if (!this.config.SENTINEL_MOCK_MODE) {
      return this.callRealSentinelGateway(targetType, targetAddress, context);
    }

    const sentinelAgentId =
      this.config.SENTINEL_AGENT_ID || mockId("sentinel_agent", "default", 12);
    const confidence = numberFromHash(`${targetType}:${targetAddress}`, 72, 94) / 100;
    const checkType =
      targetType === "token" ? "risk_screen" : "reputation_screen";
    const riskFlags = buildMockRiskFlags(targetType, targetAddress);
    const checkedAt = nowIso();

    return {
      mode: "mock",
      sentinelAgentId,
      targetType,
      targetAddress,
      checkType,
      status: "mocked",
      confidence,
      riskFlags,
      resultSummary: `Mock Sentinel ${checkType} completed with ${riskFlags.length} flags`,
      proofPayload: {
        proofId: mockId("sentinel_proof", {
          sentinelAgentId,
          targetType,
          targetAddress,
          checkedAt
        }),
        runId: context.runId ?? null,
        evidenceKeys: context.evidence ? Object.keys(context.evidence) : [],
        mock: true,
        checkedAt
      },
      rawResponse: {
        mock: true,
        targetType,
        targetAddress,
        contextProvided: Boolean(context.evidence),
        note: "Mock Sentinel response; no Synapse Sentinel network call was made."
      },
      checkedAt
    };
  }

  public async getGatewayPreflight(): Promise<SentinelGatewayPreflightResult> {
    const checkedAt = nowIso();

    if (this.config.SENTINEL_MOCK_MODE) {
      return {
        mode: "mock",
        endpoint: this.config.SENTINEL_ENDPOINT,
        sentinelAgentId: this.config.SENTINEL_AGENT_ID,
        merchantWallet: this.config.SENTINEL_MERCHANT_WALLET,
        depositorWallet: this.config.SENTINEL_DEPOSITOR_WALLET || null,
        tokenTool: this.config.SENTINEL_TOOL_TOKEN,
        walletTool: this.config.SENTINEL_TOOL_WALLET,
        health: null,
        toolCount: 0,
        selectedToolsFound: false,
        paymentChallengeSeen: false,
        paymentChallenge: null,
        checkedAt
      };
    }

    this.assertGatewayConfig({ requireDepositor: false });

    const [health, tools, challenge] = await Promise.all([
      this.fetchGatewayHealth(),
      this.fetchGatewayTools(),
      this.fetchPaymentChallenge(this.config.SENTINEL_TOOL_TOKEN)
    ]);

    const toolNames = new Set(tools.map((tool) => tool.name));

    return {
      mode: "real",
      endpoint: this.config.SENTINEL_ENDPOINT,
      sentinelAgentId: this.config.SENTINEL_AGENT_ID,
      merchantWallet: this.config.SENTINEL_MERCHANT_WALLET,
      depositorWallet: this.config.SENTINEL_DEPOSITOR_WALLET || null,
      tokenTool: this.config.SENTINEL_TOOL_TOKEN,
      walletTool: this.config.SENTINEL_TOOL_WALLET,
      health,
      toolCount: tools.length,
      selectedToolsFound:
        toolNames.has(this.config.SENTINEL_TOOL_TOKEN) &&
        toolNames.has(this.config.SENTINEL_TOOL_WALLET),
      paymentChallengeSeen: challenge?.error === "payment_required",
      paymentChallenge: challenge,
      checkedAt
    };
  }

  private async callRealSentinelGateway(
    targetType: SentinelTargetType,
    targetAddress: string,
    context: SentinelCheckContext
  ): Promise<SentinelCheckResult> {
    this.assertGatewayConfig({ requireDepositor: true });

    // Synapse Sentinel is publicly exposed as a SAP x402 merchant agent:
    //   GET  /tools
    //   POST /tools/:name
    // A funded SAP escrow is required before a tool call can execute. We do not
    // silently downgrade 402 responses to success because that would fake proof.
    const toolName = this.selectToolName(targetType);
    const endpoint = buildSentinelToolEndpoint(
      this.config.SENTINEL_ENDPOINT,
      this.config.SENTINEL_CHECK_PATH,
      toolName
    );
    const checkedAt = nowIso();
    const requestPayload = buildSentinelToolPayload(targetType, targetAddress);
    const gatewayPayload = { input: requestPayload };
    const requestHash = sha256Json(gatewayPayload);
    const response = await fetch(endpoint, {
      method: this.config.SENTINEL_HTTP_METHOD,
      headers: {
        "Content-Type": "application/json",
        "x-sap-depositor": this.config.SENTINEL_DEPOSITOR_WALLET,
        "X-AgentIntel-Sentinel-Agent": this.config.SENTINEL_AGENT_ID,
        ...(context.runId ? { "X-AgentIntel-Run-Id": context.runId } : {})
      },
      body: JSON.stringify(gatewayPayload)
    });
    const payload = await readResponsePayload(response);

    if (response.status === 402) {
      const challenge = parsePaymentChallenge(payload);
      throw new SentinelGatewayPaymentError(
        buildPaymentRequiredMessage(challenge, toolName),
        challenge
      );
    }

    if (!response.ok) {
      throw new Error(
        `Synapse Sentinel gateway call failed with HTTP ${response.status}: ${JSON.stringify(payload)}`
      );
    }

    return this.buildGatewayResult({
      targetType,
      targetAddress,
      toolName,
      endpoint: endpoint.toString(),
      payload,
      requestHash,
      httpStatus: response.status,
      checkedAt
    });
  }

  private async fetchGatewayHealth(): Promise<SentinelGatewayHealth> {
    const response = await fetch(new URL("health", endpointBase(this.config.SENTINEL_ENDPOINT)));
    const payload = await readResponsePayload(response);

    if (!response.ok) {
      throw new Error(
        `Synapse Sentinel health check failed with HTTP ${response.status}: ${JSON.stringify(payload)}`
      );
    }

    return {
      ...(typeof payload.status === "string" ? { status: payload.status } : {}),
      ...(typeof payload.network === "string" ? { network: payload.network } : {}),
      ...(typeof payload.sapNetwork === "string"
        ? { sapNetwork: payload.sapNetwork }
        : {}),
      ...(typeof payload.usdcMint === "string" ? { usdcMint: payload.usdcMint } : {})
    };
  }

  private async fetchGatewayTools(): Promise<SentinelGatewayTool[]> {
    const response = await fetch(new URL("tools", endpointBase(this.config.SENTINEL_ENDPOINT)));
    const payload = await readResponsePayload(response);

    if (!response.ok) {
      throw new Error(
        `Synapse Sentinel tools catalog failed with HTTP ${response.status}: ${JSON.stringify(payload)}`
      );
    }

    const tools: unknown[] = Array.isArray(payload.tools) ? payload.tools : [];
    return tools.filter(isSentinelGatewayTool);
  }

  private async fetchPaymentChallenge(
    toolName: string
  ): Promise<SentinelPaymentChallenge | null> {
    const endpoint = buildSentinelToolEndpoint(
      this.config.SENTINEL_ENDPOINT,
      this.config.SENTINEL_CHECK_PATH,
      toolName
    );
    const response = await fetch(endpoint, {
      method: this.config.SENTINEL_HTTP_METHOD,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        input: { mint: "So11111111111111111111111111111111111111112" }
      })
    });
    const payload = await readResponsePayload(response);

    if (response.status !== 402) {
      return null;
    }

    return parsePaymentChallenge(payload);
  }

  private buildGatewayResult(input: {
    targetType: SentinelTargetType;
    targetAddress: string;
    toolName: string;
    endpoint: string;
    payload: JsonRecord;
    requestHash: string;
    httpStatus: number;
    checkedAt: string;
  }): SentinelCheckResult {
    const responseHash = sha256Json(input.payload);
    const riskFlags = extractRiskFlags(input.payload);
    const status = parseGatewayStatus(input.payload, riskFlags);

    return {
      mode: "real",
      sentinelAgentId: this.config.SENTINEL_AGENT_ID,
      targetType: input.targetType,
      targetAddress: input.targetAddress,
      checkType:
        input.targetType === "token" ? "risk_screen" : "reputation_screen",
      status,
      confidence: parseConfidence(input.payload, riskFlags),
      riskFlags,
      resultSummary: buildGatewaySummary(input.toolName, input.payload, riskFlags),
      proofPayload: {
        mock: false,
        proofType: "synapse-sentinel-sap-x402-gateway",
        sentinelAgentId: this.config.SENTINEL_AGENT_ID,
        merchantWallet: this.config.SENTINEL_MERCHANT_WALLET,
        depositorWallet: this.config.SENTINEL_DEPOSITOR_WALLET,
        toolName: input.toolName,
        endpoint: input.endpoint,
        httpStatus: input.httpStatus,
        checkedAt: input.checkedAt,
        requestHashAlgorithm: "sha256",
        requestHash: input.requestHash,
        responseHashAlgorithm: "sha256",
        responseHash,
        minEscrowDepositLamports: this.config.SENTINEL_MIN_ESCROW_LAMPORTS
      },
      rawResponse: {
        mock: false,
        gatewayMode: "sap-x402",
        payload: input.payload,
        responseHash
      },
      checkedAt: input.checkedAt
    };
  }

  private selectToolName(targetType: SentinelTargetType): string {
    return targetType === "token"
      ? this.config.SENTINEL_TOOL_TOKEN
      : this.config.SENTINEL_TOOL_WALLET;
  }

  private assertGatewayConfig(options: { requireDepositor: boolean }): void {
    const missing = [
      ["SENTINEL_AGENT_ID", this.config.SENTINEL_AGENT_ID],
      ["SENTINEL_ENDPOINT", this.config.SENTINEL_ENDPOINT],
      ["SENTINEL_CHECK_PATH", this.config.SENTINEL_CHECK_PATH],
      ["SENTINEL_MERCHANT_WALLET", this.config.SENTINEL_MERCHANT_WALLET],
      ["SENTINEL_TOOL_TOKEN", this.config.SENTINEL_TOOL_TOKEN],
      ["SENTINEL_TOOL_WALLET", this.config.SENTINEL_TOOL_WALLET],
      ...(options.requireDepositor
        ? [["SENTINEL_DEPOSITOR_WALLET", this.config.SENTINEL_DEPOSITOR_WALLET]]
        : [])
    ]
      .filter(([, value]) => !value?.trim())
      .map(([name]) => name);

    if (missing.length > 0) {
      throw new Error(
        `SENTINEL_MOCK_MODE=false requires ${missing.join(", ")} for the public Synapse Sentinel SAP x402 gateway. ` +
          "Set SENTINEL_MOCK_MODE=true for local demos or configure the gateway and depositor wallet."
      );
    }
  }
}

function buildMockRiskFlags(
  targetType: SentinelTargetType,
  targetAddress: string
): string[] {
  const selector = numberFromHash(`${targetType}:${targetAddress}:flags`, 0, 3);

  if (selector === 0) {
    return [];
  }

  if (targetType === "token") {
    return ["metadata_link_review", "holder_distribution_review"].slice(0, selector);
  }

  return ["transaction_cadence_review", "counterparty_overlap_review"].slice(0, selector);
}

function buildSentinelToolPayload(
  targetType: SentinelTargetType,
  targetAddress: string
): JsonRecord {
  if (targetType === "token") {
    return { mint: targetAddress };
  }

  return {
    wallet: targetAddress,
    showZeroBalance: false
  };
}

function extractRiskFlags(payload: JsonRecord): string[] {
  const flagsSource = payload.riskFlags ?? payload.flags ?? payload.alerts;
  const flags = Array.isArray(flagsSource)
    ? flagsSource.filter((flag): flag is string => typeof flag === "string")
    : [];

  const risksSource: unknown[] = Array.isArray(payload.risks) ? payload.risks : [];
  const risks =
    risksSource.length > 0
      ? risksSource
        .filter((risk): risk is Record<string, unknown> => isRecord(risk))
        .map((risk) => {
          const severity = typeof risk.severity === "string" ? risk.severity : "info";
          const type = typeof risk.type === "string" ? risk.type : "risk";
          return `${severity}:${type}`;
        })
    : [];

  const riskLevel =
    typeof payload.riskLevel === "string" && payload.riskLevel !== "safe"
      ? [`risk_level:${payload.riskLevel}`]
      : [];

  return [...flags, ...risks, ...riskLevel];
}

function parseGatewayStatus(
  payload: JsonRecord,
  riskFlags: string[]
): "passed" | "review" | "failed" | "mocked" {
  const nestedResult = parseNestedGatewayResult(payload);
  if (payload.ok === true && nestedResult?.error !== true) {
    return "passed";
  }

  if (nestedResult?.error === true) {
    return "review";
  }

  if (
    payload.status === "passed" ||
    payload.status === "review" ||
    payload.status === "failed" ||
    payload.status === "mocked"
  ) {
    return payload.status;
  }

  if (payload.riskLevel === "critical" || payload.riskLevel === "high") {
    return "failed";
  }

  if (riskFlags.length > 0 || payload.riskLevel === "medium") {
    return "review";
  }

  return "passed";
}

function parseConfidence(payload: JsonRecord, riskFlags: string[]): number {
  if (typeof payload.confidence === "number" && Number.isFinite(payload.confidence)) {
    return Math.max(0, Math.min(1, payload.confidence));
  }

  return riskFlags.length === 0 ? 0.82 : 0.76;
}

function buildGatewaySummary(
  toolName: string,
  payload: JsonRecord,
  riskFlags: string[]
): string {
  const settlement = isRecord(payload.settlement) ? payload.settlement : null;
  const nestedResult = parseNestedGatewayResult(payload);

  if (payload.ok === true && settlement) {
    const charged =
      typeof settlement.chargedLamports === "number"
        ? `${settlement.chargedLamports} lamports`
        : "the configured SAP x402 price";
    const mode = typeof settlement.mode === "string" ? settlement.mode : "gateway";

    if (nestedResult?.error === true) {
      return `Synapse Sentinel ${toolName} passed SAP x402 payment in ${mode} mode and charged ${charged}, but the underlying tool returned an execution warning.`;
    }

    return `Synapse Sentinel ${toolName} completed through SAP x402 in ${mode} mode and charged ${charged}.`;
  }

  if (typeof payload.resultSummary === "string") {
    return payload.resultSummary;
  }

  if (typeof payload.summary === "string") {
    return payload.summary;
  }

  if (typeof payload.riskLevel === "string") {
    return `Synapse Sentinel ${toolName} completed with risk level ${payload.riskLevel}.`;
  }

  return `Synapse Sentinel ${toolName} completed with ${riskFlags.length} risk flags.`;
}

function parseNestedGatewayResult(payload: JsonRecord): JsonRecord | null {
  if (isRecord(payload.result)) {
    return payload.result;
  }

  if (typeof payload.result !== "string") {
    return null;
  }

  try {
    return toJsonRecord(JSON.parse(payload.result));
  } catch {
    return null;
  }
}

function parsePaymentChallenge(payload: JsonRecord): SentinelPaymentChallenge {
  return {
    ...(typeof payload.error === "string" ? { error: payload.error } : {}),
    ...(typeof payload.protocol === "string" ? { protocol: payload.protocol } : {}),
    ...(typeof payload.tool === "string" ? { tool: payload.tool } : {}),
    ...(typeof payload.pricePerCall === "number"
      ? { pricePerCall: payload.pricePerCall }
      : {}),
    ...(typeof payload.currency === "string" ? { currency: payload.currency } : {}),
    ...(Array.isArray(payload.acceptedTokens)
      ? {
          acceptedTokens: payload.acceptedTokens.filter(
            (token): token is string => typeof token === "string"
          )
        }
      : {}),
    ...(typeof payload.network === "string" ? { network: payload.network } : {}),
    ...(typeof payload.minEscrowDeposit === "number"
      ? { minEscrowDeposit: payload.minEscrowDeposit }
      : {}),
    ...(typeof payload.hint === "string" ? { hint: payload.hint } : {}),
    ...(typeof payload.reason === "string" ? { reason: payload.reason } : {})
  };
}

function buildPaymentRequiredMessage(
  challenge: SentinelPaymentChallenge,
  toolName: string
): string {
  if (challenge.error === "escrow_not_funded") {
    return `Synapse Sentinel gateway is configured, but no funded escrow was found for tool ${toolName}. ${challenge.reason ?? ""}`.trim();
  }

  return `Synapse Sentinel gateway requires SAP x402 payment before tool ${toolName} can execute. ${challenge.hint ?? ""}`.trim();
}

function isSentinelGatewayTool(value: unknown): value is SentinelGatewayTool {
  if (!isRecord(value) || typeof value.name !== "string") {
    return false;
  }

  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildSentinelToolEndpoint(
  baseUrl: string,
  pathTemplate: string,
  toolName: string
): URL {
  const path = pathTemplate.includes(":name")
    ? pathTemplate.replace(":name", encodeURIComponent(toolName))
    : `${pathTemplate.replace(/\/+$/, "")}/${encodeURIComponent(toolName)}`;
  return new URL(path.replace(/^\/+/, ""), endpointBase(baseUrl));
}

function endpointBase(baseUrl: string): URL {
  return new URL(baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

async function readResponsePayload(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  if (!text.trim()) {
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

function sha256Json(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(toJsonValue(value)))
    .digest("hex");
}

function toJsonRecord(value: unknown): JsonRecord {
  const jsonValue = toJsonValue(value);

  if (isJsonRecord(jsonValue)) {
    return jsonValue;
  }

  return { value: jsonValue };
}

function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }

  if (!isRecord(value)) {
    return String(value);
  }

  const output: JsonRecord = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = toJsonValue(nested);
  }
  return output;
}

function isJsonRecord(value: JsonValue): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
