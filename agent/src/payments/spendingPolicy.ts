import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { AppConfig } from "../config/env";
import type { AppDatabase } from "../db/runsRepository";
import {
  aceServiceCalls,
  spendingEvents,
  workflowRuns
} from "../db/schema";
import type { PaymentStatus } from "../types/domain";
import type {
  PaymentReceiptForPolicy,
  RecordedSpendingEvent,
  SpendingPolicyCheckSuccess,
  SpendingPolicyConfig
} from "./paymentTypes";
import { SpendingPolicyError } from "./paymentTypes";

const MAX_IDENTICAL_TARGET_RUNS_PER_DAY = 3;

export class SpendingPolicy {
  private readonly db: AppDatabase;
  private readonly config: SpendingPolicyConfig;

  public constructor(db: AppDatabase, config: SpendingPolicyConfig) {
    this.db = db;
    this.config = config;
  }

  public static fromAppConfig(db: AppDatabase, config: AppConfig): SpendingPolicy {
    const policyConfig: SpendingPolicyConfig = {
      maxDailySpendUsdc: config.MAX_DAILY_SPEND_USDC,
      maxSpendPerRunUsdc: config.MAX_SPEND_PER_RUN_USDC,
      maxToolCallsPerRun: config.MAX_TOOL_CALLS_PER_RUN
    };

    if (config.SAP_AGENT_ID.trim()) {
      policyConfig.selfAgentId = config.SAP_AGENT_ID;
    }

    if (config.ACE_ACCOUNT_ID.trim()) {
      policyConfig.selfAccountId = config.ACE_ACCOUNT_ID;
    }

    return new SpendingPolicy(db, policyConfig);
  }

  public async checkCanStartRun(
    targetType: "token" | "wallet",
    targetAddress: string
  ): Promise<SpendingPolicyCheckSuccess> {
    const repeatedCount = await this.countTargetRunsToday(
      targetType,
      targetAddress
    );

    if (repeatedCount >= MAX_IDENTICAL_TARGET_RUNS_PER_DAY) {
      throw new SpendingPolicyError(
        "REPEATED_TARGET_LIMIT_EXCEEDED",
        "This target reached today's analysis limit. Choose a different address or wait until tomorrow; the limit protects against artificial repeated usage.",
        {
          targetType,
          targetAddress,
          limit: MAX_IDENTICAL_TARGET_RUNS_PER_DAY,
          actual: repeatedCount
        }
      );
    }

    return { allowed: true };
  }

  public async checkCanCallPaidService(
    runId: string,
    serviceName: string,
    estimatedCost: number,
    reasonForCall: string
  ): Promise<SpendingPolicyCheckSuccess> {
    assertPositiveCost(estimatedCost, "estimatedCost");
    assertNonEmptyReason(reasonForCall);
    this.assertNotSelfPayment(serviceName);
    await this.assertRunExists(runId);

    const currentToolCalls = await this.countToolCallsForRun(runId);

    if (currentToolCalls >= this.config.maxToolCallsPerRun) {
      throw new SpendingPolicyError(
        "MAX_TOOL_CALLS_EXCEEDED",
        "Run has reached the paid tool-call limit",
        {
          runId,
          serviceName,
          limit: this.config.maxToolCallsPerRun,
          actual: currentToolCalls
        }
      );
    }

    const currentRunSpend = await this.calculateRunSpend(runId);
    const currentDailySpend = await this.calculateDailySpend();
    const projectedRunSpend = currentRunSpend + estimatedCost;
    const projectedDailySpend = currentDailySpend + estimatedCost;

    await this.assertSpendWithinBudget(runId, serviceName, estimatedCost);

    return {
      allowed: true,
      runId,
      currentToolCalls,
      currentRunSpend,
      currentDailySpend,
      remainingRunBudget: roundMoney(
        this.config.maxSpendPerRunUsdc - projectedRunSpend
      ),
      remainingDailyBudget: roundMoney(
        this.config.maxDailySpendUsdc - projectedDailySpend
      )
    };
  }

