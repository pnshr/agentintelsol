import type { JsonRecord, JsonValue } from "../types/json";
import type {
  GeneratedReport,
  ReportGenerationInput
} from "./reportTypes";

export class ReportGenerator {
  public generate(input: ReportGenerationInput): GeneratedReport {
    const generatedAt = input.generatedAt ?? new Date();
    const paidServices = input.aceCalls.map(({ serviceResult, receiptId }) => ({
      serviceName: serviceResult.serviceName,
      inputSummary: serviceResult.inputSummary,
      outputSummary: serviceResult.outputSummary,
      cost: serviceResult.cost,
      paymentStatus: serviceResult.paymentStatus,
      receiptId,
      rawResponse: toJson(serviceResult.rawResponse)
    }));
    const receipts = input.aceCalls.map(({ serviceResult, receiptId }) => ({
      receiptId,
      serviceName: serviceResult.serviceName,
      cost: serviceResult.cost,
      status: serviceResult.paymentStatus,
      facilitator: serviceResult.facilitator,
      txSignature: serviceResult.txSignature,
      mockReceiptId: serviceResult.mockReceiptId,
      receiptPayload: toJson(serviceResult.receiptPayload)
    }));
    const toolBuyingReasons = input.selectedTools.map((tool) => ({
      serviceName: tool.serviceName,
      reasonForCall: tool.reasonForCall,
      estimatedCost: tool.estimatedCost,
      inputPayload: toJson(tool.inputPayload)
    }));

    const jsonReport: JsonRecord = {
      runId: input.runId,
      targetAddress: input.workflowInput.targetAddress,
      targetType: input.workflowInput.targetType,
      integrationSourceSummary: buildIntegrationSourceSummary(input),
      trigger: {
        triggerType: input.workflowInput.triggerType,
        requester: input.workflowInput.requester ?? null
      },
      executiveSummary: buildExecutiveSummary(input),
      sections: {
        target: {
          targetType: input.workflowInput.targetType,
          targetAddress: input.workflowInput.targetAddress
        },
        onChainFindings: buildOnChainFindings(input.onChainEvidence),
        offChainAceFindings: {
          paidServices,
          toolBuyingReasons
        },
        sentinelResult: {
          status: input.sentinel.status,
          confidence: input.sentinel.confidence,
          riskFlags: input.sentinel.riskFlags,
          resultSummary: input.sentinel.resultSummary,
          proofPayload: input.sentinel.proofPayload
        },
        riskScore: {
          score: input.risk.score,
          verdict: input.risk.verdict,
          confidence: input.risk.confidence,
          reasons: input.risk.reasons,
          signals: input.risk.signals
        },
        finalVerdict: {
          verdict: input.risk.verdict,
          recommendation: recommendationForVerdict(input.risk.verdict)
        },
        toolDiscoveryLog: toJson(input.sapTools.map((tool) => ({
          toolId: tool.toolId,
          name: tool.name,
          capability: tool.capability,
          protocol: tool.protocol,
          endpoint: tool.endpoint,
          pricing: tool.pricing,
          reputation: tool.reputation,
          mode: tool.mode,
          discoveredAt: tool.discoveredAt
        }))),
        paidServicesUsed: toJson(paidServices),
        x402PaymentReceipts: toJson(receipts),
        antiWashLegitimacyNotes: [
          "Workflow ran through SpendingPolicy before each paid call.",
          "Every paid service has a non-empty reason_for_call.",
          "Every payment receipt is attached to a workflow run.",
          "Spending events enforce per-run, daily, tool-count, repeated-target, and self-payment limits."
        ],
        timestamp: generatedAt.toISOString()
      },
      paidToolReasons: toolBuyingReasons,
      receipts,
      totalCost: input.totalCost,
      generatedAt: generatedAt.toISOString(),
      mockNotice:
        "Mock adapters are clearly labeled. This report does not claim real SAP/Ace/Synapse/Sentinel usage unless real adapters are implemented and mock modes are disabled."
    };

    return {
      jsonReport,
      markdownReport: buildMarkdownReport(jsonReport),
      score: input.risk.score,
      verdict: input.risk.verdict
    };
  }
}

