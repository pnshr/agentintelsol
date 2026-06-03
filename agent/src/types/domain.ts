export type TargetType = "token" | "wallet";

export type WorkflowStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type PaymentStatus =
  | "not_required"
  | "pending"
  | "settled"
  | "failed"
  | "mocked";

export type ReceiptStatus = "pending" | "settled" | "failed" | "mocked";

export type TriggerType = "api" | "sap" | "scheduled" | "demo";