  public async recordSpendingEvent(
    runId: string,
    serviceName: string,
    cost: number,
    receipt: PaymentReceiptForPolicy
  ): Promise<RecordedSpendingEvent> {
    assertPositiveCost(cost, "cost");
    this.validateReceipt(serviceName, cost, receipt);
    const reasonForCall = getReceiptReason(receipt);
    assertNonEmptyReason(reasonForCall);
    this.assertNotSelfPayment(serviceName);
    await this.assertRunExists(runId);
    await this.assertSpendWithinBudget(runId, serviceName, cost);

    const createdAt = new Date();
    const eventId = randomUUID();
    const receiptTimestamp = new Date(receipt.timestamp);

    await this.db.insert(spendingEvents).values({
      id: eventId,
      runId,
      serviceName,
      reason: reasonForCall,
      amount: cost,
      currency: "USDC",
      paymentStatus: receipt.status,
      facilitator: receipt.facilitator,
      receiptPayload: {
        ...receipt.receiptPayload,
        serviceName: receipt.serviceName,
        cost: receipt.cost,
        status: receipt.status,
        facilitator: receipt.facilitator,
        timestamp: receipt.timestamp,
        reasonForCall,
        txSignature: receipt.txSignature ?? null,
        mockReceiptId: receipt.mockReceiptId ?? null
      },
      receiptTimestamp,
      createdAt
    });

    return {
      id: eventId,
      runId,
      serviceName,
      cost,
      status: receipt.status,
      facilitator: receipt.facilitator,
      createdAt: createdAt.toISOString()
    };
  }

  public async calculateDailySpend(): Promise<number> {
    const [row] = await this.db
      .select({
        total: sql<number>`coalesce(sum(${spendingEvents.amount}), 0)`
      })
      .from(spendingEvents)
      .where(gte(spendingEvents.createdAt, startOfUtcDay(new Date())));

    return roundMoney(Number(row?.total ?? 0));
  }

  public async calculateRunSpend(runId: string): Promise<number> {
    const [row] = await this.db
      .select({
        total: sql<number>`coalesce(sum(${spendingEvents.amount}), 0)`
      })
      .from(spendingEvents)
      .where(eq(spendingEvents.runId, runId));

    return roundMoney(Number(row?.total ?? 0));
  }

  public async validateNoWashPattern(
    runId: string
  ): Promise<SpendingPolicyCheckSuccess> {
    const run = await this.assertRunExists(runId);
    const repeatedTargetCount = await this.countTargetRunsToday(
      run.targetType,
      run.targetAddress
    );

    if (repeatedTargetCount > MAX_IDENTICAL_TARGET_RUNS_PER_DAY) {
      throw new SpendingPolicyError(
        "REPEATED_TARGET_LIMIT_EXCEEDED",
        "This target reached today's analysis limit. Choose a different address or wait until tomorrow; the limit protects against artificial repeated usage.",
        {
          runId,
          targetType: run.targetType,
          targetAddress: run.targetAddress,
          limit: MAX_IDENTICAL_TARGET_RUNS_PER_DAY,
          actual: repeatedTargetCount
        }
      );
    }

    const calls = await this.db
      .select({
        serviceName: aceServiceCalls.serviceName,
        reasonForCall: aceServiceCalls.reasonForCall
      })
      .from(aceServiceCalls)
      .where(eq(aceServiceCalls.runId, runId));

    for (const call of calls) {
      assertNonEmptyReason(call.reasonForCall);
      this.assertNotSelfPayment(call.serviceName);
    }

    const spending = await this.db
      .select({
        serviceName: spendingEvents.serviceName,
        paymentStatus: spendingEvents.paymentStatus,
        facilitator: spendingEvents.facilitator,
        receiptTimestamp: spendingEvents.receiptTimestamp
      })
      .from(spendingEvents)
      .where(eq(spendingEvents.runId, runId));

    for (const event of spending) {
      this.assertNotSelfPayment(event.serviceName);
      if (!event.facilitator || !event.paymentStatus || !event.receiptTimestamp) {
        throw new SpendingPolicyError(
          "INVALID_RECEIPT",
          "Spending event is missing receipt proof fields",
          { runId, serviceName: event.serviceName }
        );
      }
    }

    return { allowed: true, runId };
  }

  private async assertRunExists(runId: string): Promise<{
    id: string;
    targetType: "token" | "wallet";
    targetAddress: string;
  }> {
    if (!runId.trim()) {
      throw new SpendingPolicyError(
        "RUN_NOT_FOUND",
        "Paid service call must be attached to a workflow run"
      );
    }

    const [run] = await this.db
      .select({
        id: workflowRuns.id,
        targetType: workflowRuns.targetType,
        targetAddress: workflowRuns.targetAddress
      })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
      .limit(1);

    if (!run) {
      throw new SpendingPolicyError(
        "RUN_NOT_FOUND",
        "Workflow run was not found for paid service call",
        { runId }
      );
    }

    return run;
  }

  private async countToolCallsForRun(runId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(aceServiceCalls)
      .where(eq(aceServiceCalls.runId, runId));

    return row?.value ?? 0;
  }