export function generateReport(input: ReportGenerationInput): GeneratedReport {
  return new ReportGenerator().generate(input);
}

function buildExecutiveSummary(input: ReportGenerationInput): JsonRecord {
  return {
    target: input.workflowInput.targetAddress,
    targetType: input.workflowInput.targetType,
    verdict: input.risk.verdict,
    score: input.risk.score,
    confidence: input.risk.confidence,
    totalCost: input.totalCost,
    summary: `AgentIntel scored this ${input.workflowInput.targetType} as ${input.risk.verdict} with score ${input.risk.score}.`
  };
}

function buildOnChainFindings(
  evidence: ReportGenerationInput["onChainEvidence"]
): JsonRecord {
  const sourceProof = buildOnChainSourceProof(evidence);

  if (evidence.targetType === "token") {
    return {
      sourceProof,
      tokenMetadata: toJson(evidence.metadata.data),
      tokenSupply: toJson(evidence.supply.data),
      topHolderCount: evidence.topHolders.data.length,
      topHolderPercentage: evidence.topHolders.data[0]?.percentage ?? null,
      recentTransferCount: evidence.recentTransfers.data.length,
      accountInfo: toJson(evidence.accountInfo.data)
    };
  }

  return {
    sourceProof,
    accountInfo: toJson(evidence.accountInfo.data),
    transactionCount: evidence.transactions.data.length,
    recentTransferCount: evidence.recentTransfers.data.length,
    uniqueProgramCount: new Set(
      evidence.transactions.data.flatMap((transaction) => transaction.programIds)
    ).size,
    uniqueTokenMintCount: new Set(
      evidence.transactions.data.flatMap((transaction) => transaction.tokenMints)
    ).size
  };
}

function buildIntegrationSourceSummary(input: ReportGenerationInput): JsonRecord {
  const synapseProofs = Object.values(buildOnChainSourceProof(input.onChainEvidence))
    .filter((value): value is JsonRecord => Boolean(value) && typeof value === "object")
  const synapseModes = synapseProofs.map((value) => String(value.mode));
  const synapseErrors = synapseProofs
    .filter((value) => value.successful === false)
    .map((value) => ({
      method: value.method ?? null,
      error: value.error ?? null
    }));

  return {
    synapseRpc: {
      modes: Array.from(new Set(synapseModes)),
      allReal: synapseModes.length > 0 && synapseModes.every((mode) => mode === "real"),
      allSuccessful: synapseErrors.length === 0,
      errors: synapseErrors,
      note:
        "Mode is derived from the Synapse RPC adapter envelope for each on-chain data fetch."
    },
    sap: {
      modes: Array.from(new Set(input.sapTools.map((tool) => tool.mode))),
      note: "SAP mode is derived from discovered tool records."
    },
    aceX402: {
      modes: Array.from(
        new Set(input.aceCalls.map((call) => call.serviceResult.mode))
      ),
      paymentStatuses: Array.from(
        new Set(input.aceCalls.map((call) => call.serviceResult.paymentStatus))
      ),
      note: "Ace/x402 mode is derived from paid service call results and receipt status."
    },
    sentinel: {
      mode: input.sentinel.mode,
      status: input.sentinel.status
    }
  };
}

function buildOnChainSourceProof(
  evidence: ReportGenerationInput["onChainEvidence"]
): JsonRecord {
  const common: JsonRecord = {
    accountInfo: envelopeProof(evidence.accountInfo),
    recentTransfers: envelopeProof(evidence.recentTransfers)
  };

  if (evidence.targetType === "token") {
    return {
      ...common,
      tokenMetadata: envelopeProof(evidence.metadata),
      tokenSupply: envelopeProof(evidence.supply),
      topHolders: envelopeProof(evidence.topHolders)
    };
  }

  return {
    ...common,
    walletTransactions: envelopeProof(evidence.transactions)
  };
}

