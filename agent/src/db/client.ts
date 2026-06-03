import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import type { AppConfig } from "../config/env";
import * as schema from "./schema";

export interface DatabaseContext {
  sqlite: DatabaseSync;
  db: SqliteRemoteDatabase<typeof schema>;
}

export function createDatabase(config: AppConfig): DatabaseContext {
  const databasePath = resolveSqlitePath(config.DATABASE_URL);
  const databaseDir = path.dirname(databasePath);

  if (databasePath !== ":memory:") {
    fs.mkdirSync(databaseDir, { recursive: true });
  }

  const sqlite = new DatabaseSync(databasePath);
  sqlite.exec("PRAGMA journal_mode = WAL;");
  sqlite.exec("PRAGMA foreign_keys = ON;");

  return {
    sqlite,
    db: drizzle(createNodeSqliteProxy(sqlite), { schema })
  };
}

function createNodeSqliteProxy(sqlite: DatabaseSync) {
  return async (
    sql: string,
    params: unknown[],
    method: "run" | "all" | "values" | "get"
  ): Promise<{ rows: unknown[] }> => {
    const statement = sqlite.prepare(sql);
    const boundParams = params as SQLInputValue[];

    if (method === "run") {
      statement.run(...boundParams);
      return { rows: [] };
    }

    if (method === "get") {
      const row = statement.get(...boundParams);
      return { rows: row ? rowToOrderedValues(statement, row) : [] };
    }

    const rows = statement.all(...boundParams);
    return {
      rows: rows.map((row) => rowToOrderedValues(statement, row))
    };
  };
}

function rowToOrderedValues(
  statement: ReturnType<DatabaseSync["prepare"]>,
  row: Record<string, unknown>
): unknown[] {
  const columnNames = statement.columns().map((column) => column.name);
  return columnNames.map((columnName) => row[columnName] ?? null);
}

function resolveSqlitePath(databaseUrl: string): string {
  if (databaseUrl === ":memory:") {
    return databaseUrl;
  }

  const withoutFileProtocol = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;

  return path.resolve(process.cwd(), withoutFileProtocol);
}
