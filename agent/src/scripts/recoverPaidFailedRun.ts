import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import type { AceServiceCallResult } from "../ace/aceTypes";
import { loadConfig } from "../config/env";
import { generateReport } from "../reports/reportGenerator";
import { evaluateRisk } from "../risk/riskEngine";
import type { SapToolDiscoveryResult } from "../sap/sapTypes";
import { SentinelClient } from "../sentinel/sentinelClient";
import { SynapseRpcClient } from "../synapse/synapseRpcClient";
import type { JsonRecord } from "../types/json";
import { decideAceTools } from "../workflow/toolDecisionEngine";
import type {
  OnChainEvidence,
  RunIntelligenceWorkflowInput,
  StoredAceCall
} from "../workflow/workflowTypes";

const config = loadConfig();
const sqlite = new DatabaseSync(resolveSqlitePath(config.DATABASE_URL));
sqlite.exec("PRAGMA foreign_keys = ON;");

async function main(): Promise<void> {
  const runId = process.argv[2] ?? findLatestRecoverableRunId();

  if (!runId) {
    throw new Error("No failed paid run with settled Ace calls was found.");
  }

  const existingReport = sqlite
    .prepare("select id from reports where run_id = ? limit 1")
    .get(runId) as { id: string } | undefined;

  if (existingReport) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          recovered: false,
          runId,
          reportId: existingReport.id,
          note: "Report already exists for this run."
        },
        null,
        2
      )
    );
    return;
  }

  const run = readRun(runId);
  const workflowInput = buildWorkflowInput(run);
  const onChainEvidence = await fetchOnChainEvidence(
    new SynapseRpcClient(config),
    workflowInput.targetType,
    workflowInput.targetAddress
  );
  const sapTools = readSapTools(runId);
  const selectedTools = decideAceTools({
    targetType: workflowInput.targetType,
    targetAddress: workflowInput.targetAddress,
    onChainEvidence
  });
  const aceCalls = readAceCalls(runId);

  if (aceCalls.length === 0) {
    throw new Error(`Run ${runId} has no stored Ace service calls to recover.`);
  }

  const sentinel = await new SentinelClient(config).callSentinelCheck(
    workflowInput.targetType,
    workflowInput.targetAddress,
    {
      runId,
      evidence: {
        recovery: true,
        aceCallCount: aceCalls.length,
        sapToolCount: sapTools.length
      },
      ...(workflowInput.requester ? { requestedBy: workflowInput.requester } : {})
    }
  );

  storeSentinelCheck(runId, sentinel);

  const totalCost = calculateRunCost(runId);
  const risk = evaluateRisk({
    targetType: workflowInput.targetType,
    targetAddress: workflowInput.targetAddress,
    onChainEvidence,
    aceCalls,
    sentinel
  });
  const report = generateReport({
    runId,
    workflowInput,
    onChainEvidence,
    sapTools,
    selectedTools,
    aceCalls,
    sentinel,
    risk,
    totalCost
  });
  const reportId = randomUUID();

  sqlite
    .prepare(
      `insert into reports (
        id, run_id, target_type, target_address, score, verdict,
        json_report, markdown_report, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      reportId,
      runId,
      workflowInput.targetType,
      workflowInput.targetAddress,
      report.score,
      report.verdict,
      JSON.stringify(report.jsonReport),
      report.markdownReport,
      Date.now()
    );

  sqlite
    .prepare(
      `update workflow_runs
       set status = 'completed', completed_at = ?, total_cost = ?, error = null
       where id = ?`
    )
    .run(Date.now(), totalCost, runId);

  console.log(
    JSON.stringify(
      {
        ok: true,
        recovered: true,
        runId,
        reportId,
        status: "completed",
        sentinelStatus: sentinel.status,
        sentinelSummary: sentinel.resultSummary,
        totalCost,
        verdict: report.verdict,
        score: report.score
      },
      null,
      2
    )
  );
}

function findLatestRecoverableRunId(): string | null {
  const row = sqlite
    .prepare(
      `select wr.id
       from workflow_runs wr
       where wr.status = 'failed'
         and exists (
           select 1 from ace_service_calls asc
           where asc.run_id = wr.id and asc.payment_status = 'settled'
         )
         and not exists (
           select 1 from reports r where r.run_id = wr.id
         )
       order by wr.started_at desc
       limit 1`
    )
    .get() as { id: string } | undefined;

  return row?.id ?? null;
}

function readRun(runId: string): Record<string, unknown> {
  const row = sqlite
    .prepare("select * from workflow_runs where id = ?")
    .get(runId) as Record<string, unknown> | undefined;

  if (!row) {
    throw new Error(`Workflow run ${runId} was not found.`);
  }

  return row;
}

function buildWorkflowInput(row: Record<string, unknown>): RunIntelligenceWorkflowInput {
  const targetType = row.target_type;
  const targetAddress = row.target_address;
  const triggerType = row.trigger_type;

  if (targetType !== "token" && targetType !== "wallet") {
    throw new Error(`Unsupported target_type for recovery: ${String(targetType)}`);
  }

  if (typeof targetAddress !== "string") {
    throw new Error("Recovered run is missing target_address.");
  }

  if (
    triggerType !== "manual" &&
    triggerType !== "scheduled" &&
    triggerType !== "api" &&
    triggerType !== "agent_request"
  ) {
    throw new Error(`Unsupported trigger_type for recovery: ${String(triggerType)}`);
  }

  return {
    targetType,
    targetAddress,
    triggerType,
    ...(typeof row.requester === "string" && row.requester
      ? { requester: row.requester }
      : {})
  };
}

async function fetchOnChainEvidence(
  synapse: SynapseRpcClient,
  targetType: "token" | "wallet",
  targetAddress: string
): Promise<OnChainEvidence> {
  const accountInfo = await synapse.getAccountInfo(targetAddress);

  if (targetType === "token") {
    const [metadata, supply, topHolders, recentTransfers] = await Promise.all([
      synapse.getTokenMetadata(targetAddress),
      synapse.getTokenSupply(targetAddress),
      synapse.getTopHolders(targetAddress),
      synapse.getRecentTransfers(targetAddress)
    ]);

    return {
      targetType,
      accountInfo,
      metadata,
      supply,
      topHolders,
      recentTransfers
    };
  }

  const [transactions, recentTransfers] = await Promise.all([
    synapse.getWalletTransactions(targetAddress),
    synapse.getRecentTransfers(targetAddress)
  ]);

  return {
    targetType,
    accountInfo,
    transactions,
    recentTransfers
  };
}

function readSapTools(runId: string): SapToolDiscoveryResult[] {
  const rows = sqlite
    .prepare("select * from tool_discoveries where run_id = ? order by created_at asc")
    .all(runId) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const payload = parseJsonRecord(row.discovery_payload);

    return {
      mode: payload.mode === "mock" ? "mock" : "real",
      toolId: readString(payload, "toolId") ?? String(row.id),
      name:
        typeof row.selected_tool === "string" && row.selected_tool
          ? row.selected_tool
          : readString(payload, "name") ?? "Recovered SAP tool",
      capability:
        typeof row.capability === "string"
          ? row.capability
          : readString(payload, "capability") ?? "unknown",
      protocol: readString(payload, "protocol") ?? "x402",
      endpoint: readString(payload, "endpoint") ?? "",
      pricing: toRecord(payload.pricing) as unknown as SapToolDiscoveryResult["pricing"],
      reputation:
        toRecord(payload.reputation) as unknown as SapToolDiscoveryResult["reputation"],
      metadata: toRecord(payload.metadata),
      discoveredAt:
        typeof row.created_at === "number"
          ? new Date(row.created_at).toISOString()
          : new Date().toISOString()
    };
  });
}

function readAceCalls(runId: string): StoredAceCall[] {
  const rows = sqlite
    .prepare(
      `select
        asc.*,
        pr.facilitator,
        pr.tx_signature,
        pr.receipt_payload,
        pr.status as receipt_status
       from ace_service_calls asc
       left join payment_receipts pr on pr.id = asc.receipt_id
       where asc.run_id = ?
       order by asc.created_at asc`
    )
    .all(runId) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const receiptPayload = parseJsonRecord(row.receipt_payload);
    const serviceName = String(row.service_name) as AceServiceCallResult["serviceName"];
    const serviceResult: AceServiceCallResult = {
      mode: receiptPayload.mock === true ? "mock" : "real",
      serviceName,
      inputSummary: String(row.input_summary ?? ""),
      outputSummary: String(row.output_summary ?? ""),
      cost: readNumber(row.cost),
      paymentStatus: String(row.payment_status) as AceServiceCallResult["paymentStatus"],
      facilitator: String(row.facilitator ?? ""),
      txSignature:
        typeof row.tx_signature === "string" && row.tx_signature
          ? row.tx_signature
          : null,
      mockReceiptId:
        typeof receiptPayload.receiptId === "string"
          ? receiptPayload.receiptId
          : null,
      receiptPayload,
      rawResponse: {
        recovered: true,
        serviceName,
        outputSummary: String(row.output_summary ?? ""),
        receiptPayload
      }
    };

    return {
      serviceResult,
      receiptId: String(row.receipt_id ?? "")
    };
  });
}

function storeSentinelCheck(
  runId: string,
  sentinel: Awaited<ReturnType<SentinelClient["callSentinelCheck"]>>
): void {
  sqlite
    .prepare(
      `insert into sentinel_checks (
        id, run_id, sentinel_agent_id, check_type, status,
        request_summary, result_summary, proof_payload, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      randomUUID(),
      runId,
      sentinel.sentinelAgentId,
      sentinel.checkType,
      sentinel.status,
      `${sentinel.targetType}:${sentinel.targetAddress}`,
      sentinel.resultSummary,
      JSON.stringify(sentinel.proofPayload),
      new Date(sentinel.checkedAt).getTime()
    );
}

function calculateRunCost(runId: string): number {
  const row = sqlite
    .prepare("select coalesce(sum(amount), 0) as total from spending_events where run_id = ?")
    .get(runId) as { total: number } | undefined;

  return Number(row?.total ?? 0);
}

function parseJsonRecord(value: unknown): JsonRecord {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as JsonRecord;
  }

  if (typeof value !== "string" || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as JsonRecord)
      : {};
  } catch {
    return {};
  }
}

function toRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function readString(value: JsonRecord, key: string): string | null {
  const nested = value[key];
  return typeof nested === "string" && nested.trim().length > 0
    ? nested
    : null;
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function resolveSqlitePath(databaseUrl: string): string {
  const withoutFileProtocol = databaseUrl.startsWith("file:")
    ? databaseUrl.slice("file:".length)
    : databaseUrl;

  return path.resolve(process.cwd(), withoutFileProtocol);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
