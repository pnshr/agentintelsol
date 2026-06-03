import type { AceServiceCallResult } from "../ace/aceTypes";
import type { JsonRecord, JsonValue } from "../types/json";
import type { OnChainEvidence } from "../workflow/workflowTypes";
import type {
  RiskComponent,
  RiskEngineInput,
  RiskEngineResult,
  RiskVerdict
} from "./riskTypes";

export class RiskEngine {
  public evaluate(input: RiskEngineInput): RiskEngineResult {
    if (input.targetType === "token" && input.onChainEvidence.targetType === "token") {
      return evaluateTokenRisk(input);
    }

    if (
      input.targetType === "wallet" &&
      input.onChainEvidence.targetType === "wallet"
    ) {
      return evaluateWalletRisk(input);
    }

    return {
      score: 50,
      verdict: "unknown",
      reasons: ["Target type and evidence type did not match."],
      signals: {
        mismatch: true
      },
      confidence: 0.2
    };
  }
}

export function evaluateRisk(input: RiskEngineInput): RiskEngineResult {
  return new RiskEngine().evaluate(input);
}

function evaluateTokenRisk(input: RiskEngineInput): RiskEngineResult {
  const evidence = input.onChainEvidence;

  if (evidence.targetType !== "token") {
    throw new Error("Token risk evaluation requires token evidence");
  }

  const topHolderPercentage = evidence.topHolders.data[0]?.percentage ?? 0;
  const holderConcentrationRisk = clampRisk(
    topHolderPercentage >= 50
      ? 95
      : topHolderPercentage >= 30
        ? 75
        : topHolderPercentage >= 20
          ? 55
          : topHolderPercentage >= 10
            ? 30
            : 12
  );
  const mintAuthorityRisk = evidence.metadata.data.mintAuthority ? 85 : 8;
  const freezeAuthorityRisk = evidence.metadata.data.freezeAuthority ? 90 : 6;
  const transferAmounts = evidence.recentTransfers.data
    .map((transfer) => transfer.amount ?? 0)
    .filter((amount) => amount > 0);
  const transferAnomalyRisk = calculateTransferAnomalyRisk(transferAmounts);
  const metadataRisk = calculateTokenMetadataRisk(evidence);
  const externalFootprintRisk = calculateExternalFootprintRisk(input.aceCalls);
  const aiClassificationRisk = calculateAiClassificationRisk(input.aceCalls);
  const sentinelRisk = calculateSentinelRisk(input.sentinel.riskFlags.length);

  const components: RiskComponent[] = [
    {
      name: "holderConcentrationRisk",
      risk: holderConcentrationRisk,
      reason: `Top holder controls ${topHolderPercentage}% of observed supply.`
    },
    {
      name: "mintAuthorityRisk",
      risk: mintAuthorityRisk,
      reason: evidence.metadata.data.mintAuthority
        ? "Mint authority is still present."
        : "Mint authority is absent."
    },
    {
      name: "freezeAuthorityRisk",
      risk: freezeAuthorityRisk,
      reason: evidence.metadata.data.freezeAuthority
        ? "Freeze authority is still present."
        : "Freeze authority is absent."
    },
    {
      name: "transferAnomalyRisk",
      risk: transferAnomalyRisk,
      reason: `${evidence.recentTransfers.data.length} recent transfers were reviewed for cadence and size anomalies.`
    },
    {
      name: "metadataRisk",
      risk: metadataRisk,
      reason: "Metadata completeness and external URI shape were reviewed."
    },
    {
      name: "externalFootprintRisk",
      risk: externalFootprintRisk,
      reason: "Ace web/entity evidence was reviewed for external footprint quality."
    },
    {
      name: "aiClassificationRisk",
      risk: aiClassificationRisk,
      reason: "Ace AI classification output was incorporated as an advisory signal."
    },
    {
      name: "sentinelRisk",
      risk: sentinelRisk,
      reason: `${input.sentinel.riskFlags.length} Sentinel risk flags were returned.`
    }
  ];

  return buildRiskResult(components, {
    holderConcentrationRisk,
    mintAuthorityRisk,
    freezeAuthorityRisk,
    transferAnomalyRisk,
    metadataRisk,
    externalFootprintRisk,
    aiClassificationRisk,
    sentinelRisk,
    topHolderPercentage,
    mintAuthorityPresent: Boolean(evidence.metadata.data.mintAuthority),
    freezeAuthorityPresent: Boolean(evidence.metadata.data.freezeAuthority)
  });
}

