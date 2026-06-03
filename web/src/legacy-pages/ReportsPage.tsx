import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { api } from "../api";
import { ErrorState, LoadingState } from "../components/LoadingState";
import { StatusPill } from "../components/StatusPill";
import { formatDate, formatMoney, safeJson, shortId } from "../format";
import type { ReportRow } from "../types";

type AnyRecord = Record<string, unknown>;

interface SummaryItem {
  label: string;
  value: string;
  detail?: string;
}

export function ReportsPage({
  selectedReportId,
  refreshKey
}: {
  selectedReportId: string | null;
  refreshKey: number;
}) {
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(selectedReportId);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setError(null);
    api
      .getReports()
      .then((data) => {
        if (!mounted) {
          return;
        }
        setReports(data);
        setActiveId(selectedReportId ?? data[0]?.id ?? null);
      })
      .catch((err: unknown) =>
        mounted && setError(err instanceof Error ? err.message : "Unable to load reports")
      );
    return () => {
      mounted = false;
    };
  }, [refreshKey, selectedReportId]);

  const activeReport = useMemo(
    () => reports?.find((report) => report.id === activeId) ?? reports?.[0] ?? null,
    [reports, activeId]
  );

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!reports) {
    return <LoadingState label="Loading reports" />;
  }

  return (
    <section>
      <div className="pageHeader">
        <div>
          <h1>Reports</h1>
          <p>Plain-language intelligence results, evidence, payments, and recommendation</p>
        </div>
      </div>

      <div className="split reportsSplit">
        <aside className="listPanel reportList">
          {reports.map((report) => (
            <button
              key={report.id}
              className={activeReport?.id === report.id ? "listItem active" : "listItem"}
              type="button"
              onClick={() => setActiveId(report.id)}
            >
              <strong>{report.targetType} report</strong>
              <span>{shortId(report.targetAddress, 8)}</span>
              <div className="reportListMeta">
                <StatusPill value={report.verdict} />
                <small>Score {report.score}</small>
              </div>
              <small>{formatDate(report.createdAt)}</small>
            </button>
          ))}
        </aside>

        {activeReport ? (
          <HumanReport report={activeReport} />
        ) : (
          <div className="notice">No reports yet.</div>
        )}
      </div>
    </section>
  );
}

