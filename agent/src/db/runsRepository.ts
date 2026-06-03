import { desc, eq } from "drizzle-orm";
import type { SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

export type AppDatabase = SqliteRemoteDatabase<typeof schema>;

export async function listWorkflowRuns(db: AppDatabase, limit = 50) {
  return db
    .select()
    .from(schema.workflowRuns)
    .orderBy(desc(schema.workflowRuns.startedAt))
    .limit(limit);
}

export async function getWorkflowRunById(db: AppDatabase, id: string) {
  const [run] = await db
    .select()
    .from(schema.workflowRuns)
    .where(eq(schema.workflowRuns.id, id))
    .limit(1);

  return run ?? null;
}
