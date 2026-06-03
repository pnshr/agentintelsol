import { Activity, AlertTriangle, ShieldCheck, WalletCards } from "lucide-react";
import {
  Area,
  AreaChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { ChartFrame } from "@/components/ChartFrame";
import { heroMetrics, heroPreviewData } from "@/data/mockData";

const metricIcons = [WalletCards, ShieldCheck, Activity, AlertTriangle];

export function StatsPreviewCard() {
  return (
    <div className="glass-surface relative overflow-hidden rounded-lg p-5 sm:p-6">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/80 to-transparent" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">Live portfolio preview</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-50">Command signal</h2>
        </div>
        <span className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-200">
          Synced
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5">
        {heroMetrics.map((metric, index) => {
          const Icon = metricIcons[index];
          return (
            <div key={metric.label} className="min-w-0 border-t border-white/10 pt-4">
              <div className="flex items-center gap-2 text-slate-400">
                <Icon className="size-4 text-sky-300" aria-hidden="true" />
                <span className="text-xs font-medium uppercase tracking-[0.18em]">{metric.label}</span>
              </div>
              <strong className="mt-2 block truncate text-2xl font-semibold text-slate-50">{metric.value}</strong>
              <span className="mt-1 block text-sm text-slate-400">{metric.detail}</span>
            </div>
          );
        })}
      </div>

      <ChartFrame className="mt-6 h-40 rounded-lg border border-white/10 bg-slate-950/25 p-3">
        {({ width, height }) => (
          <AreaChart width={width} height={height} data={heroPreviewData} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
            <defs>
              <linearGradient id="heroPreview" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.56} />
                <stop offset="95%" stopColor="#A78BFA" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" hide />
            <YAxis hide domain={["dataMin - 10", "dataMax + 10"]} />
            <Tooltip
              cursor={{ stroke: "rgba(203,213,225,0.16)" }}
              contentStyle={{
                background: "rgba(15,23,42,0.92)",
                border: "1px solid rgba(255,255,255,0.16)",
                borderRadius: 8,
                color: "#F8FAFC"
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#38BDF8"
              strokeWidth={3}
              fill="url(#heroPreview)"
              dot={false}
            />
          </AreaChart>
        )}
      </ChartFrame>
    </div>
  );
}
