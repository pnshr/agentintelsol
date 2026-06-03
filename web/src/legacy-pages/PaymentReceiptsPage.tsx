import { useEffect, useState } from "react";
import { api } from "../api";
import { ErrorState, LoadingState } from "../components/LoadingState";
import { StatusPill } from "../components/StatusPill";
import { formatDate, formatMoney, shortId } from "../format";
import type { DashboardSummary, PaymentReceipt } from "../types";

export function PaymentReceiptsPage({ refreshKey }: { refreshKey: number }) {
  const [receipts, setReceipts] = useState<PaymentReceipt[] | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setError(null);
    Promise.all([api.getReceipts(), api.getSummary()])
      .then(([receiptData, summaryData]) => {
        if (mounted) {
          setReceipts(receiptData);
          setSummary(summaryData);
        }
      })
      .catch((err: unknown) =>
        mounted &&
        setError(err instanceof Error ? err.message : "Unable to load receipts")
      );
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!receipts || !summary) {
    return <LoadingState label="Loading payment receipts" />;
  }

  const verifiedRunId = summary.verifiedRun?.runId ?? null;
  const verifiedReceipts = verifiedRunId
    ? receipts.filter((receipt) => receipt.runId === verifiedRunId)
    : [];
  const mockReceiptCount = receipts.filter((receipt) => receipt.receiptPayload?.mock).length;

  return (
    <section>
      <div className="pageHeader">
        <div>
          <h1>Payment Receipts</h1>
          <p>x402 facilitator receipts and payment history</p>
        </div>
      </div>

      {verifiedRunId && (
        <div className="dataPanel auditPanel">
          <div className="panelHeader">
            <strong>Verified payment set</strong>
            <StatusPill value="real x402" />
          </div>
          <div className="auditGrid">
            <AuditFact label="Run id" value={shortId(verifiedRunId, 8)} />
            <AuditFact label="Receipts" value={verifiedReceipts.length.toString()} />
            <AuditFact
              label="Mock receipts"
              value={verifiedReceipts
                .filter((receipt) => receipt.receiptPayload?.mock)
                .length.toString()}
            />
            <AuditFact
              label="Verified spend"
              value={formatMoney(summary.verifiedRun?.totalCost ?? 0)}
            />
            <AuditFact label="Historical mock rows" value={mockReceiptCount.toString()} />
            <AuditFact
              label="Facilitator"
              value={String(verifiedReceipts[0]?.facilitator ?? "None")}
            />
          </div>
        </div>
      )}

      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Facilitator</th>
              <th>Cost</th>
              <th>Tx / mock receipt</th>
              <th>Status</th>
              <th>Mode</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {receipts.map((receipt) => (
              <tr key={receipt.id}>
                <td>{receipt.serviceName}</td>
                <td>{receipt.facilitator}</td>
                <td>{formatMoney(Number(receipt.receiptPayload?.amount ?? 0))}</td>
                <td className="mono">
                  {shortId(
                    receipt.txSignature ??
                      String(receipt.receiptPayload?.mockReceiptId ?? receipt.id),
                    10
                  )}
                </td>
                <td>
                  <StatusPill value={receipt.status} />
                </td>
                <td>
                  <StatusPill
                    value={receipt.receiptPayload?.mock ? "mock receipt" : "real receipt"}
                  />
                </td>
                <td>{formatDate(receipt.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
