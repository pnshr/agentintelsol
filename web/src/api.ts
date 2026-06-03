import type {
  AnalyzeRequest,
  AnalyzeResult,
  BalanceSummary,
  DashboardRun,
  DashboardSummary,
  IntegrationStatus,
  PaymentReceipt,
  ProductReadiness,
  AuditBundle,
  ReportRow,
  RunDetail
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3001";
const API_AUTH_TOKEN = process.env.NEXT_PUBLIC_API_AUTH_TOKEN ?? "";
const REQUEST_TIMEOUT_MS = 12000;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(API_AUTH_TOKEN ? { Authorization: `Bearer ${API_AUTH_TOKEN}` } : {}),
        ...(options?.headers ?? {})
      },
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        `API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s: ${API_BASE_URL}${path}`
      );
    }

    throw new Error(
      `Unable to reach AgentIntel API at ${API_BASE_URL}${path}. ${
        error instanceof Error ? error.message : "Network request failed"
      }`
    );
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    const parsed = parseErrorPayload(text);
    throw new Error(parsed || `Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  getHealth: () =>
    request<{
      ok: boolean;
      service: string;
      env: string;
      database?: { ok: boolean; message: string };
    }>("/api/health"),
  getSummary: () => request<DashboardSummary>("/api/dashboard/summary"),
  getBalances: () => request<BalanceSummary>("/api/balances"),
  getRuns: async () => {
    const data = await request<{ runs: DashboardRun[] }>("/api/dashboard/runs");
    return data.runs;
  },
  getRunDetail: (runId: string) =>
    request<RunDetail>(`/api/dashboard/runs/${runId}`),
  getAuditBundle: (runId: string) =>
    request<AuditBundle>(`/api/audit/${runId}`),
  getIntegrationStatus: () =>
    request<IntegrationStatus>("/api/integration-status"),
  getReadiness: () => request<ProductReadiness>("/api/readiness"),
  getReceipts: async () => {
    const data = await request<{ receipts: PaymentReceipt[] }>(
      "/api/dashboard/receipts"
    );
    return data.receipts;
  },
  getReports: async () => {
    const data = await request<{ reports: ReportRow[] }>(
      "/api/dashboard/reports"
    );
    return data.reports;
  },
  analyze: (input: AnalyzeRequest) =>
    request<AnalyzeResult>("/api/analyze", {
      method: "POST",
      body: JSON.stringify(input)
    }),
  scheduledDemoRun: () =>
    request<AnalyzeResult>("/api/scheduled-demo-run", {
      method: "POST"
    })
};

function parseErrorPayload(text: string): string {
  if (!text) {
    return "";
  }

  try {
    const payload = JSON.parse(text) as { message?: unknown; error?: unknown };
    if (typeof payload.message === "string") {
      return payload.message;
    }
    if (typeof payload.error === "string") {
      return payload.error;
    }
  } catch {
    return text;
  }

  return text;
}
