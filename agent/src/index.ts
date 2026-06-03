import { createDatabase } from "./db/client";
import { initializeDatabase } from "./db/initialize";
import { buildServer } from "./server/app";
import { loadConfig } from "./config/env";
import { createLogger } from "./utils/logger";
import { logMockModeWarnings } from "./integrations/integrationStatus";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  logMockModeWarnings(config, logger);
  const database = createDatabase(config);

  initializeDatabase(database.sqlite);

  const server = buildServer({
    config,
    db: database.db,
    logger
  });

  const address = await server.listen({
    port: config.PORT,
    host: "0.0.0.0"
  });

  logger.info({ address }, "AgentIntel Broker API started");
}

main().catch((error: unknown) => {
  try {
    const config = loadConfig();
    const logger = createLogger(config);
    logger.fatal({ error }, "AgentIntel Broker API failed to start");
  } catch {
    console.error("AgentIntel Broker API failed to start", error);
  }

  process.exit(1);
});
