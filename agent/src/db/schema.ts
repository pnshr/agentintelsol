import { relations } from "drizzle-orm";
import {
  integer,
  real,
  sqliteTable,
  text
} from "drizzle-orm/sqlite-core";

export const workflowRuns = sqliteTable("workflow_runs", {
  id: text("id").primaryKey(),
  targetType: text("target_type", { enum: ["token", "wallet"] }).notNull(),
  targetAddress: text("target_address").notNull(),
  triggerType: text("trigger_type").notNull(),
  requester: text("requester"),
  status: text("status", {
    enum: ["queued", "running", "completed", "failed"]
  }).notNull(),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  totalCost: real("total_cost").notNull().default(0),
  error: text("error")
});

export const toolDiscoveries = sqliteTable("tool_discoveries", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  capability: text("capability").notNull(),
  selectedTool: text("selected_tool"),
  discoveryPayload: text("discovery_payload", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const aceServiceCalls = sqliteTable("ace_service_calls", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  serviceName: text("service_name").notNull(),
  inputSummary: text("input_summary").notNull(),
  outputSummary: text("output_summary"),
  reasonForCall: text("reason_for_call").notNull(),
  paymentStatus: text("payment_status", {
    enum: ["not_required", "pending", "settled", "failed", "mocked"]
  }).notNull(),
  cost: real("cost").notNull().default(0),
  receiptId: text("receipt_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const paymentReceipts = sqliteTable("payment_receipts", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  serviceName: text("service_name").notNull(),
  facilitator: text("facilitator").notNull(),
  txSignature: text("tx_signature"),
  receiptPayload: text("receipt_payload", { mode: "json" }),
  status: text("status", {
    enum: ["pending", "settled", "failed", "mocked"]
  }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const sentinelChecks = sqliteTable("sentinel_checks", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  sentinelAgentId: text("sentinel_agent_id"),
  checkType: text("check_type").notNull(),
  status: text("status").notNull(),
  requestSummary: text("request_summary"),
  resultSummary: text("result_summary"),
  proofPayload: text("proof_payload", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  targetType: text("target_type", { enum: ["token", "wallet"] }).notNull(),
  targetAddress: text("target_address").notNull(),
  score: real("score").notNull(),
  verdict: text("verdict").notNull(),
  jsonReport: text("json_report", { mode: "json" }).notNull(),
  markdownReport: text("markdown_report").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const spendingEvents = sqliteTable("spending_events", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  serviceName: text("service_name").notNull(),
  reason: text("reason").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("USDC"),
  paymentStatus: text("payment_status", {
    enum: ["not_required", "pending", "settled", "failed", "mocked"]
  }).notNull(),
  facilitator: text("facilitator").notNull(),
  receiptPayload: text("receipt_payload", { mode: "json" }),
  receiptTimestamp: integer("receipt_timestamp", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
});

export const workflowRunsRelations = relations(workflowRuns, ({ many }) => ({
  toolDiscoveries: many(toolDiscoveries),
  aceServiceCalls: many(aceServiceCalls),
  paymentReceipts: many(paymentReceipts),
  sentinelChecks: many(sentinelChecks),
  reports: many(reports),
  spendingEvents: many(spendingEvents)
}));

export const aceServiceCallsRelations = relations(aceServiceCalls, ({ one }) => ({
  run: one(workflowRuns, {
    fields: [aceServiceCalls.runId],
    references: [workflowRuns.id]
  }),
  receipt: one(paymentReceipts, {
    fields: [aceServiceCalls.receiptId],
    references: [paymentReceipts.id]
  })
}));

export const paymentReceiptsRelations = relations(paymentReceipts, ({ one }) => ({
  run: one(workflowRuns, {
    fields: [paymentReceipts.runId],
    references: [workflowRuns.id]
  })
}));

export const reportsRelations = relations(reports, ({ one }) => ({
  run: one(workflowRuns, {
    fields: [reports.runId],
    references: [workflowRuns.id]
  })
}));
