import type {
  OnChainEvidence,
  ToolDecision,
  WorkflowTargetType
} from "./workflowTypes";

export function decideAceTools(input: {
  targetType: WorkflowTargetType;
  targetAddress: string;
  onChainEvidence: OnChainEvidence;
}): ToolDecision[] {
  if (input.targetType === "token" && input.onChainEvidence.targetType === "token") {
    return decideTokenTools(input.targetAddress, input.onChainEvidence);
  }

  if (
    input.targetType === "wallet" &&
    input.onChainEvidence.targetType === "wallet"
  ) {
    return decideWalletTools(input.targetAddress, input.onChainEvidence);
  }

  return [];
}

function decideTokenTools(
  targetAddress: string,
  evidence: Extract<OnChainEvidence, { targetType: "token" }>
): ToolDecision[] {
  const metadata = evidence.metadata.data;
  const decisions: ToolDecision[] = [];
  const metadataHints = [
    metadata.name,
    metadata.symbol,
    metadata.uri ?? "",
    metadata.updateAuthority ?? ""
  ].filter((value) => value.trim().length > 0);

  if (metadataHints.length > 0) {
    decisions.push({
      serviceName: "web_search",
      reasonForCall:
        "Web search was purchased because token metadata contained name, symbol, URI, or authority hints that need external legitimacy checks.",
      inputPayload: {
        query: `${metadata.name} ${metadata.symbol} ${metadata.uri ?? ""} Solana token legitimacy scam impersonation`,
        reasonForCall:
          "Web search was purchased because token metadata contained name, symbol, URI, or authority hints that need external legitimacy checks.",
        maxResults: 5
      },
      estimatedCost: 0.03
    });
  }

  if (metadata.uri || metadata.name) {
    decisions.push({
      serviceName: "entity_enrichment",
      reasonForCall:
        "Entity enrichment was purchased because token metadata exposed an external link or project name that should be normalized before classification.",
      inputPayload: {
        entity: metadata.name || metadata.symbol || targetAddress,
        links: [metadata.uri ?? ""].filter(Boolean),
        attributes: {
          symbol: metadata.symbol,
          mintAddress: targetAddress
        },
        reasonForCall:
          "Entity enrichment was purchased because token metadata exposed an external link or project name that should be normalized before classification."
      },
      estimatedCost: 0.04
    });
  }

  decisions.push({
    serviceName: "ai_classification",
    reasonForCall:
      "AI classification was purchased because the workflow collected structured on-chain and external evidence that requires a constrained risk rubric.",
    inputPayload: {
      targetType: "token",
      targetAddress,
      evidence: {
        metadata: evidence.metadata.data,
        supply: evidence.supply.data,
        topHolders: evidence.topHolders.data,
        recentTransfers: evidence.recentTransfers.data
      },
      reasonForCall:
        "AI classification was purchased because the workflow collected structured on-chain and external evidence that requires a constrained risk rubric.",
      rubricVersion: "agentintel-token-v1"
    },
    estimatedCost: 0.05
  });

  return decisions;
}

function decideWalletTools(
  targetAddress: string,
  evidence: Extract<OnChainEvidence, { targetType: "wallet" }>
): ToolDecision[] {
  const decisions: ToolDecision[] = [];
  const transactions = evidence.transactions.data;
  const uniqueTokenMints = new Set(
    transactions.flatMap((transaction) => transaction.tokenMints)
  );

  if (transactions.length > 8) {
    decisions.push({
      serviceName: "entity_enrichment",
      reasonForCall:
        "Entity enrichment was purchased because the wallet has many recent interactions and counterparties that need behavioral context.",
      inputPayload: {
        entity: targetAddress,
        attributes: {
          transactionCount: transactions.length,
          tokenMintCount: uniqueTokenMints.size
        },
        reasonForCall:
          "Entity enrichment was purchased because the wallet has many recent interactions and counterparties that need behavioral context."
      },
      estimatedCost: 0.04
    });
  }

  if (uniqueTokenMints.size > 0) {
    decisions.push({
      serviceName: "web_search",
      reasonForCall:
        "Web search was purchased because wallet activity included related token/project context that may expose public reputation signals.",
      inputPayload: {
        query: `${targetAddress} Solana wallet reputation tokens ${Array.from(uniqueTokenMints).slice(0, 3).join(" ")}`,
        reasonForCall:
          "Web search was purchased because wallet activity included related token/project context that may expose public reputation signals.",
        maxResults: 5
      },
      estimatedCost: 0.03
    });
  }

  decisions.push({
    serviceName: "ai_classification",
    reasonForCall:
      "AI classification was purchased because wallet transaction behavior requires a constrained reputation rubric.",
    inputPayload: {
      targetType: "wallet",
      targetAddress,
      evidence: {
        accountInfo: evidence.accountInfo.data,
        transactions,
        recentTransfers: evidence.recentTransfers.data
      },
      reasonForCall:
        "AI classification was purchased because wallet transaction behavior requires a constrained reputation rubric.",
      rubricVersion: "agentintel-wallet-v1"
    },
    estimatedCost: 0.05
  });

  return decisions;
}