function HumanReport({ report }: { report: ReportRow }) {
  const json = asRecord(report.jsonReport);
  const sections = asRecord(json.sections);
  const executive = asRecord(json.executiveSummary);
  const trigger = asRecord(json.trigger);
  const riskScore = asRecord(sections.riskScore);
  const finalVerdict = asRecord(sections.finalVerdict);
  const onChainFindings = asRecord(sections.onChainFindings);
  const offChainFindings = asRecord(sections.offChainAceFindings);
  const sentinel = asRecord(sections.sentinelResult);
  const integration = asRecord(json.integrationSourceSummary);
  const reasons = stringArray(riskScore.reasons);
  const paidReasons = recordArray(json.paidToolReasons ?? offChainFindings.toolBuyingReasons);
  const paidServices = recordArray(sections.paidServicesUsed ?? offChainFindings.paidServices);
  const receipts = recordArray(json.receipts ?? sections.x402PaymentReceipts);
  const toolDiscovery = recordArray(sections.toolDiscoveryLog);
  const antiWashNotes = stringArray(sections.antiWashLegitimacyNotes);
  const score = numeric(report.score, numeric(riskScore.score, 0));
  const confidence = numeric(riskScore.confidence, numeric(executive.confidence, 0));
  const totalCost = numeric(json.totalCost, numeric(executive.totalCost, 0));
  const recommendation = text(
    finalVerdict.recommendation,
    recommendationForVerdict(report.verdict)
  );
  const checkedItems = buildCheckedItems(report, onChainFindings);
  const integrationItems = buildIntegrationItems(integration);

  return (
    <article className="reportPanel humanReportPanel">
      <div className={`reportHero verdict-${verdictClass(report.verdict)}`}>
        <div className="reportHeroCopy">
          <span className="eyebrow">Final recommendation</span>
          <h2>{humanVerdict(report.verdict)}</h2>
          <p>{recommendation}</p>
        </div>
        <div className="scoreDial" style={{ "--score": String(clamp(score, 0, 100)) } as CSSProperties}>
          <strong>{score}</strong>
          <span>risk score</span>
        </div>
      </div>

      <div className="reportQuickGrid">
        <FactCard label="Target" value={shortId(report.targetAddress, 12)} detail={report.targetType} />
        <FactCard label="Confidence" value={`${Math.round(confidence * 100)}%`} detail="How complete the evidence looked" />
        <FactCard label="Total service cost" value={formatMoney(totalCost)} detail="Ace/x402 spend for this run" />
        <FactCard label="Run id" value={shortId(report.runId, 10)} detail={formatDate(report.createdAt)} />
      </div>

      <div className="recommendationBox">
        <strong>What this means</strong>
        <p>{plainMeaning(report.verdict, report.targetType)}</p>
      </div>

      <ReportSection
        title="Why the agent reached this verdict"
        description="These are the main reasons produced by the scoring engine. They are written as user-facing evidence, not raw payloads."
      >
        {reasons.length > 0 ? (
          <ul className="reasonList">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : (
          <EmptyMessage text="No detailed risk reasons were returned for this report." />
        )}
      </ReportSection>

      <ReportSection
        title="What was checked on-chain"
        description="The agent used Synapse RPC to inspect the token or wallet before buying any external intelligence."
      >
        <div className="insightGrid">
          {checkedItems.map((item) => (
            <FactCard key={item.label} {...item} />
          ))}
        </div>
      </ReportSection>

      <ReportSection
        title="Paid intelligence the agent bought"
        description="Each paid call must have a reason. This proves the agent is buying tools because the workflow needs them, not to generate artificial volume."
      >
        {paidReasons.length > 0 ? (
          <div className="serviceCards">
            {paidReasons.map((reason, index) => {
              const matchingService = paidServices.find(
                (service) => text(service.serviceName) === text(reason.serviceName)
              );
              return (
                <div className="serviceCard" key={`${text(reason.serviceName)}-${index}`}>
                  <div>
                    <span className="eyebrow">Service</span>
                    <strong>{friendlyServiceName(text(reason.serviceName))}</strong>
                  </div>
                  <p>{text(reason.reasonForCall, "The workflow selected this service for additional evidence.")}</p>
                  <small>
                    Result: {text(matchingService?.outputSummary, "Service result summary unavailable.")}
                  </small>
                  <span>{formatMoney(numeric(matchingService?.cost ?? reason.estimatedCost, 0))}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyMessage text="No paid Ace services were attached to this report." />
        )}
      </ReportSection>

      <ReportSection
        title="Payment proof"
        description="These cards show whether each service call produced an x402 receipt, which facilitator handled it, and whether it was mock or real."
      >
        {receipts.length > 0 ? (
          <div className="receiptCards">
            {receipts.map((receipt, index) => (
              <div className="receiptCard" key={`${text(receipt.receiptId)}-${index}`}>
                <div className="receiptTopline">
                  <strong>{friendlyServiceName(text(receipt.serviceName))}</strong>
                  <StatusPill value={text(receipt.status, "unknown")} />
                </div>
                <div className="receiptFacts">
                  <span>{formatMoney(numeric(receipt.cost, 0))}</span>
                  <span>{receiptMode(receipt)}</span>
                  <span>{shortId(text(receipt.txSignature ?? receipt.mockReceiptId ?? receipt.receiptId), 9)}</span>
                </div>
                <small>{text(receipt.facilitator, "Facilitator unavailable")}</small>
              </div>
            ))}
          </div>
        ) : (
          <EmptyMessage text="No x402 receipts were stored for this report." />
        )}
      </ReportSection>

      <ReportSection
        title="Sentinel check"
        description="Sentinel is the independent safety check used by the workflow after paid evidence is collected."
      >
        <div className="sentinelSummary">
          <div>
            <span className="eyebrow">Status</span>
            <StatusPill value={text(sentinel.status, "unknown")} />
          </div>
          <p>{text(sentinel.resultSummary, "No Sentinel summary was returned.")}</p>
          <small>{sentinelFlags(sentinel)}</small>
        </div>
      </ReportSection>

      <ReportSection
        title="Data source quality"
        description="This shows whether the report was generated from real configured integrations or mock/local adapters."
      >
        <div className="sourceGrid">
          {integrationItems.map((item) => (
            <FactCard key={item.label} {...item} />
          ))}
        </div>
      </ReportSection>

      <ReportSection
        title="Legitimacy controls"
        description="These controls reduce spam, artificial loops, repeated-target abuse, and paid calls without a reason."
      >
        {antiWashNotes.length > 0 ? (
          <ul className="reasonList compact">
            {antiWashNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : (
          <EmptyMessage text="No anti-wash notes were included in this report." />
        )}
      </ReportSection>

      <ReportSection
        title="Tool discovery"
        description="Tools discovered before the agent selected what to buy."
      >
        {toolDiscovery.length > 0 ? (
          <div className="toolDiscoveryGrid">
            {toolDiscovery.map((tool, index) => (
              <FactCard
                key={`${text(tool.name)}-${index}`}
                label={text(tool.capability, "Tool capability")}
                value={text(tool.name, "Unnamed tool")}
                detail={`${text(tool.protocol, "protocol unknown")} service`}
              />
            ))}
          </div>
        ) : (
          <EmptyMessage text="No SAP tool discovery records were stored in this report." />
        )}
      </ReportSection>

      <ReportSection
        title="Advanced audit data"
        description="For reviewers and engineers: the complete original report payload is still available here. It is collapsed by default so normal users are not forced to read raw data."
      >
        <div className="rawEvidenceGrid">
          <details className="rawEvidenceDisclosure">
            <summary>
              <span>Original Markdown report</span>
              <small>Human-readable export generated by the backend</small>
            </summary>
            <pre className="markdownBox">{report.markdownReport}</pre>
          </details>
          <details className="rawEvidenceDisclosure">
            <summary>
              <span>Full JSON evidence</span>
              <small>Complete structured payload used by this interface</small>
            </summary>
            <pre className="jsonBox">{safeJson(report.jsonReport)}</pre>
          </details>
        </div>
      </ReportSection>

      <div className="reportFooterNote">
        <strong>Generated</strong>
        <span>{formatDate(text(json.generatedAt ?? sections.timestamp ?? report.createdAt))}</span>
        <small>
          Requester: {text(trigger.requester, "not provided")} via {text(trigger.triggerType, "unknown trigger")}
        </small>
      </div>
    </article>
  );
}

function ReportSection({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="plainReportSection">
      <div className="reportSectionHeader">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}

function FactCard({ label, value, detail }: SummaryItem) {
  return (
    <div className="factCard">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

function EmptyMessage({ text: message }: { text: string }) {
  return <div className="emptyReportState">{message}</div>;
}

function buildCheckedItems(report: ReportRow, onChain: AnyRecord): SummaryItem[] {
  if (report.targetType === "token") {
    return [
      {
        label: "Mint authority",
        value: text(asRecord(onChain.tokenMetadata).mintAuthority, "Disabled"),
        detail: "If active, the issuer may be able to mint more supply."
      },
      {
        label: "Freeze authority",
        value: text(asRecord(onChain.tokenMetadata).freezeAuthority, "Disabled"),
        detail: "If active, token accounts may be frozen."
      },
      {
        label: "Top holders",
        value: text(onChain.topHolderCount, "0"),
        detail: `Largest holder: ${percentText(onChain.topHolderPercentage)}`
      },
      {
        label: "Recent transfers",
        value: text(onChain.recentTransferCount, "0"),
        detail: "Recent transfer count found by Synapse RPC."
      },
      {
        label: "Supply",
        value: text(asRecord(onChain.tokenSupply).uiAmountString, "Unavailable"),
        detail: "Current token supply returned by RPC."
      },
      {
        label: "Metadata",
        value: metadataLabel(asRecord(onChain.tokenMetadata)),
        detail: "Name, symbol, links, and authority fields were reviewed."
      }
    ];
  }

  return [
    {
      label: "Transactions",
      value: text(onChain.transactionCount, "0"),
      detail: "Recent wallet transaction count."
    },
    {
      label: "Recent transfers",
      value: text(onChain.recentTransferCount, "0"),
      detail: "Transfer-like activity reviewed."
    },
    {
      label: "Programs used",
      value: text(onChain.uniqueProgramCount, "0"),
      detail: "Diversity of Solana programs touched by the wallet."
    },
    {
      label: "Token mints",
      value: text(onChain.uniqueTokenMintCount, "0"),
      detail: "Different tokens seen in recent wallet activity."
    },
    {
      label: "Account owner",
      value: text(asRecord(onChain.accountInfo).ownerProgram, "Unavailable"),
      detail: "Owner program returned by account info."
    }
  ];
}

function buildIntegrationItems(integration: AnyRecord): SummaryItem[] {
  const synapse = asRecord(integration.synapseRpc);
  const sap = asRecord(integration.sap);
  const ace = asRecord(integration.aceX402);
  const sentinel = asRecord(integration.sentinel);

  return [
    {
      label: "Synapse RPC",
      value: boolLabel(synapse.allReal, "Real", "Mock/mixed"),
      detail: boolLabel(synapse.allSuccessful, "All RPC calls succeeded", "Some RPC calls had errors")
    },
    {
      label: "SAP discovery",
      value: joinedModes(sap.modes),
      detail: "Tool discovery mode used for this report."
    },
    {
      label: "Ace x402",
      value: joinedModes(ace.modes),
      detail: `Payment status: ${joinedModes(ace.paymentStatuses)}`
    },
    {
      label: "Sentinel",
      value: text(sentinel.mode, "unknown"),
      detail: `Status: ${text(sentinel.status, "unknown")}`
    }
  ];
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}

function recordArray(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter((item) => item !== "Unknown")
    : [];
}

function text(value: unknown, fallback = "Unknown"): string {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : fallback;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

function numeric(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function percentText(value: unknown): string {
  const parsed = numeric(value, NaN);
  return Number.isFinite(parsed) ? `${parsed.toFixed(2)}%` : "Unavailable";
}

function metadataLabel(metadata: AnyRecord): string {
  const name = text(metadata.name, "");
  const symbol = text(metadata.symbol, "");
  if (name || symbol) {
    return [name, symbol].filter(Boolean).join(" / ");
  }
  return "Minimal metadata";
}

function boolLabel(value: unknown, yes: string, no: string): string {
  return value === true ? yes : no;
}

function joinedModes(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    return "unknown";
  }
  return value.map((item) => text(item)).join(", ");
}

function receiptMode(receipt: AnyRecord): string {
  const payload = asRecord(receipt.receiptPayload);
  return payload.mock === true || receipt.mockReceiptId ? "mock receipt" : "real receipt";
}

function sentinelFlags(sentinel: AnyRecord): string {
  const flags = stringArray(sentinel.riskFlags);
  if (flags.length === 0) {
    return "No Sentinel risk flags were returned.";
  }
  return `Flags: ${flags.join(", ")}`;
}

function friendlyServiceName(serviceName: string): string {
  return serviceName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function humanVerdict(verdict: string): string {
  if (verdict === "safe") {
    return "Looks safe for normal monitoring";
  }
  if (verdict === "monitor") {
    return "Monitor before taking action";
  }
  if (verdict === "high_risk") {
    return "High risk: review carefully";
  }
  if (verdict === "avoid") {
    return "Avoid this target";
  }
  return "Not enough evidence";
}

function plainMeaning(verdict: string, targetType: string): string {
  if (verdict === "safe") {
    return `The ${targetType} did not show strong warning signs in the collected evidence. Continue normal monitoring.`;
  }
  if (verdict === "monitor") {
    return `The ${targetType} is not automatically rejected, but there are enough weak or incomplete signals to wait, compare sources, and watch future activity.`;
  }
  if (verdict === "high_risk") {
    return `The ${targetType} showed several concerning signals. Treat it as risky until a human reviews the evidence and confirms the context.`;
  }
  if (verdict === "avoid") {
    return `The ${targetType} produced strong risk signals. The safest recommendation is to avoid interaction.`;
  }
  return `The agent did not collect enough reliable evidence to make a confident call.`;
}

function recommendationForVerdict(verdict: string): string {
  if (verdict === "safe") {
    return "Proceed with normal monitoring.";
  }
  if (verdict === "monitor") {
    return "Monitor before acting; review the listed risk signals and receipts.";
  }
  if (verdict === "high_risk") {
    return "Avoid large exposure until the high-risk signals are independently reviewed.";
  }
  if (verdict === "avoid") {
    return "Avoid; risk signals are too strong for autonomous approval.";
  }
  return "Unknown; gather more evidence before taking action.";
}

function verdictClass(verdict: string): string {
  if (verdict === "safe") {
    return "safe";
  }
  if (verdict === "monitor") {
    return "monitor";
  }
  if (verdict === "high_risk") {
    return "high-risk";
  }
  if (verdict === "avoid") {
    return "avoid";
  }
  return "unknown";
}