  private async countTargetRunsToday(
    targetType: "token" | "wallet",
    targetAddress: string
  ): Promise<number> {
    const runs = await this.db
      .select({
        id: workflowRuns.id,
        status: workflowRuns.status,
        totalCost: workflowRuns.totalCost
      })
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.targetType, targetType),
          eq(workflowRuns.targetAddress, targetAddress),
          gte(workflowRuns.startedAt, startOfUtcDay(new Date()))
        )
      );

    const failedRunIds = runs
      .filter((run) => run.status === "failed" && run.totalCost <= 0)
      .map((run) => run.id);
    const failedRunsWithSpend = new Set<string>();

    if (failedRunIds.length > 0) {
      const spendingRows = await this.db
        .select({ runId: spendingEvents.runId })
        .from(spendingEvents)
        .where(inArray(spendingEvents.runId, failedRunIds));

      for (const row of spendingRows) {
        failedRunsWithSpend.add(row.runId);
      }
    }

    return runs.filter(
      (run) =>
        run.status !== "failed" ||
        run.totalCost > 0 ||
        failedRunsWithSpend.has(run.id)
    ).length;
  }

  private validateReceipt(
    serviceName: string,
    cost: number,
    receipt: PaymentReceiptForPolicy
  ): void {
    if (receipt.serviceName !== serviceName) {
      throw new SpendingPolicyError(
        "INVALID_RECEIPT",
        "Receipt service name does not match paid service",
        { serviceName, actual: cost }
      );
    }

    if (Math.abs(receipt.cost - cost) > 0.000001) {
      throw new SpendingPolicyError(
        "INVALID_RECEIPT",
        "Receipt cost does not match spending event cost",
        { serviceName, actual: receipt.cost, limit: cost }
      );
    }

    if (!receipt.status || !isPaymentStatus(receipt.status)) {
      throw new SpendingPolicyError(
        "INVALID_RECEIPT",
        "Receipt has an invalid payment status",
        { serviceName }
      );
    }

    if (!receipt.facilitator.trim()) {
      throw new SpendingPolicyError(
        "INVALID_RECEIPT",
        "Receipt is missing facilitator",
        { serviceName }
      );
    }

    if (!receipt.timestamp || Number.isNaN(Date.parse(receipt.timestamp))) {
      throw new SpendingPolicyError(
        "INVALID_RECEIPT",
        "Receipt is missing a valid timestamp",
        { serviceName }
      );
    }
  }

  private assertNotSelfPayment(serviceName: string): void {
    const normalizedServiceName = normalizeIdentifier(serviceName);
    const selfIdentifiers = [
      this.config.selfAgentId,
      this.config.selfAccountId
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .map(normalizeIdentifier);

    if (selfIdentifiers.includes(normalizedServiceName)) {
      throw new SpendingPolicyError(
        "SELF_PAYMENT_LOOP",
        "Paid service appears to target this agent/account",
        { serviceName }
      );
    }
  }

  private async assertSpendWithinBudget(
    runId: string,
    serviceName: string,
    estimatedCost: number
  ): Promise<void> {
    const currentRunSpend = await this.calculateRunSpend(runId);
    const currentDailySpend = await this.calculateDailySpend();
    const projectedRunSpend = currentRunSpend + estimatedCost;
    const projectedDailySpend = currentDailySpend + estimatedCost;

    if (projectedRunSpend > this.config.maxSpendPerRunUsdc) {
      throw new SpendingPolicyError(
        "MAX_RUN_SPEND_EXCEEDED",
        "Spending event would exceed max spend per run",
        {
          runId,
          serviceName,
          estimatedCost,
          limit: this.config.maxSpendPerRunUsdc,
          actual: projectedRunSpend
        }
      );
    }

    if (projectedDailySpend > this.config.maxDailySpendUsdc) {
      throw new SpendingPolicyError(
        "MAX_DAILY_SPEND_EXCEEDED",
        "Spending event would exceed max daily spend",
        {
          runId,
          serviceName,
          estimatedCost,
          limit: this.config.maxDailySpendUsdc,
          actual: projectedDailySpend
        }
      );
    }
  }
}

function assertNonEmptyReason(reasonForCall: string): void {
  if (!reasonForCall.trim()) {
    throw new SpendingPolicyError(
      "MISSING_REASON_FOR_CALL",
      "Every paid service call must include a non-empty reason_for_call"
    );
  }
}

function assertPositiveCost(cost: number, fieldName: string): void {
  if (!Number.isFinite(cost) || cost < 0) {
    throw new SpendingPolicyError(
      "INVALID_COST",
      `${fieldName} must be a non-negative finite number`,
      { actual: cost }
    );
  }
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function roundMoney(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function isPaymentStatus(value: string): value is PaymentStatus {
  return ["not_required", "pending", "settled", "failed", "mocked"].includes(
    value
  );
}

function getReceiptReason(receipt: PaymentReceiptForPolicy): string {
  const payloadReason = receipt.receiptPayload?.reasonForCall;
  const reason =
    receipt.reasonForCall ??
    (typeof payloadReason === "string" ? payloadReason : "");

  assertNonEmptyReason(reason);
  return reason;
}
