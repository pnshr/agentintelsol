import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config/env";
import { createDatabase } from "../db/client";
import { initializeDatabase } from "../db/initialize";

function resolveSqlitePath(databaseUrl: string): string {
  if (databaseUrl === ":memory:") {
    return databaseUrl;
  }

  const withoutFileProtocol = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;

  return path.resolve(process.cwd(), withoutFileProtocol);
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function removeIfExists(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  fs.rmSync(filePath, { force: true });
  return true;
}

function main(): void {
  const config = loadConfig();

  if (config.DATABASE_URL === ":memory:") {
    console.log(
      JSON.stringify(
        {
          reset: false,
          reason: "DATABASE_URL is :memory:, so there is no local file to reset."
        },
        null,
        2
      )
    );
    return;
  }

  const databasePath = resolveSqlitePath(config.DATABASE_URL);
  const allowedDataDir = path.resolve(process.cwd(), "data");

  if (!isInside(allowedDataDir, databasePath)) {
    throw new Error(
      `Refusing to reset database outside ${allowedDataDir}. Current DATABASE_URL resolves to ${databasePath}.`
    );
  }

  const targets = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];
  const removed = targets.filter(removeIfExists);

  const database = createDatabase(config);
  initializeDatabase(database.sqlite);
  database.sqlite.close();

  console.log(
    JSON.stringify(
      {
        reset: true,
        databasePath,
        removed,
        initializedEmptySchema: true
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
