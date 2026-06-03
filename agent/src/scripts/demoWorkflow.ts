process.env.DATABASE_URL = process.env.DATABASE_URL || ":memory:";
process.env.ACE_MOCK_MODE = process.env.ACE_MOCK_MODE || "true";
process.env.SAP_MOCK_MODE = process.env.SAP_MOCK_MODE || "true";
process.env.SYNAPSE_MOCK_MODE = process.env.SYNAPSE_MOCK_MODE || "true";
process.env.SENTINEL_MOCK_MODE = process.env.SENTINEL_MOCK_MODE || "true";

import { createDatabase } from "../db/client";
import { initializeDatabase } from "../db/initialize";
import { WorkflowOrchestrator } from "../workflow/workflowOrchestrator";
import { loadConfig } from "../config/env";
import { createLogger } from "../utils/logger";
import { getDemoAddress } from "../config/demoAddresses";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const database = createDatabase(config);
  initializeDatabase(database.sqlite);

  const orchestrator = new WorkflowOrchestrator({
    config,
    db: database.db,
    logger
  });

  const result = await orchestrator.runIntelligenceWorkflow({
    targetType: "token",
    targetAddress: getDemoAddress(config, "token"),
    triggerType: "manual",
    requester: "demo:workflow"
  });

  console.log(
    JSON.stringify(
      {
        modeNotice:
          "This workflow demo uses mock adapters unless real integrations are implemented and mock modes are disabled.",
        result
      },
      null,
      2
    )
  );

  database.sqlite.close();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
