import { useState } from "react";
import type { PageKey } from "./types";
import { HomePage } from "./pages/HomePage";
import { NewAnalysisPage } from "./pages/NewAnalysisPage";
import { WorkflowRunsPage } from "./pages/WorkflowRunsPage";
import { RunDetailPage } from "./pages/RunDetailPage";
import { PaymentReceiptsPage } from "./pages/PaymentReceiptsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { IntegrationStatusPage } from "./pages/IntegrationStatusPage";
import { ProductReadinessPage } from "./pages/ProductReadinessPage";

const pages: Array<{ key: PageKey; label: string }> = [
  { key: "home", label: "Agent Status" },
  { key: "new-analysis", label: "New Analysis" },
  { key: "runs", label: "Workflow Runs" },
  { key: "run-detail", label: "Run Detail" },
  { key: "receipts", label: "Payment Receipts" },
  { key: "reports", label: "Reports" },
  { key: "integration-status", label: "Integration Status" },
  { key: "readiness", label: "Operations" }
];

export function App() {
  const [activePage, setActivePage] = useState<PageKey>("home");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey((value) => value + 1);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brandMark">AI</span>
          <div>
            <strong>AgentIntel Broker</strong>
            <small>Solana intelligence agent</small>
          </div>
        </div>
        <nav className="navList" aria-label="Dashboard navigation">
          {pages.map((page) => (
            <button
              className={activePage === page.key ? "navButton active" : "navButton"}
              key={page.key}
              type="button"
              onClick={() => setActivePage(page.key)}
            >
              {page.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">
        {activePage === "home" && <HomePage refreshKey={refreshKey} />}
        {activePage === "new-analysis" && (
          <NewAnalysisPage
            onRunCreated={(runId, reportId) => {
              setSelectedRunId(runId);
              setSelectedReportId(reportId);
              refresh();
              setActivePage("run-detail");
            }}
          />
        )}
        {activePage === "runs" && (
          <WorkflowRunsPage
            refreshKey={refreshKey}
            onOpenRun={(runId, reportId) => {
              setSelectedRunId(runId);
              setSelectedReportId(reportId);
              setActivePage("run-detail");
            }}
          />
        )}
        {activePage === "run-detail" && (
          <RunDetailPage
            runId={selectedRunId}
            refreshKey={refreshKey}
            onOpenReport={(reportId) => {
              setSelectedReportId(reportId);
              setActivePage("reports");
            }}
          />
        )}
        {activePage === "receipts" && (
          <PaymentReceiptsPage refreshKey={refreshKey} />
        )}
        {activePage === "reports" && (
          <ReportsPage selectedReportId={selectedReportId} refreshKey={refreshKey} />
        )}
        {activePage === "integration-status" && (
          <IntegrationStatusPage refreshKey={refreshKey} />
        )}
        {activePage === "readiness" && (
          <ProductReadinessPage refreshKey={refreshKey} />
        )}
      </main>
    </div>
  );
}
