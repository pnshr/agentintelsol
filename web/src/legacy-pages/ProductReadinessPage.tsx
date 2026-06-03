import { useEffect, useState } from "react";
import { api } from "../api";
import { ErrorState, LoadingState } from "../components/LoadingState";
import { StatusPill } from "../components/StatusPill";
import { formatDate, formatMoney } from "../format";
import type { ProductReadiness } from "../types";

export function ProductReadinessPage({ refreshKey }: { refreshKey: number }) {
  const [readiness, setReadiness] = useState<ProductReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setError(null);
    api
      .getReadiness()
      .then((data) => mounted && setReadiness(data))
      .catch((err: unknown) =>
        mounted &&
        setError(err instanceof Error ? err.message : "Unable to load readiness")
      );
    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!readiness) {
    return <LoadingState label="Loading product readiness" />;
  }

  return (
    <section>
      <div className="pageHeader">
        <div>
          <h1>Operations</h1>
          <p>Runtime checks, integration coverage, and service quality signals</p>
        </div>
        <StatusPill value={displayReadinessStatus(readiness.status)} />
      </div>

      <div
        className={
          readiness.status === "mainnet_ready"
            ? "notice"
            : readiness.status === "local_demo_ready"
              ? "notice warnNotice"
              : "notice error"
        }
      >
        <strong>{readiness.summary}</strong>
        <span> Generated {formatDate(readiness.generatedAt)}.</span>
      </div>

      <div className="metricGrid">
        <Metric label="Runs" value={String(readiness.metrics.totalRuns)} />
        <Metric label="Completed" value={String(readiness.metrics.completedRuns)} />
        <Metric label="Ace calls" value={String(readiness.metrics.totalAceServiceCalls)} />
        <Metric
          label="Distinct services"
          value={String(readiness.metrics.distinctAceServices)}
        />
        <Metric
          label="Payment receipts"
          value={String(readiness.metrics.totalPaymentReceipts)}
        />
        <Metric label="Sentinel checks" value={String(readiness.metrics.totalSentinelChecks)} />
        <Metric label="Reports" value={String(readiness.metrics.totalReports)} />
        <Metric label="Mock receipts" value={String(readiness.metrics.mockReceiptCount)} />
        <Metric label="Total spend" value={formatMoney(readiness.metrics.totalSpend)} />
      </div>

      {readiness.blockers.length > 0 && (
        <div className="dataPanel">
          <div className="panelHeader">
            <strong>Operational blockers</strong>
            <StatusPill value="blocked" />
          </div>
          <ul className="blockerList">
            {readiness.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="checklist">
        {readiness.checks.map((check) => (
          <div className="checkRow" key={check.id}>
            <StatusPill value={check.status} />
            <div>
              <strong>{check.label}</strong>
              <span>{check.detail}</span>
            </div>
          </div>
        ))}
      </div>
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

function displayReadinessStatus(status: ProductReadiness["status"]): string {
  if (status === "mainnet_ready") {
    return "production ready";
  }

  if (status === "local_demo_ready") {
    return "local only";
  }

  return "blocked";
}
