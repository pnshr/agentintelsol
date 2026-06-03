import { useEffect, useState } from "react";
import { ErrorState, LoadingState } from "../components/LoadingState";
import { StatusPill } from "../components/StatusPill";
import { API_BASE_URL, api } from "../api";
import { formatDate, formatMoney, safeJson, shortId } from "../format";
import type { RunDetail } from "../types";

export function RunDetailPage({
  runId,
  refreshKey,
  onOpenReport
}: {
  runId: string | null;
  refreshKey: number;
  onOpenReport: (reportId: string) => void;
}) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) {
      setDetail(null);
      return;
    }

    let mounted = true;
    setError(null);
    api
      .getRunDetail(runId)
      .then((data) => mounted && setDetail(data))
      .catch((err: unknown) =>
        mounted && setError(err instanceof Error ? err.message : "Unable to load run")
      );
    return () => {
      mounted = false;
    };
  }, [runId, refreshKey]);

  if (!runId) {
    return <div className="notice">Open a run from Workflow Runs.</div>;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!detail) {
    return <LoadingState label="Loading run detail" />;
  }

  return (
    <section>
      <div className="pageHeader">
        <div>
          <h1>Run Detail</h1>
          <p>{shortId(detail.run.id, 12)}</p>
        </div>
        <StatusPill value={detail.run.status} />
      </div>

      <div className="detailHeader">
        <div>
          <span>Target</span>
          <strong>{shortId(detail.run.targetAddress, 10)}</strong>
        </div>
        <div>
          <span>Total services</span>
          <strong>{detail.aceServiceCalls.length}</strong>
        </div>
        <div>
          <span>Total cost</span>
          <strong>{formatMoney(detail.run.totalCost)}</strong>
        </div>
        <div>
          <span>Verdict</span>
          <strong>{detail.report?.verdict ?? "Pending"}</strong>
        </div>
      </div>

      <div className="notice warnNotice">
        <strong>Audit bundle:</strong>{" "}
        <span>
          Download a single JSON audit package for this run at{" "}
          <a href={`${API_BASE_URL}/api/audit/${detail.run.id}?download=1`}>
            /api/audit/{shortId(detail.run.id, 6)}
          </a>
          .
        </span>
      </div>

      <h2>Workflow timeline</h2>
      <ol className="timeline">
        {detail.timeline.map((step) => (
          <li key={step.label}>
            <div>
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </div>
            <div>
              <StatusPill value={step.status} />
              <small>{formatDate(step.timestamp)}</small>
            </div>
          </li>
        ))}
      </ol>

      <div className="splitPanels">
        <div>
          <h2>SAP tool discovery</h2>
          <div className="dataPanel">
            {detail.toolDiscoveries.length === 0 ? (
              <span>No SAP discovery records stored.</span>
            ) : (
              detail.toolDiscoveries.map((tool, index) => (
                <div className="evidenceRow" key={String(tool.id ?? index)}>
                  <strong>{String(tool.selectedTool ?? "Unknown tool")}</strong>
                  <span>{sapDiscoverySummary(tool)}</span>
                  <pre>{safeJson(tool.discoveryPayload ?? tool)}</pre>
                </div>
              ))
            )}
          </div>
        </div>

        <div>
          <h2>Sentinel result</h2>
          <div className="dataPanel">
            {detail.sentinelChecks.length === 0 ? (
              <span>No Sentinel check stored.</span>
            ) : (
              detail.sentinelChecks.map((check, index) => (
                <div className="evidenceRow" key={String(check.id ?? index)}>
                  <strong>{String(check.status ?? "unknown")}</strong>
                  <span>{String(check.resultSummary ?? "No summary")}</span>
                  <pre>{safeJson(check.proofPayload ?? check)}</pre>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <h2>Paid services</h2>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {detail.aceServiceCalls.map((call) => (
              <tr key={call.id}>
                <td>{call.serviceName}</td>
                <td>{call.reasonForCall}</td>
                <td>
                  <StatusPill value={call.paymentStatus} />
                </td>
                <td>{formatMoney(call.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>x402 payment receipts</h2>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Service</th>
              <th>Facilitator</th>
              <th>Status</th>
              <th>Mode</th>
              <th>Receipt / tx</th>
            </tr>
          </thead>
          <tbody>
            {detail.paymentReceipts.map((receipt) => (
              <tr key={receipt.id}>
                <td>{receipt.serviceName}</td>
                <td>{receipt.facilitator}</td>
                <td>
                  <StatusPill value={receipt.status} />
                </td>
                <td>
                  <StatusPill
                    value={receipt.receiptPayload?.mock ? "mock receipt" : "real receipt"}
                  />
                </td>
                <td className="mono">
                  {shortId(
                    receipt.txSignature ??
                      String(receipt.receiptPayload?.mockReceiptId ?? receipt.id),
                    10
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail.report && (
        <button
          className="primaryButton"
          type="button"
          onClick={() => detail.report && onOpenReport(detail.report.id)}
        >
          Open report
        </button>
      )}
    </section>
  );
}

function sapDiscoverySummary(tool: Record<string, unknown>): string {
  const selectedTool = String(tool.selectedTool ?? "");

  if (selectedTool.toLowerCase().includes("no sap tools matched")) {
    return "Real SAP registry query completed; no matching external tools were returned for this index query.";
  }

  return String(tool.capability ?? "Unknown capability");
}
