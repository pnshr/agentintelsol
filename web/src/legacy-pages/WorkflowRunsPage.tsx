import { useEffect, useState } from "react";
import { api } from "../api";
import { ErrorState, LoadingState } from "../components/LoadingState";
import { StatusPill } from "../components/StatusPill";
import { formatDate, formatMoney, shortId } from "../format";
import type { DashboardRun } from "../types";

export function WorkflowRunsPage({
  refreshKey,
  onOpenRun
}: {
  refreshKey: number;
  onOpenRun: (runId: string, reportId: string | null) => void;
}) {
  const [runs, setRuns] = useState<DashboardRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setError(null);
    api
      .getRuns()
      .then((data) => mounted && setRuns(data))
      .catch((err: unknown) =>
        mounted && setError(err instanceof Error ? err.message : "Unable to load runs")
      );
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!runs) {
    return <LoadingState label="Loading workflow runs" />;
  }

  return (
    <section>
      <div className="pageHeader">
        <div>
          <h1>Workflow Runs</h1>
          <p>Autonomous runs with service counts, cost, and verdicts</p>
        </div>
      </div>
      <div className="tableWrap runsTableWrap">
        <table className="runsTable">
          <thead>
            <tr>
              <th>Run id</th>
              <th>Target</th>
              <th>Trigger</th>
              <th>Status</th>
              <th>Services</th>
              <th>Cost</th>
              <th>Verdict</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id}>
                <td>
                  <span className="mono">{shortId(run.id)}</span>
                  {run.isVerifiedRun && <StatusPill value="verified" />}
                </td>
                <td>
                  <span className="mono">{shortId(run.targetAddress, 6)}</span>
                  <small>{run.targetType}</small>
                </td>
                <td>{run.triggerType}</td>
                <td>
                  <StatusPill value={run.status} />
                </td>
                <td>{run.totalServices}</td>
                <td>
                  {formatMoney(run.totalCost)}
                  {typeof run.mockReceiptCount === "number" && run.mockReceiptCount > 0 && (
                    <small>{run.mockReceiptCount} mock receipts</small>
                  )}
                </td>
                <td>{run.verdict}</td>
                <td>{formatDate(run.createdAt)}</td>
                <td>
                  <button
                    className="smallButton"
                    type="button"
                    onClick={() => onOpenRun(run.id, run.reportId)}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
