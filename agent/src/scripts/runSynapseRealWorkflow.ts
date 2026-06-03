process.env.ACE_MOCK_MODE = "true";
process.env.SAP_MOCK_MODE = "true";
process.env.SENTINEL_MOCK_MODE = "true";
process.env.SYNAPSE_MOCK_MODE = process.env.SYNAPSE_MOCK_MODE || "false";

import { getDemoAddress } from "../config/demoAddresses";
import { loadConfig } from "../config/env";
import { createDatabase } from "../db/client";
import { initializeDatabase } from "../db/initialize";
import { createLogger } from "../utils/logger";
import { WorkflowOrchestrator } from "../workflow/workflowOrchestrator";
import type { WorkflowTargetType } from "../workflow/workflowTypes";

const DEFAULT_REAL_TOKEN_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function getArgValue(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function getTargetType(): WorkflowTargetType {
  return process.argv.includes("--wallet") ? "wallet" : "token";
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.SYNAPSE_MOCK_MODE) {
    throw new Error(
      "runSynapseRealWorkflow requires SYNAPSE_MOCK_MODE=false."
    );
  }

  if (!config.SYNAPSE_RPC_URL.trim() || !config.SYNAPSE_API_KEY.trim()) {
    throw new Error(
      "runSynapseRealWorkflow requires SYNAPSE_RPC_URL and SYNAPSE_API_KEY."
    );
  }

  const logger = createLogger(config);
  const database = createDatabase(config);

  try {
    initializeDatabase(database.sqlite);

    const targetType = getTargetType();
    const targetAddress =
      getArgValue("address") ??
      (targetType === "token"
        ? DEFAULT_REAL_TOKEN_MINT
        : getDemoAddress(config, "wallet"));
    const orchestrator = new WorkflowOrchestrator({
      config,
      db: database.db,
      logger
    });

    const result = await orchestrator.runIntelligenceWorkflow({
      targetType,
      targetAddress,
      triggerType: "manual",
      requester: "synapse-real-demo-script"
    });

    if (result.status !== "completed") {
      throw new Error(result.error ?? "Synapse real workflow failed");
    }

    const sourceSummary = result.report?.jsonReport.integrationSourceSummary;
    console.log(
      JSON.stringify(
        {
          modeNotice:
            "Synapse RPC ran in real read-only mode. SAP, Ace x402, and Sentinel remain mock unless their mock modes are disabled with real credentials.",
          dashboardUrl: "http://localhost:5173",
          apiUrl: "http://localhost:3001",
          runId: result.runId,
          reportId: result.reportId,
          targetType,
          targetAddress,
          status: result.status,
          verdict: result.report?.verdict,
          score: result.report?.score,
          integrationSourceSummary: sourceSummary,
          aceServiceCalls: result.aceCalls?.length ?? 0,
          mockX402Receipts:
            result.aceCalls?.filter(
              (call) => call.serviceResult.paymentStatus === "mocked"
            ).length ?? 0,
          sentinelStatus: result.sentinel?.status,
          totalCost: result.report?.jsonReport.totalCost
        },
        null,
        2
      )
    );
  } finally {
    database.sqlite.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
