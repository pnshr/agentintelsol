"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { API_BASE_URL, api } from "@/src/api";

type ApiState =
  | { status: "loading"; message: string }
  | { status: "ready"; message: string }
  | { status: "error"; message: string };

export function ApiStatusBanner({ refreshKey }: { refreshKey: number }) {
  const [state, setState] = useState<ApiState>({
    status: "loading",
    message: "Checking AgentIntel API"
  });

  useEffect(() => {
    let mounted = true;
    setState({ status: "loading", message: "Checking AgentIntel API" });

    api
      .getHealth()
      .then((health) => {
        if (mounted) {
          setState({
            status: "ready",
            message: `${health.service} is ${health.ok ? "online" : "responding"} (${health.env})`
          });
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : "AgentIntel API is unavailable"
          });
        }
      });

    return () => {
      mounted = false;
    };
  }, [refreshKey]);

  const Icon =
    state.status === "ready"
      ? CheckCircle2
      : state.status === "error"
        ? AlertTriangle
        : Activity;

  return (
    <div
      className={`api-status-banner mb-7 grid gap-3 border p-4 sm:grid-cols-[auto_1fr] sm:items-center ${
        state.status === "ready"
          ? "api-status-ready border-emerald-300/25 bg-emerald-300/10"
          : state.status === "error"
            ? "api-status-error border-rose-300/30 bg-rose-300/10"
            : "api-status-loading border-sky-300/20 bg-sky-300/10"
      }`}
    >
      <span className="status-icon grid size-11 place-items-center border border-white/10 bg-white/[0.06]">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <strong className="block text-sm text-slate-100">API: {API_BASE_URL}</strong>
        <span className="mt-1 block break-words text-sm text-slate-400">{state.message}</span>
      </div>
    </div>
  );
}
