"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  ClipboardList,
  FileText,
  Gauge,
  Layers3,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck
} from "lucide-react";
import { HomePage } from "@/src/legacy-pages/HomePage";
import { NewAnalysisPage } from "@/src/legacy-pages/NewAnalysisPage";
import { WorkflowRunsPage } from "@/src/legacy-pages/WorkflowRunsPage";
import { RunDetailPage } from "@/src/legacy-pages/RunDetailPage";
import { PaymentReceiptsPage } from "@/src/legacy-pages/PaymentReceiptsPage";
import { ReportsPage } from "@/src/legacy-pages/ReportsPage";
import { IntegrationStatusPage } from "@/src/legacy-pages/IntegrationStatusPage";
import { ProductReadinessPage } from "@/src/legacy-pages/ProductReadinessPage";
import type { PageKey } from "@/src/types";
import { ApiStatusBanner } from "@/components/ApiStatusBanner";

const pages: Array<{
  key: PageKey;
  label: string;
  description: string;
  icon: typeof Activity;
}> = [
  {
    key: "home",
    label: "Agent Status",
    description: "Live backend, balances, mock modes",
    icon: Gauge
  },
  {
    key: "new-analysis",
    label: "New Analysis",
    description: "Submit token or wallet workflows",
    icon: Search
  },
  {
    key: "runs",
    label: "Workflow Runs",
    description: "Open executions and verdicts",
    icon: ClipboardList
  },
  {
    key: "run-detail",
    label: "Run Detail",
    description: "Timeline, paid services, audit links",
    icon: Layers3
  },
  {
    key: "receipts",
    label: "Payment Receipts",
    description: "x402 facilitator history",
    icon: ReceiptText
  },
  {
    key: "reports",
    label: "Reports",
    description: "Markdown and JSON evidence",
    icon: FileText
  },
  {
    key: "integration-status",
    label: "Integration Status",
    description: "SAP, Synapse, Ace, Sentinel",
    icon: ShieldCheck
  },
  {
    key: "readiness",
    label: "Operations",
    description: "Production readiness checks",
    icon: Activity
  }
];

export function AgentOperations() {
  const [activePage, setActivePage] = useState<PageKey>("home");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey((value) => value + 1);

  useEffect(() => {
    const selectPage = (event: Event) => {
      const page = (event as CustomEvent<PageKey>).detail;

      if (pages.some((item) => item.key === page)) {
        setActivePage(page);
      }
    };

    window.addEventListener("nebula:select-agent-page", selectPage);
    return () => window.removeEventListener("nebula:select-agent-page", selectPage);
  }, []);

  return (
    <section id="dashboard" className="mx-auto w-[min(1760px,calc(100%-40px))] scroll-mt-28 pb-20 pt-12">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-200">Agent operations</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
            AgentIntel Broker command console
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            The original operational dashboard is back here: run analyses, inspect workflow evidence,
            review x402 receipts, open reports, and verify integration readiness.
          </p>
        </div>
        <button
          type="button"
          className="refresh-button inline-flex min-h-12 items-center justify-center gap-2 border border-sky-300/25 bg-sky-300/10 px-5 text-sm font-semibold text-sky-100 transition hover:border-sky-200/50 hover:bg-sky-300/15"
          onClick={refresh}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Refresh data
        </button>
      </div>

      <div className="operations-console glass-surface console-shell grid overflow-hidden lg:grid-cols-[318px_minmax(0,1fr)]">
        <aside className="console-sidebar border-b border-white/10 bg-slate-950/18 p-4 lg:border-b-0 lg:border-r">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {pages.map((page) => {
              const Icon = page.icon;
              const isActive = activePage === page.key;

              return (
                <button
                  key={page.key}
                  type="button"
                  className={`nav-item group grid grid-cols-[42px_1fr] gap-3 border p-3.5 text-left transition ${
                    isActive
                      ? "nav-item-active border-sky-300/45 bg-sky-300/14 text-slate-50 shadow-[0_0_28px_rgba(56,189,248,0.12)]"
                      : "nav-item-idle border-transparent text-slate-300 hover:border-white/12 hover:bg-white/[0.06]"
                  }`}
                  onClick={() => setActivePage(page.key)}
                >
                  <span
                    className={`nav-icon grid size-11 place-items-center border ${
                      isActive
                        ? "border-sky-300/35 bg-sky-300/15 text-sky-100"
                        : "border-white/10 bg-white/[0.05] text-slate-400 group-hover:text-slate-100"
                    }`}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-sm font-semibold">{page.label}</strong>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{page.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="console-main min-w-0 p-5 sm:p-7 lg:p-9">
          <ApiStatusBanner refreshKey={refreshKey} />
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
          {activePage === "receipts" && <PaymentReceiptsPage refreshKey={refreshKey} />}
          {activePage === "reports" && (
            <ReportsPage selectedReportId={selectedReportId} refreshKey={refreshKey} />
          )}
          {activePage === "integration-status" && <IntegrationStatusPage refreshKey={refreshKey} />}
          {activePage === "readiness" && <ProductReadinessPage refreshKey={refreshKey} />}
        </div>
      </div>
    </section>
  );
}
