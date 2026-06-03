import { AceX402Client } from "../ace/aceX402Client";
import { loadConfig } from "../config/env";
import { SapClient } from "../sap/sapClient";
import { SentinelClient } from "../sentinel/sentinelClient";
import { SynapseRpcClient } from "../synapse/synapseRpcClient";

async function main(): Promise<void> {
  const config = loadConfig();
  const sap = new SapClient({ config });
  const synapse = new SynapseRpcClient(config);
  const ace = new AceX402Client(config);
  const sentinel = new SentinelClient(config);

  const targetAddress = "So11111111111111111111111111111111111111112";

  const sapRegistration = await sap.registerAgent({
    name: "AgentIntel Broker",
    description: "Autonomous Solana intelligence marketplace agent",
    version: "0.1.0",
    capabilities: [
      "solana:token-intelligence",
      "solana:wallet-intelligence",
      "x402:paid-tool-use",
      "proof:structured-report"
    ],
    protocols: ["sap", "x402", "synapse-rpc"],
    tags: ["demo", "mock"]
  });

  const discoveredTools = await sap.discoverTools({
    capability: "solana:token-intelligence",
    protocol: "x402",
    targetType: "token",
    maxResults: 3
  });

  const tokenMetadata = await synapse.getTokenMetadata(targetAddress);
  const tokenSupply = await synapse.getTokenSupply(targetAddress);
  const topHolders = await synapse.getTopHolders(targetAddress);

  const webSearch = await ace.callWebSearchService({
    query: "Wrapped SOL token legitimacy social metadata",
    reasonForCall:
      "Demo adapter call: web evidence would be purchased when metadata links need validation."
  });

  const entityEnrichment = await ace.callEntityEnrichmentService({
    entity: tokenMetadata.data.symbol,
    links: [tokenMetadata.data.uri ?? ""].filter(Boolean),
    reasonForCall:
      "Demo adapter call: entity enrichment would be purchased when external profiles are detected."
  });

  const aiClassification = await ace.callAIClassificationService({
    targetType: "token",
    targetAddress,
    evidence: {
      metadata: tokenMetadata.data,
      supply: tokenSupply.data,
      topHolderCount: topHolders.data.length
    },
    reasonForCall:
      "Demo adapter call: AI classification would be purchased after structured evidence is collected."
  });

  const sentinelCheck = await sentinel.callSentinelCheck("token", targetAddress, {
    evidence: {
      tokenMetadata: tokenMetadata.data,
      tokenSupply: tokenSupply.data
    },
    requestedBy: "demo:adapters"
  });

  console.log(
    JSON.stringify(
      {
        modeNotice:
          "This script exercises adapter mock mode only; it does not claim real SAP, Synapse, Ace, or Sentinel usage.",
        sapRegistration,
        discoveredTools,
        tokenMetadata,
        tokenSupply,
        topHolders,
        aceCalls: [webSearch, entityEnrichment, aiClassification],
        sentinelCheck
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
