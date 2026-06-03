import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateReport } from "./reportGenerator";
import type { ReportGenerationInput } from "./reportTypes";

describe("ReportGenerator", () => {
  it("includes x402 payment receipts", () => {
    const report = generateReport(reportInput());
    const receipts = report.jsonReport.receipts;

    assert.ok(Array.isArray(receipts));
    assert.equal(receipts.length, 1);
    assert.match(report.markdownReport, /x402 payment receipts/i);
    assert.match(report.markdownReport, /mock:\/\/ace-x402-facilitator/);
  });

  it("includes reasons for tool buying", () => {
    const report = generateReport(reportInput());
    const reasons = report.jsonReport.paidToolReasons;

    assert.ok(Array.isArray(reasons));
    const firstReason = reasons[0] as { reasonForCall?: unknown } | undefined;
    assert.equal(
      firstReason?.reasonForCall,
      "AI classification was purchased because risk signals exceeded threshold."
    );
    assert.match(report.markdownReport, /AI classification was purchased/);
  });

  it("includes integration source proof for Synapse RPC", () => {
    const report = generateReport(reportInput());
    const summary = report.jsonReport.integrationSourceSummary as {
      synapseRpc?: { modes?: unknown; allReal?: unknown; allSuccessful?: unknown };
    };
    const sections = report.jsonReport.sections as {
      onChainFindings?: {
        sourceProof?: {
          tokenSupply?: { mode?: unknown; source?: unknown; mock?: unknown };
        };
      };
    };

    assert.deepEqual(summary.synapseRpc?.modes, ["mock"]);
    assert.equal(summary.synapseRpc?.allReal, false);
    assert.equal(summary.synapseRpc?.allSuccessful, true);
    assert.equal(sections.onChainFindings?.sourceProof?.tokenSupply?.mode, "mock");
    assert.equal(
      sections.onChainFindings?.sourceProof?.tokenSupply?.source,
      "synapse_rpc"
    );
    assert.equal(sections.onChainFindings?.sourceProof?.tokenSupply?.mock, true);
  });
});

function reportInput(): ReportGenerationInput {
  return {
    runId: "run-1",
    workflowInput: {
      targetType: "token",
      targetAddress: "So11111111111111111111111111111111111111112",
      triggerType: "api",
      requester: "test"
    },
    onChainEvidence: {
      targetType: "token",
      accountInfo: {
        mode: "mock",
        source: "synapse_rpc",
        fetchedAt: "2026-05-18T00:00:00.000Z",
        rawResponse: { mock: true },
        data: {
          address: "So11111111111111111111111111111111111111112",
          executable: false,
          lamports: 1000,
          ownerProgram: "Tokenkeg1111111111111111111111111111111111",
          rentEpoch: null,
          dataLength: 165
        }
      },
      metadata: {
        mode: "mock",
        source: "synapse_rpc",
        fetchedAt: "2026-05-18T00:00:00.000Z",
        rawResponse: { mock: true },
        data: {
          mintAddress: "So11111111111111111111111111111111111111112",
          name: "Mock Token",
          symbol: "MOCK",
          uri: "https://example.invalid/token.json",
          decimals: 9,
          mintAuthority: null,
          freezeAuthority: null,
          updateAuthority: null,
          metadataAddress: null
        }
      },
      supply: {
        mode: "mock",
        source: "synapse_rpc",
        fetchedAt: "2026-05-18T00:00:00.000Z",
        rawResponse: { mock: true },
        data: {
          mintAddress: "So11111111111111111111111111111111111111112",
          amount: "1000",
          decimals: 9,
          uiAmount: 0.000001,
          uiAmountString: "0.000001",
          slot: 1
        }
      },
      topHolders: {
        mode: "mock",
        source: "synapse_rpc",
        fetchedAt: "2026-05-18T00:00:00.000Z",
        rawResponse: { mock: true },
        data: []
      },
      recentTransfers: {
        mode: "mock",
        source: "synapse_rpc",
        fetchedAt: "2026-05-18T00:00:00.000Z",
        rawResponse: { mock: true },
        data: []
      }
    },
    sapTools: [
      {
        mode: "mock",
        toolId: "tool-1",
        name: "Ace AI Classification",
        capability: "ai:risk-classification",
        protocol: "x402",
        endpoint: "mock://sap/tool-1",
        pricing: {
          model: "x402",
          amountUsdc: 0.05
        },
        reputation: {
          score: 90,
          uptimeBps: 9900,
          latencyMs: 100,
          calls: 100
        },
        metadata: {
          mock: true
        },
        discoveredAt: "2026-05-18T00:00:00.000Z"
      }
    ],
    selectedTools: [
      {
        serviceName: "ai_classification",
        reasonForCall:
          "AI classification was purchased because risk signals exceeded threshold.",
        estimatedCost: 0.05,
        inputPayload: {
          targetType: "token",
          targetAddress: "So11111111111111111111111111111111111111112",
          reasonForCall:
            "AI classification was purchased because risk signals exceeded threshold.",
          evidence: {}
        }
      }
    ],
    aceCalls: [
      {
        receiptId: "receipt-1",
        serviceResult: {
          mode: "mock",
          serviceName: "ai_classification",
          inputSummary: "token:So111",
          outputSummary: "classifier returned monitor",
          cost: 0.05,
          paymentStatus: "mocked",
          facilitator: "mock://ace-x402-facilitator",
          txSignature: null,
          mockReceiptId: "receipt-1",
          receiptPayload: {
            receiptId: "receipt-1",
            createdAt: "2026-05-18T00:00:00.000Z",
            reasonForCall:
              "AI classification was purchased because risk signals exceeded threshold."
          },
          rawResponse: {
            riskScore: 40
          }
        }
      }
    ],
    sentinel: {
      mode: "mock",
      sentinelAgentId: "sentinel",
      targetType: "token",
      targetAddress: "So11111111111111111111111111111111111111112",
      checkType: "risk_screen",
      status: "mocked",
      confidence: 0.9,
      riskFlags: [],
      resultSummary: "sentinel ok",
      proofPayload: {
        mock: true
      },
      rawResponse: {
        mock: true
      },
      checkedAt: "2026-05-18T00:00:00.000Z"
    },
    risk: {
      score: 72,
      verdict: "monitor",
      reasons: ["test reason"],
      signals: {
        aiClassificationRisk: 40
      },
      confidence: 0.8
    },
    totalCost: 0.05,
    generatedAt: new Date("2026-05-18T00:00:00.000Z")
  };
}
