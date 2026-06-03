import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import { AceX402Client } from "../ace/aceX402Client";
import type {
  AceAIClassificationInput,
  AceEntityEnrichmentInput,
  AceServiceCallResult,
  AceWebSearchInput
} from "../ace/aceTypes";
import type { AppConfig } from "../config/env";
import type { AppDatabase } from "../db/runsRepository";
import {
  aceServiceCalls,
  paymentReceipts,
  reports,
  sentinelChecks,
  workflowRuns
} from "../db/schema";
import { SpendingPolicy } from "../payments/spendingPolicy";
import { generateReport } from "../reports/reportGenerator";
import { SapClient } from "../sap/sapClient";
import { SentinelClient } from "../sentinel/sentinelClient";
import { SynapseRpcClient } from "../synapse/synapseRpcClient";
import { mockId } from "../utils/mockData";
import { evaluateRisk } from "../risk/riskEngine";
import { decideAceTools } from "./toolDecisionEngine";
import type {
  GeneratedReport,
  OnChainEvidence,
  RunIntelligenceWorkflowInput,
  StoredAceCall,
  ToolDecision,
  WorkflowRunResult
} from "./workflowTypes";

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export interface WorkflowOrchestratorDependencies {
  config: AppConfig;
  db: AppDatabase;
  logger?: Logger;
}

export class WorkflowOrchestrator {
  private readonly config: AppConfig;
  private readonly db: AppDatabase;
  private readonly logger: Logger | undefined;

  public constructor(dependencies: WorkflowOrchestratorDependencies) {
    this.config = dependencies.config;
    this.db = dependencies.db;
    this.logger = dependencies.logger;
  }

