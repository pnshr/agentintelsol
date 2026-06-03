import type { DatabaseSync } from "node:sqlite";

export function initializeDatabase(sqlite: DatabaseSync): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL CHECK (target_type IN ('token', 'wallet')),
      target_address TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      requester TEXT,
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      total_cost REAL NOT NULL DEFAULT 0,
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS tool_discoveries (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      capability TEXT NOT NULL,
      selected_tool TEXT,
      discovery_payload TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_receipts (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      facilitator TEXT NOT NULL,
      tx_signature TEXT,
      receipt_payload TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'settled', 'failed', 'mocked')),
      created_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ace_service_calls (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      input_summary TEXT NOT NULL,
      output_summary TEXT,
      reason_for_call TEXT NOT NULL,
      payment_status TEXT NOT NULL CHECK (payment_status IN ('not_required', 'pending', 'settled', 'failed', 'mocked')),
      cost REAL NOT NULL DEFAULT 0,
      receipt_id TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (receipt_id) REFERENCES payment_receipts(id)
    );

    CREATE TABLE IF NOT EXISTS sentinel_checks (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      sentinel_agent_id TEXT,
      check_type TEXT NOT NULL,
      status TEXT NOT NULL,
      request_summary TEXT,
      result_summary TEXT,
      proof_payload TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK (target_type IN ('token', 'wallet')),
      target_address TEXT NOT NULL,
      score REAL NOT NULL,
      verdict TEXT NOT NULL,
      json_report TEXT NOT NULL,
      markdown_report TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS spending_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      service_name TEXT NOT NULL,
      reason TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'USDC',
      payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('not_required', 'pending', 'settled', 'failed', 'mocked')),
      facilitator TEXT NOT NULL DEFAULT '',
      receipt_payload TEXT,
      receipt_timestamp INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES workflow_runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_workflow_runs_started_at
      ON workflow_runs(started_at DESC);

    CREATE INDEX IF NOT EXISTS idx_ace_service_calls_run_id
      ON ace_service_calls(run_id);

    CREATE INDEX IF NOT EXISTS idx_payment_receipts_run_id
      ON payment_receipts(run_id);

    CREATE INDEX IF NOT EXISTS idx_reports_run_id
      ON reports(run_id);

    CREATE INDEX IF NOT EXISTS idx_spending_events_created_at
      ON spending_events(created_at DESC);
  `);

  ensureColumn(sqlite, "spending_events", "payment_status", "TEXT NOT NULL DEFAULT 'pending'");
  ensureColumn(sqlite, "spending_events", "facilitator", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(sqlite, "spending_events", "receipt_payload", "TEXT");
  ensureColumn(sqlite, "spending_events", "receipt_timestamp", "INTEGER");
}

function ensureColumn(
  sqlite: DatabaseSync,
  tableName: string,
  columnName: string,
  definition: string
): void {
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => {
    const record = column as { name?: unknown };
    return record.name === columnName;
  });

  if (!exists) {
    sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }
}
