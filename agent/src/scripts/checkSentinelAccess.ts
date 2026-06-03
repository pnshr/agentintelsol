import { loadConfig } from "../config/env";
import { SentinelClient } from "../sentinel/sentinelClient";

const config = loadConfig();
const sentinel = new SentinelClient(config);

async function main(): Promise<void> {
  const result = await sentinel.getGatewayPreflight();

  console.log(
    JSON.stringify(
      {
        ...result,
        readyForRealSentinelGatewayCalls: Boolean(
          !config.SENTINEL_MOCK_MODE &&
            config.SENTINEL_AGENT_ID &&
            config.SENTINEL_ENDPOINT &&
            config.SENTINEL_CHECK_PATH &&
            config.SENTINEL_MERCHANT_WALLET &&
            config.SENTINEL_DEPOSITOR_WALLET &&
            config.SENTINEL_TOOL_TOKEN &&
            config.SENTINEL_TOOL_WALLET
        ),
        noSpendGuarantee:
          "This script only calls /health, /tools, and an unpaid tool request without x-sap-depositor. It does not execute a paid Sentinel tool call.",
        escrowRequirement:
          "A real workflow run requires a funded SAP escrow for SENTINEL_DEPOSITOR_WALLET against the Sentinel merchant wallet."
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