  public async runIntelligenceWorkflow(
    input: RunIntelligenceWorkflowInput
  ): Promise<WorkflowRunResult> {
    const spendingPolicy = SpendingPolicy.fromAppConfig(this.db, this.config);

    try {
      validateSolanaAddress(input.targetAddress);
      await spendingPolicy.checkCanStartRun(input.targetType, input.targetAddress);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown workflow error";

      return {
        runId: "preflight-rejected",
        reportId: null,
        status: "failed",
        error: message
      };
    }

    const runId = randomUUID();
    const startedAt = new Date();

    await this.db.insert(workflowRuns).values({
      id: runId,
      targetType: input.targetType,
      targetAddress: input.targetAddress,
      triggerType: input.triggerType,
      requester: input.requester ?? null,
      status: "running",
      startedAt,
      completedAt: null,
      totalCost: 0,
      error: null
    });

    try {
      await spendingPolicy.validateNoWashPattern(runId);

      const synapse = new SynapseRpcClient(this.config);
      const sap = new SapClient({ config: this.config, db: this.db });
      const ace = new AceX402Client(this.config);
      const sentinel = new SentinelClient(this.config);

      const onChainEvidence = await this.fetchOnChainEvidence(
        synapse,
        input.targetType,
        input.targetAddress
      );

      const sapTools = await sap.discoverTools({
        capability:
          input.targetType === "token"
            ? "solana:token-intelligence"
            : "solana:wallet-intelligence",
        protocol: "x402",
        targetType: input.targetType,
        maxResults: 3
      });
      await sap.recordToolDiscovery(runId, sapTools);

      const selectedTools = decideAceTools({
        targetType: input.targetType,
        targetAddress: input.targetAddress,
        onChainEvidence
      });
      const preparedAceOrders = await ace.prepareOrdersForServices(
        selectedTools.map((tool) => tool.serviceName)
      );

      if (preparedAceOrders.length > 0) {
        this.logger?.info(
          {
            runId,
            orders: preparedAceOrders.map((order) => ({
              serviceName: order.serviceName,
              created: order.created,
              source: order.source
            }))
          },
          "Prepared Ace x402 orders for workflow"
        );
      }

      const aceCalls: StoredAceCall[] = [];

      for (const decision of selectedTools) {
        await spendingPolicy.checkCanCallPaidService(
          runId,
          decision.serviceName,
          decision.estimatedCost,
          decision.reasonForCall
        );

        const serviceResult = await this.executeAceDecision(ace, decision);
        const receiptId = await this.storePaymentReceipt(runId, serviceResult);
        await this.storeAceServiceCall(runId, decision, serviceResult, receiptId);
        await spendingPolicy.recordSpendingEvent(
          runId,
          serviceResult.serviceName,
          serviceResult.cost,
          {
            serviceName: serviceResult.serviceName,
            cost: serviceResult.cost,
            status: serviceResult.paymentStatus,
            facilitator: serviceResult.facilitator,
            timestamp: getReceiptTimestamp(serviceResult),
            reasonForCall: decision.reasonForCall,
            txSignature: serviceResult.txSignature,
            mockReceiptId: serviceResult.mockReceiptId,
            receiptPayload: serviceResult.receiptPayload
          }
        );

        aceCalls.push({ serviceResult, receiptId });
      }

      const sentinelContext = {
        runId,
        evidence: {
          onChainEvidence,
          sapToolCount: sapTools.length,
          aceCallCount: aceCalls.length
        },
        ...(input.requester ? { requestedBy: input.requester } : {})
      };
      const sentinelResult = await sentinel.callSentinelCheck(
        input.targetType,
        input.targetAddress,
        sentinelContext
      );
      await this.storeSentinelCheck(runId, sentinelResult);

      const totalCost = await spendingPolicy.calculateRunSpend(runId);
      const risk = evaluateRisk({
        targetType: input.targetType,
        targetAddress: input.targetAddress,
        onChainEvidence,
        aceCalls,
        sentinel: sentinelResult
      });
      const report = generateReport({
        runId,
        workflowInput: input,
        onChainEvidence,
        sapTools,
        selectedTools,
        aceCalls,
        sentinel: sentinelResult,
        risk,
        totalCost
      });
      const reportId = await this.storeReport(runId, input, report);
      await spendingPolicy.validateNoWashPattern(runId);

      await this.db
        .update(workflowRuns)
        .set({
          status: "completed",
          completedAt: new Date(),
          totalCost,
          error: null
        })
        .where(eq(workflowRuns.id, runId));

      return {
        runId,
        reportId,
        status: "completed",
        report,
        selectedTools,
        sapTools,
        aceCalls,
        sentinel: sentinelResult
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown workflow error";
      this.logger?.error({ error, runId }, "Intelligence workflow failed");

      await this.db
        .update(workflowRuns)
        .set({
          status: "failed",
          completedAt: new Date(),
          error: message
        })
        .where(eq(workflowRuns.id, runId));

      return {
        runId,
        reportId: null,
        status: "failed",
        error: message
      };
    }
  }

  private async fetchOnChainEvidence(
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

  private async executeAceDecision(
    ace: AceX402Client,
    decision: ToolDecision
  ): Promise<AceServiceCallResult> {
    if (decision.serviceName === "web_search") {
      return ace.callWebSearchService(decision.inputPayload as AceWebSearchInput);
    }

    if (decision.serviceName === "entity_enrichment") {
      return ace.callEntityEnrichmentService(
        decision.inputPayload as AceEntityEnrichmentInput
      );
    }

    return ace.callAIClassificationService(
      decision.inputPayload as AceAIClassificationInput
    );
  }

  private async storePaymentReceipt(
    runId: string,
    serviceResult: AceServiceCallResult
  ): Promise<string> {
    const receiptId = serviceResult.mockReceiptId
      ? mockId("run_receipt", { runId, receiptId: serviceResult.mockReceiptId }, 20)
      : randomUUID();

    await this.db.insert(paymentReceipts).values({
      id: receiptId,
      runId,
      serviceName: serviceResult.serviceName,
      facilitator: serviceResult.facilitator,
      txSignature: serviceResult.txSignature,
      receiptPayload: serviceResult.receiptPayload,
      status:
        serviceResult.paymentStatus === "not_required"
          ? "pending"
          : serviceResult.paymentStatus,
      createdAt: new Date(getReceiptTimestamp(serviceResult))
    });

    return receiptId;
  }

  private async storeAceServiceCall(
    runId: string,
    decision: ToolDecision,
    serviceResult: AceServiceCallResult,
    receiptId: string
  ): Promise<void> {
    await this.db.insert(aceServiceCalls).values({
      id: randomUUID(),
      runId,
      serviceName: serviceResult.serviceName,
      inputSummary: serviceResult.inputSummary,
      outputSummary: serviceResult.outputSummary,
      reasonForCall: decision.reasonForCall,
      paymentStatus: serviceResult.paymentStatus,
      cost: serviceResult.cost,
      receiptId,
      createdAt: new Date()
    });
  }

  private async storeSentinelCheck(
    runId: string,
    sentinelResult: Awaited<ReturnType<SentinelClient["callSentinelCheck"]>>
  ): Promise<void> {
    await this.db.insert(sentinelChecks).values({
      id: randomUUID(),
      runId,
      sentinelAgentId: sentinelResult.sentinelAgentId,
      checkType: sentinelResult.checkType,
      status: sentinelResult.status,
      requestSummary: `${sentinelResult.targetType}:${sentinelResult.targetAddress}`,
      resultSummary: sentinelResult.resultSummary,
      proofPayload: sentinelResult.proofPayload,
      createdAt: new Date(sentinelResult.checkedAt)
    });
  }

  private async storeReport(
    runId: string,
    input: RunIntelligenceWorkflowInput,
    report: GeneratedReport
  ): Promise<string> {
    const reportId = mockId("report", { runId, target: input.targetAddress }, 20);

    await this.db.insert(reports).values({
      id: reportId,
      runId,
      targetType: input.targetType,
      targetAddress: input.targetAddress,
      score: report.score,
      verdict: report.verdict,
      jsonReport: report.jsonReport,
      markdownReport: report.markdownReport,
      createdAt: new Date()
    });

    return reportId;
  }
}

export async function runIntelligenceWorkflow(
  input: RunIntelligenceWorkflowInput,
  dependencies: WorkflowOrchestratorDependencies
): Promise<WorkflowRunResult> {
  return new WorkflowOrchestrator(dependencies).runIntelligenceWorkflow(input);
}

function getReceiptTimestamp(serviceResult: AceServiceCallResult): string {
  const createdAt = serviceResult.receiptPayload.createdAt;

  if (typeof createdAt === "string") {
    return createdAt;
  }

  return new Date().toISOString();
}

function validateSolanaAddress(address: string): void {
  if (!address.trim()) {
    throw new Error("Target address is required");
  }

  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) {
    throw new Error("Target address must be base58 encoded");
  }

  const decoded = decodeBase58(address);

  if (decoded.length !== 32) {
    throw new Error("Target address must decode to a 32-byte Solana public key");
  }
}

function decodeBase58(value: string): Uint8Array {
  const bytes = [0];

  for (const character of value) {
    const alphabetIndex = BASE58_ALPHABET.indexOf(character);

    if (alphabetIndex < 0) {
      throw new Error("Target address contains invalid base58 characters");
    }

    let carry = alphabetIndex;

    for (let byteIndex = 0; byteIndex < bytes.length; byteIndex += 1) {
      const current = (bytes[byteIndex] ?? 0) * 58 + carry;
      bytes[byteIndex] = current & 0xff;
      carry = current >> 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  for (const character of value) {
    if (character !== "1") {
      break;
    }

    bytes.push(0);
  }

  return Uint8Array.from(bytes.reverse());
}
