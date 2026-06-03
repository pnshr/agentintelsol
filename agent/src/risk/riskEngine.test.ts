import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SentinelCheckResult } from "../sentinel/sentinelTypes";
import type {
  AccountInfo,
  RecentTransfer,
  SynapseRpcEnvelope,
  TokenHolder,
  TokenMetadata,
  TokenSupply,
  WalletTransaction
} from "../synapse/synapseTypes";
import type { StoredAceCall, TokenOnChainEvidence, WalletOnChainEvidence } from "../workflow/workflowTypes";
import { evaluateRisk } from "./riskEngine";

describe("RiskEngine", () => {
  it("scores a token high-risk scenario as avoid", () => {
    const result = evaluateRisk({
      targetType: "token",
      targetAddress: "So11111111111111111111111111111111111111112",
      onChainEvidence: highRiskTokenEvidence(),
      aceCalls: [
        aceCall("web_search", { results: [], warning: "scam impersonation reports" }),
        aceCall("entity_enrichment", { confidence: 0.31 }),
        aceCall("ai_classification", { riskScore: 92, verdict: "avoid" })
      ],
      sentinel: sentinel(["metadata_link_review", "holder_distribution_review", "authority_review"])
    });

    assert.equal(result.verdict, "avoid");
    assert.ok(result.score < 40);
    assert.ok(result.reasons.some((reason) => reason.includes("mintAuthorityRisk")));
    assert.equal(result.signals.mintAuthorityPresent, true);
    assert.equal(result.signals.freezeAuthorityPresent, true);
  });

  it("scores a wallet suspicious scenario as high risk or avoid", () => {
    const result = evaluateRisk({
      targetType: "wallet",
      targetAddress: "11111111111111111111111111111111",
      onChainEvidence: suspiciousWalletEvidence(),
      aceCalls: [aceCall("ai_classification", { riskScore: 82, verdict: "high_risk" })],
      sentinel: sentinel(["transaction_cadence_review", "counterparty_overlap_review"])
    });

    assert.ok(result.verdict === "high_risk" || result.verdict === "avoid");
    assert.ok(result.score < 60);
    assert.ok(result.reasons.some((reason) => reason.includes("botLikeBehaviorRisk")));
    assert.equal(result.signals.uniqueTokenMintCount, 1);
  });
});

function envelope<T>(method: string, data: T): SynapseRpcEnvelope<T> {
  return {
    mode: "mock",
    source: "synapse_rpc",
    fetchedAt: "2026-05-18T00:00:00.000Z",
    rawResponse: {
      mock: true,
      method
    },
    data
  };
}

function highRiskTokenEvidence(): TokenOnChainEvidence {
  return {
    targetType: "token",
    accountInfo: envelope<AccountInfo>("getAccountInfo", {
      address: "So11111111111111111111111111111111111111112",
      executable: false,
      lamports: 1000,
      ownerProgram: "Tokenkeg1111111111111111111111111111111111",
      rentEpoch: null,
      dataLength: 165
    }),
    metadata: envelope<TokenMetadata>("getTokenMetadata", {
      mintAddress: "So11111111111111111111111111111111111111112",
      name: "Official Fast Gain",
      symbol: "GAIN",
      uri: null,
      decimals: 9,
      mintAuthority: "MintAuthority111111111111111111111111111111",
      freezeAuthority: "FreezeAuthority11111111111111111111111111",
      updateAuthority: "UpdateAuthority11111111111111111111111111",
      metadataAddress: "Metadata111111111111111111111111111111111"
    }),
    supply: envelope<TokenSupply>("getTokenSupply", {
      mintAddress: "So11111111111111111111111111111111111111112",
      amount: "1000000000000",
      decimals: 9,
      uiAmount: 1000,
      uiAmountString: "1,000",
      slot: 1
    }),
    topHolders: envelope<TokenHolder[]>("getTopHolders", [
      holder(1, 61),
      holder(2, 15),
      holder(3, 8)
    ]),
    recentTransfers: envelope<RecentTransfer[]>(
      "getRecentTransfers",
      Array.from({ length: 10 }, (_, index) => ({
        signature: `sig${index}`,
        slot: index,
        blockTime: "2026-05-18T00:00:00.000Z",
        source: "source",
        destination: "destination",
        mint: "mint",
        amount: index === 9 ? 100000 : 1,
        status: "finalized"
      }))
    )
  };
}

function suspiciousWalletEvidence(): WalletOnChainEvidence {
  return {
    targetType: "wallet",
    accountInfo: envelope<AccountInfo>("getAccountInfo", {
      address: "11111111111111111111111111111111",
      executable: false,
      lamports: 10000,
      ownerProgram: "11111111111111111111111111111111",
      rentEpoch: null,
      dataLength: 0
    }),
    transactions: envelope<WalletTransaction[]>(
      "getWalletTransactions",
      Array.from({ length: 30 }, (_, index) => ({
        signature: `wallet-sig-${index}`,
        slot: index,
        blockTime: "2026-05-18T00:00:00.000Z",
        feeLamports: 5000,
        programIds: ["Program111111111111111111111111111111111"],
        tokenMints: ["LowQualityMint111111111111111111111111111"],
        status: "finalized"
      }))
    ),
    recentTransfers: envelope<RecentTransfer[]>(
      "getRecentTransfers",
      Array.from({ length: 12 }, (_, index) => ({
        signature: `transfer-sig-${index}`,
        slot: index,
        blockTime: "2026-05-18T00:00:00.000Z",
        source: "source",
        destination: "destination",
        mint: "LowQualityMint111111111111111111111111111",
        amount: 100,
        status: "finalized"
      }))
    )
  };
}

function holder(rank: number, percentage: number): TokenHolder {
  return {
    rank,
    owner: `owner-${rank}`,
    tokenAccount: `token-account-${rank}`,
    amount: "100",
    uiAmount: 100,
    percentage
  };
}

function aceCall(
  serviceName: StoredAceCall["serviceResult"]["serviceName"],
  rawResponse: StoredAceCall["serviceResult"]["rawResponse"]
): StoredAceCall {
  return {
    receiptId: `${serviceName}-receipt`,
    serviceResult: {
      mode: "mock",
      serviceName,
      inputSummary: serviceName,
      outputSummary: `${serviceName} output`,
      cost: 0.01,
      paymentStatus: "mocked",
      facilitator: "mock://ace",
      txSignature: null,
      mockReceiptId: `${serviceName}-receipt`,
      receiptPayload: {
        createdAt: "2026-05-18T00:00:00.000Z",
        reasonForCall: "test reason"
      },
      rawResponse
    }
  };
}

function sentinel(riskFlags: string[]): SentinelCheckResult {
  return {
    mode: "mock",
    sentinelAgentId: "sentinel",
    targetType: "token",
    targetAddress: "target",
    checkType: "risk_screen",
    status: "mocked",
    confidence: 0.9,
    riskFlags,
    resultSummary: "sentinel result",
    proofPayload: {
      mock: true
    },
    rawResponse: {
      mock: true
    },
    checkedAt: "2026-05-18T00:00:00.000Z"
  };
}
