process.env.ACE_MOCK_MODE = "true";
process.env.SAP_MOCK_MODE = "true";
process.env.SYNAPSE_MOCK_MODE = "true";
process.env.SENTINEL_MOCK_MODE = "true";

import { getDemoAddress } from "../config/demoAddresses";
import { loadConfig } from "../config/env";
import { createDatabase } from "../db/client";
import { initializeDatabase } from "../db/initialize";
import { workflowRuns } from "../db/schema";
import { createLogger } from "../utils/logger";
import { WorkflowOrchestrator } from "../workflow/workflowOrchestrator";
import type { WorkflowTargetType } from "../workflow/workflowTypes";

function getTargetType(): WorkflowTargetType {
  return process.argv.includes("--wallet") ? "wallet" : "token";
}

function shouldForceSeed(): boolean {
  return process.argv.includes("--force") || process.env.DEMO_SEED_FORCE === "true";
}

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const database = createDatabase(config);

  try {
    initializeDatabase(database.sqlite);

    const existingRuns = await database.db.select().from(workflowRuns);
    if (existingRuns.length > 0 && !shouldForceSeed()) {
      console.log(
        JSON.stringify(
          {
            seeded: false,
            reason:
              "Database already has workflow runs. Use --force after considering the repeated-target anti-wash limit, or run npm run db:reset first.",
            existingRuns: existingRuns.length,
            dashboardUrl: "http://localhost:5173",
            mockNotice:
              "Existing mock receipts remain labeled as mock when ACE_MOCK_MODE=true."
          },
          null,
          2
        )
      );
      return;
    }

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
      triggerType: "scheduled",
      requester: "local-demo-seed"
    });

    if (result.status !== "completed") {
      throw new Error(result.error ?? "Demo seed workflow failed");
    }

    console.log(
      JSON.stringify(
        {
          seeded: true,
          modeNotice:
            "Seed run uses mock adapters. x402 receipts are not real settlements.",
          dashboardUrl: "http://localhost:5173",
          runId: result.runId,
          reportId: result.reportId,
          targetType,
          targetAddress,
          aceServiceCalls: result.aceCalls?.length ?? 0,
          mockX402Receipts:
            result.aceCalls?.filter(
              (call) => call.serviceResult.paymentStatus === "mocked"
            ).length ?? 0,
          sentinelStatus: result.sentinel?.status,
          verdict: result.report?.verdict
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