function evaluateWalletRisk(input: RiskEngineInput): RiskEngineResult {
  const evidence = input.onChainEvidence;

  if (evidence.targetType !== "wallet") {
    throw new Error("Wallet risk evaluation requires wallet evidence");
  }

  const transactions = evidence.transactions.data;
  const recentTransfers = evidence.recentTransfers.data;
  const tokenMints = transactions.flatMap((transaction) => transaction.tokenMints);
  const uniqueTokenMints = new Set(tokenMints);
  const uniquePrograms = new Set(
    transactions.flatMap((transaction) => transaction.programIds)
  );
  const repeatedSignatures = transactions.length - new Set(
    transactions.map((transaction) => transaction.signature)
  ).size;
  const averageFee =
    transactions.reduce((sum, transaction) => sum + transaction.feeLamports, 0) /
    Math.max(1, transactions.length);

  const transactionBehaviorRisk = clampRisk(
    transactions.length > 40 ? 85 : transactions.length > 20 ? 65 : transactions.length > 10 ? 42 : 20
  );
  const repeatedPatternRisk = clampRisk(
    repeatedSignatures > 0
      ? 85
      : hasRepeatedTransferAmounts(recentTransfers)
        ? 70
        : transactions.length > 20 && uniquePrograms.size <= 2
          ? 62
          : 18
  );
  const lowQualityTokenInteractionRisk = clampRisk(
    tokenMints.length === 0
      ? 55
      : uniqueTokenMints.size <= 2 && tokenMints.length > 8
        ? 72
        : uniqueTokenMints.size <= 4
          ? 44
          : 18
  );
  const interactionDiversityScore = clampScore(
    Math.round((uniquePrograms.size * 10 + uniqueTokenMints.size * 7) / 2)
  );
  const botLikeBehaviorRisk = clampRisk(
    transactions.length > 20 && averageFee < 9000
      ? 82
      : transactions.length > 12 && uniquePrograms.size <= 2
        ? 64
        : 22
  );
  const aiClassificationRisk = calculateAiClassificationRisk(input.aceCalls);
  const sentinelRisk = calculateSentinelRisk(input.sentinel.riskFlags.length);

  const components: RiskComponent[] = [
    {
      name: "transactionBehaviorRisk",
      risk: transactionBehaviorRisk,
      reason: `${transactions.length} recent transactions were reviewed for cadence.`
    },
    {
      name: "repeatedPatternRisk",
      risk: repeatedPatternRisk,
      reason: "Repeated signatures, transfer amounts, and narrow program usage were reviewed."
    },
    {
      name: "lowQualityTokenInteractionRisk",
      risk: lowQualityTokenInteractionRisk,
      reason: `${uniqueTokenMints.size} unique token mints were observed.`
    },
    {
      name: "interactionDiversityRisk",
      risk: 100 - interactionDiversityScore,
      reason: `Interaction diversity score is ${interactionDiversityScore}.`
    },
    {
      name: "botLikeBehaviorRisk",
      risk: botLikeBehaviorRisk,
      reason: "Transaction cadence, fee pattern, and program diversity were reviewed."
    },
    {
      name: "aiClassificationRisk",
      risk: aiClassificationRisk,
      reason: "Ace AI classification output was incorporated as an advisory signal."
    },
    {
      name: "sentinelRisk",
      risk: sentinelRisk,
      reason: `${input.sentinel.riskFlags.length} Sentinel risk flags were returned.`
    }
  ];

  return buildRiskResult(components, {
    transactionBehaviorRisk,
    repeatedPatternRisk,
    lowQualityTokenInteractionRisk,
    interactionDiversityScore,
    botLikeBehaviorRisk,
    aiClassificationRisk,
    sentinelRisk,
    transactionCount: transactions.length,
    uniqueTokenMintCount: uniqueTokenMints.size,
    uniqueProgramCount: uniquePrograms.size,
    averageFeeLamports: Math.round(averageFee)
  });
}

