import { loadConfig } from "../config/env";
import { SapClient } from "../sap/sapClient";

const config = loadConfig();
const sap = new SapClient({ config });

async function main(): Promise<void> {
  const tools = await sap.discoverTools({
    capability: "solana:token-intelligence",
    protocol: "x402",
    targetType: "token",
    maxResults: 5
  });

  console.log(
    JSON.stringify(
      {
        mockMode: config.SAP_MOCK_MODE,
        query: {
          capability: "solana:token-intelligence",
          protocol: "x402",
          targetType: "token"
        },
        matchedTools: tools.length,
        tools: tools.map((tool) => ({
          mode: tool.mode,
          toolId: tool.toolId,
          name: tool.name,
          protocol: tool.protocol,
          endpoint: tool.endpoint,
          pricing: tool.pricing,
          discoveryBasis: tool.metadata.discoveryBasis ?? null,
          mock: tool.metadata.mock === true
        }))
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
