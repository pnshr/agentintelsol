import { FormEvent, useState } from "react";
import { api } from "../api";
import { StatusPill } from "../components/StatusPill";
import { formatMoney, shortId } from "../format";
import type { AnalyzeRequest, AnalyzeResult } from "../types";

const defaultToken = "So11111111111111111111111111111111111111112";

export function NewAnalysisPage({
  onRunCreated
}: {
  onRunCreated: (runId: string, reportId: string | null) => void;
}) {
  const [targetType, setTargetType] =
    useState<AnalyzeRequest["targetType"]>("token");
  const [targetAddress, setTargetAddress] = useState(defaultToken);
  const [triggerType, setTriggerType] =
    useState<AnalyzeRequest["triggerType"]>("api");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await api.analyze({
        targetType,
        targetAddress,
        triggerType,
        requester: "dashboard"
      });
      setResult(response);

      if (response.status === "completed") {
        onRunCreated(response.runId, response.reportId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div className="pageHeader">
        <div>
          <h1>New Analysis</h1>
          <p>Submit a Solana token mint or wallet address</p>
        </div>
      </div>

      <form className="analysisForm" onSubmit={submit}>
        <label>
          Target type
          <select
            value={targetType}
            onChange={(event) =>
              setTargetType(event.target.value as AnalyzeRequest["targetType"])
            }
          >
            <option value="token">Token</option>
            <option value="wallet">Wallet</option>
          </select>
        </label>
        <label>
          Target address
          <input
            value={targetAddress}
            onChange={(event) => setTargetAddress(event.target.value)}
            placeholder="Solana public key"
          />
        </label>
        <label>
          Trigger type
          <select
            value={triggerType}
            onChange={(event) =>
              setTriggerType(event.target.value as AnalyzeRequest["triggerType"])
            }
          >
            <option value="api">API</option>
            <option value="manual">Manual</option>
            <option value="scheduled">Scheduled</option>
            <option value="agent_request">Agent request</option>
          </select>
        </label>
        <button className="primaryButton" type="submit" disabled={loading}>
          {loading ? "Running workflow..." : "Start analysis"}
        </button>
      </form>

      {error && <div className="notice error">{error}</div>}
      {result && (
        <div className="resultPanel">
          <div className="resultLine">
            <strong>Run</strong>
            <span>{shortId(result.runId)}</span>
            <StatusPill value={result.status} />
          </div>
          {result.report && (
            <div className="resultGrid">
              <span>Verdict: {result.report.verdict}</span>
              <span>Score: {result.report.score}</span>
              <span>
                Cost: {formatMoney(Number(result.report.jsonReport.totalCost ?? 0))}
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