function buildRiskResult(
  components: RiskComponent[],
  signals: JsonRecord
): RiskEngineResult {
  const weightedRisk =
    components.reduce((sum, component) => sum + component.risk, 0) /
    Math.max(1, components.length);
  const score = clampScore(100 - weightedRisk);
  const verdict = verdictFromScore(score);
  const reasons = components
    .filter((component) => component.risk >= 50)
    .map((component) => `${component.name}: ${component.reason}`);
  const confidence = clampConfidence(
    0.55 + components.length * 0.035 + reasons.length * 0.015
  );

  return {
    score,
    verdict,
    reasons:
      reasons.length > 0
        ? reasons
        : ["No high-risk explainability signals crossed the review threshold."],
    signals: {
      ...signals,
      weightedRisk: round(weightedRisk),
      components: components.map((component) => ({
        name: component.name,
        risk: component.risk,
        reason: component.reason
      })) as JsonValue
    },
    confidence
  };
}

function calculateTransferAnomalyRisk(amounts: number[]): number {
  if (amounts.length === 0) {
    return 45;
  }

  const max = Math.max(...amounts);
  const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;

  if (max > average * 8) {
    return 78;
  }

  if (amounts.length >= 8 && average > 50_000) {
    return 58;
  }

  return 22;
}

function calculateTokenMetadataRisk(
  evidence: Extract<OnChainEvidence, { targetType: "token" }>
): number {
  const metadata = evidence.metadata.data;
  let risk = 12;

  if (!metadata.name.trim()) {
    risk += 30;
  }

  if (!metadata.symbol.trim()) {
    risk += 20;
  }

  if (!metadata.uri) {
    risk += 28;
  }

  if (metadata.uri?.startsWith("http://")) {
    risk += 18;
  }

  if (metadata.name.toLowerCase().includes("official")) {
    risk += 12;
  }

  return clampRisk(risk);
}

function calculateExternalFootprintRisk(aceCalls: { serviceResult: AceServiceCallResult }[]): number {
  const webCall = aceCalls.find((call) => call.serviceResult.serviceName === "web_search");
  const enrichmentCall = aceCalls.find(
    (call) => call.serviceResult.serviceName === "entity_enrichment"
  );
  let risk = 45;

  if (webCall) {
    const results = asArray(webCall.serviceResult.rawResponse.results);
    risk -= Math.min(25, results.length * 4);

    if (containsRiskKeyword(webCall.serviceResult.rawResponse)) {
      risk += 35;
    }
  }

  if (enrichmentCall) {
    const confidence = asNumber(enrichmentCall.serviceResult.rawResponse.confidence);
    if (confidence !== null) {
      risk += confidence < 0.5 ? 25 : confidence < 0.75 ? 10 : -10;
    }
  }

  return clampRisk(risk);
}

function calculateAiClassificationRisk(aceCalls: { serviceResult: AceServiceCallResult }[]): number {
  const aiCall = aceCalls.find(
    (call) => call.serviceResult.serviceName === "ai_classification"
  );

  if (!aiCall) {
    return 55;
  }

  const explicitRisk = asNumber(aiCall.serviceResult.rawResponse.riskScore);
  if (explicitRisk !== null) {
    return clampRisk(explicitRisk);
  }

  const text = JSON.stringify(aiCall.serviceResult.rawResponse).toLowerCase();
  if (text.includes("avoid") || text.includes("high_risk") || text.includes("scam")) {
    return 78;
  }

  if (text.includes("monitor") || text.includes("review")) {
    return 42;
  }

  return 25;
}

function calculateSentinelRisk(flagCount: number): number {
  return clampRisk(flagCount === 0 ? 10 : 30 + flagCount * 18);
}

function hasRepeatedTransferAmounts(
  transfers: { amount: number | null }[]
): boolean {
  const amounts = transfers
    .map((transfer) => transfer.amount)
    .filter((amount): amount is number => typeof amount === "number");
  return amounts.length - new Set(amounts).size >= 3;
}

function verdictFromScore(score: number): RiskVerdict {
  if (score >= 80) {
    return "safe";
  }

  if (score >= 60) {
    return "monitor";
  }

  if (score >= 40) {
    return "high_risk";
  }

  return "avoid";
}

function containsRiskKeyword(value: unknown): boolean {
  const text = JSON.stringify(value).toLowerCase();
  return ["scam", "impersonation", "blacklist", "phishing", "rug"].some((keyword) =>
    text.includes(keyword)
  );
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampRisk(value: number): number {
  return clampScore(Math.round(value));
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, round(value)));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