function envelopeProof(envelope: {
  mode: string;
  source: string;
  fetchedAt: string;
  rawResponse: JsonRecord;
}): JsonRecord {
  const rawResult = envelope.rawResponse.result;
  const nestedError =
    rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)
      ? (rawResult as JsonRecord).error
      : null;
  const rawError = envelope.rawResponse.error ?? nestedError;

  return {
    mode: envelope.mode,
    source: envelope.source,
    fetchedAt: envelope.fetchedAt,
    method:
      typeof envelope.rawResponse.method === "string"
        ? envelope.rawResponse.method
        : null,
    mock: envelope.rawResponse.mock === true,
    successful: rawError ? false : true,
    error:
      typeof rawError === "string"
        ? rawError
        : rawError
          ? toJson(rawError)
          : null
  };
}

export function buildMarkdownReport(report: JsonRecord): string {
  const sections = report.sections as JsonRecord;
  const riskScore = sections.riskScore as JsonRecord;
  const finalVerdict = sections.finalVerdict as JsonRecord;
  const target = sections.target as JsonRecord;
  const trigger = report.trigger as JsonRecord;
  const paidServices = sections.paidServicesUsed as JsonRecord[];
  const receipts = sections.x402PaymentReceipts as JsonRecord[];
  const toolDiscoveryLog = sections.toolDiscoveryLog as JsonRecord[];
  const reasons = (riskScore.reasons as string[] | undefined) ?? [];
  const buyingReasons = (report.paidToolReasons as JsonRecord[] | undefined) ?? [];
  const antiWashNotes =
    (sections.antiWashLegitimacyNotes as string[] | undefined) ?? [];

  return [
    "# AgentIntel Intelligence Report",
    "",
    "## 1. Executive summary",
    String((report.executiveSummary as JsonRecord).summary),
    "",
    "## 2. Target",
    `- Type: ${String(target.targetType)}`,
    `- Address: ${String(target.targetAddress)}`,
    "",
    "## 3. Trigger",
    `- Trigger type: ${String(trigger.triggerType)}`,
    `- Requester: ${String(trigger.requester ?? "not provided")}`,
    "",
    "## 4. On-chain findings",
    fencedJson(sections.onChainFindings),
    "",
    "## 5. Off-chain/Ace findings",
    ...paidServices.map(
      (service) =>
        `- ${String(service.serviceName)}: ${String(service.outputSummary)} ($${String(service.cost)} USDC)`
    ),
    "",
    "## 6. Sentinel result",
    `- Status: ${String((sections.sentinelResult as JsonRecord).status)}`,
    `- Summary: ${String((sections.sentinelResult as JsonRecord).resultSummary)}`,
    "",
    "## 7. Risk score",
    `- Score: ${String(riskScore.score)}`,
    `- Confidence: ${String(riskScore.confidence)}`,
    ...reasons.map((reason) => `- ${reason}`),
    "",
    "## 8. Final verdict",
    `- Verdict: ${String(finalVerdict.verdict)}`,
    `- Recommendation: ${String(finalVerdict.recommendation)}`,
    "",
    "## 9. Tool discovery log",
    ...toolDiscoveryLog.map(
      (tool) =>
        `- ${String(tool.name)} (${String(tool.capability)}) via ${String(tool.protocol)}`
    ),
    "",
    "## 10. Paid services used",
    ...buyingReasons.map(
      (tool) =>
        `- ${String(tool.serviceName)}: ${String(tool.reasonForCall)}`
    ),
    "",
    "## 11. x402 payment receipts",
    ...receipts.map(
      (receipt) =>
        `- ${String(receipt.serviceName)}: ${String(receipt.status)} ${String(receipt.cost)} USDC via ${String(receipt.facilitator)}`
    ),
    "",
    "## 12. Anti-wash legitimacy notes",
    ...antiWashNotes.map((note) => `- ${note}`),
    "",
    "## 13. Timestamp",
    String(sections.timestamp)
  ].join("\n");
}

function recommendationForVerdict(verdict: string): string {
  if (verdict === "safe") {
    return "Proceed with normal monitoring.";
  }

  if (verdict === "monitor") {
    return "Monitor before acting; review the listed risk signals and receipts.";
  }

  if (verdict === "high_risk") {
    return "Avoid large exposure until the high-risk signals are independently reviewed.";
  }

  if (verdict === "avoid") {
    return "Avoid; risk signals are too strong for autonomous approval.";
  }

  return "Unknown; gather more evidence before taking action.";
}

function fencedJson(value: unknown): string {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

function toJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}
