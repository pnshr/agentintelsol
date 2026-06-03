import { useEffect, useState } from "react";
import { api } from "../api";
import { StatusPill } from "../components/StatusPill";
import { ErrorState, LoadingState } from "../components/LoadingState";
import { formatDate, formatMoney, formatTokenAmount, shortId } from "../format";
import type { BalanceSummary, DashboardSummary } from "../types";

export function HomePage({ refreshKey }: { refreshKey: number }) {
  const [data, setData] = useState<{
    summary: DashboardSummary | null;
    balances: BalanceSummary | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setError(null);
    setBalanceError(null);
    setData(null);

    api
      .getSummary()
      .then((summary) => {
        if (mounted) {
          setData({ summary, balances: null });
        }
      })
      .catch((err: unknown) =>
        mounted && setError(err instanceof Error ? err.message : "Unable to load status")
      );

    api
      .getBalances()
      .then((balances) => {
        if (mounted) {
          setData((current) => ({
            summary: current?.summary ?? null,
            balances
          }));
        }
      })
      .catch((err: unknown) => {
        if (mounted) {
          setBalanceError(err instanceof Error ? err.message : "Unable to load balances");
        }
      });

    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!data) {
    return <LoadingState label="Loading agent status" />;
  }

  const { summary, balances } = data;

  if (!summary) {
    return <LoadingState label="Loading agent status" />;
  }

  return (
    <section>
      <div className="pageHeader">
        <div>
          <h1>Agent Status</h1>
          <p>AgentIntel Broker operations dashboard</p>
        </div>
        <StatusPill value={summary.lastRunStatus} />
      </div>

      <div className="identityBand">
        <div>
          <span>Agent name</span>
          <strong>{summary.agentName}</strong>
        </div>
        <div>
          <span>SAP agent id</span>
          <strong>{summary.sapAgentId}</strong>
        </div>
      </div>

      <div className="metricGrid">
        <Metric label="Total runs" value={summary.totalRuns.toString()} />
        <Metric label="Completed runs" value={summary.completedRuns.toString()} />
        <Metric label="Failed runs" value={summary.failedRuns.toString()} />
        <Metric
          label="Ace service calls"
          value={summary.totalAceServiceCalls.toString()}
        />
        <Metric
          label="x402 payments"
          value={summary.totalX402Payments.toString()}
        />
        <Metric label="Total spend" value={formatMoney(summary.totalSpend)} />
      </div>

      {balanceError && (
        <div className="notice warnNotice">
          <strong>Balances did not load:</strong> <span>{balanceError}</span>
        </div>
      )}

      {balances ? (
        <div className="dataPanel balancePanel">
          <div className="panelHeader">
            <strong>Balances</strong>
            <small>Checked {formatDate(balances.checkedAt)}</small>
          </div>
          <div className="balanceGrid">
            <BalanceCard
              title="Ace x402 payer"
              status={balances.ace.check.status}
              address={balances.ace.walletAddress}
              rows={[
                ["Network", balances.ace.network],
                ["USDC", formatTokenAmount(balances.ace.usdcBalance, "USDC", 2)],
                ["Gas", formatTokenAmount(balances.ace.nativeBalance, "ETH", 6)],
                [
                  "Full run cap",
                  formatTokenAmount(balances.ace.requiredUsdcForFullRun, "USDC", 2)
                ]
              ]}
              note={balances.ace.check.message}
            />
            <BalanceCard
              title="Sentinel depositor"
              status={balances.sentinel.check.status}
              address={balances.sentinel.walletAddress}
              rows={[
                ["Network", balances.sentinel.network],
                ["SOL", formatTokenAmount(balances.sentinel.solBalance, "SOL", 6)],
                [
                  "Escrow minimum",
                  formatTokenAmount(balances.sentinel.minEscrowSol, "SOL", 6)
                ]
              ]}
              note={balances.sentinel.check.message}
            />
          </div>
        </div>
      ) : (
        <LoadingState label="Loading balances" />
      )}

      {summary.verifiedRun && (
        <div className="dataPanel auditPanel">
          <div className="panelHeader">
            <strong>Verified run</strong>
            <StatusPill value="verified" />
          </div>
          <div className="auditGrid">
            <AuditFact label="Run id" value={shortId(summary.verifiedRun.runId, 8)} />
            <AuditFact
              label="Ace services"
              value={summary.verifiedRun.aceServiceCalls.toString()}
            />
            <AuditFact
              label="Receipts"
              value={`${summary.verifiedRun.paymentReceipts} real / ${summary.verifiedRun.mockPaymentReceipts} mock`}
            />
            <AuditFact
              label="Verified spend"
              value={formatMoney(summary.verifiedRun.totalCost)}
            />
            <AuditFact
              label="Verdict"
              value={summary.verifiedRun.verdict ?? "Pending"}
            />
            <AuditFact
              label="Completed"
              value={formatDate(summary.verifiedRun.completedAt)}
            />
          </div>
          <p className="panelNote">
            This run has non-mock payment receipts and Sentinel evidence, so it is
            separated from older local development rows.
          </p>
        </div>
      )}

      <div className="modeStrip">
        <StatusPill value={summary.mockModes.sap ? "SAP mock" : "SAP real"} />
        <StatusPill
          value={summary.mockModes.synapse ? "Synapse mock" : "Synapse real"}
        />
        <StatusPill value={summary.mockModes.ace ? "Ace mock" : "Ace real"} />
        <StatusPill
          value={summary.mockModes.sentinel ? "Sentinel mock" : "Sentinel real"}
        />
      </div>

      {Object.values(summary.mockModes).some(Boolean) && (
        <div className="notice warnNotice">
          <strong>Mock mode enabled:</strong>{" "}
          <span>
            Local receipts and integration payloads verify workflow behavior only. They
            are not real SAP mainnet registration, real Ace x402 settlement, or real
            Sentinel execution.
          </span>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AuditFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="auditFact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function BalanceCard({
  title,
  status,
  address,
  rows,
  note
}: {
  title: string;
  status: string;
  address: string | null;
  rows: Array<[string, string]>;
  note: string;
}) {
  return (
    <div className="balanceCard">
      <div className="panelHeader">
        <strong>{title}</strong>
        <StatusPill value={status} />
      </div>
      <div className="balanceAddress mono">{address ? shortId(address, 10) : "Not configured"}</div>
      <div className="balanceRows">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="panelNote">{note}</p>
    </div>
  );
}
