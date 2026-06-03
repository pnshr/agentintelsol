import { loadConfig } from "../config/env";
import { SapClient } from "../sap/sapClient";
import type { SapAgentMetadata } from "../sap/sapTypes";

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.SAP_MOCK_MODE) {
    throw new Error(
      "sap:register is reserved for real SAP registration. Set SAP_MOCK_MODE=false after credentials are configured, or run sap:check to inspect SDK readiness."
    );
  }

  const sap = new SapClient({ config });
  const metadata: SapAgentMetadata = {
    name: "AgentIntel Broker",
    description:
      "Autonomous Solana intelligence marketplace agent with reasoned tool buying, x402 receipt storage, Sentinel checks, and structured reports.",
    version: "0.1.0",
    capabilities: [
      "solana:token-intelligence",
      "solana:wallet-intelligence",
      "sap:tool-discovery",
      "x402:paid-tool-use",
      "proof:structured-report"
    ],
    protocols: ["sap", "synapse-rpc", "x402", "synapse-sentinel"],
    extra: {
      mock: false,
      project: "AgentIntel Broker"
    }
  };

  if (config.AGENT_PUBLIC_URL) {
    metadata.endpoint = config.AGENT_PUBLIC_URL;
    metadata.metadataUri = config.AGENT_PUBLIC_URL;
  }

  if (config.AGENT_X402_ENDPOINT) {
    metadata.x402Endpoint = config.AGENT_X402_ENDPOINT;
  }

  const result = await sap.registerAgent(metadata);

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
