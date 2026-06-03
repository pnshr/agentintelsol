process.env.ACE_MOCK_MODE = "true";
process.env.SAP_MOCK_MODE = "true";
process.env.SYNAPSE_MOCK_MODE = "true";
process.env.SENTINEL_MOCK_MODE = "true";

import { getDemoAddress } from "../config/demoAddresses";
import { loadConfig } from "../config/env";
import { createDatabase } from "../db/client";
import { initializeDatabase } from "../db/initialize";
import { WorkflowOrchestrator } from "../workflow/workflowOrchestrator";
import type { WorkflowTargetType } from "../workflow/workflowTypes";
import { createLogger } from "../utils/logger";

function getTargetType(): WorkflowTargetType {
  return process.argv.includes("--wallet") ? "wallet" : "token";
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const database = createDatabase(config);

  try {
    initializeDatabase(database.sqlite);

    const targetType = getTargetType();
    const targetAddress = getDemoAddress(config, targetType);
    const orchestrator = new WorkflowOrchestrator({
      config,
      db: database.db,
      logger
    });

    const result = await orchestrator.runIntelligenceWorkflow({
      targetType,
      targetAddress,
      triggerType: "manual",
      requester: "local-demo-script"
    });

    if (result.status !== "completed") {
      throw new Error(result.error ?? "Demo workflow failed");
    }

    const aceCallCount = result.aceCalls?.length ?? 0;
    const mockReceiptCount =
      result.aceCalls?.filter(
        (call) => call.serviceResult.mode === "mock" &&
          call.serviceResult.paymentStatus === "mocked"
      ).length ?? 0;

    if (aceCallCount < 3) {
      throw new Error(
        `Expected at least 3 Ace service calls, but workflow produced ${aceCallCount}.`
      );
    }

    console.log(
      JSON.stringify(
        {
          modeNotice:
            "Mock demo run only. x402 receipts are mock receipts because ACE_MOCK_MODE=true.",
          dashboardUrl: "http://localhost:5173",
          apiUrl: "http://localhost:3001",
          runId: result.runId,
          reportId: result.reportId,
          targetType,
          targetAddress,
          status: result.status,
          verdict: result.report?.verdict,
          score: result.report?.score,
          aceServiceCalls: aceCallCount,
          mockX402Receipts: mockReceiptCount,
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
