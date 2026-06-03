import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Eye,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  WalletCards
} from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import {
  alerts,
  netFlowData,
  portfolioData,
  riskData,
  strategyPerformanceData,
  topAssets,
  walletActivityData
} from "@/data/mockData";
import { ChartFrame } from "@/components/ChartFrame";

const tooltipStyle = {
  background: "rgba(15,23,42,0.94)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 8,
  color: "#F8FAFC"
};

const alertIcons = {
  transfer: ArrowUpRight,
  wallet: WalletCards,
  volatility: AlertTriangle,
  shield: ShieldCheck
};

export function DashboardGrid() {
  return (
    <section id="dashboard" className="mx-auto w-[min(1120px,calc(100%-32px))] scroll-mt-28">
      <div id="analytics" className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-200">Analytics dashboard</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
            Portfolio, flows, and risk in one surface
          </h2>
        </div>
        <p className="max-w-md text-sm leading-6 text-slate-400">
          Mock data tuned for visual fidelity, with production-shaped cards and responsive chart containers.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <PortfolioOverview />
        <WalletActivityCard />
        <RiskExposureCard />
        <NetFlowsCard />
        <AlertsCard />
        <TopAssetsCard />
        <StrategyPerformanceCard />
      </div>
    </section>
  );
}

function CardTitle({
  eyebrow,
  title,
  icon: Icon
}: {
  eyebrow: string;
  title: string;
  icon: typeof TrendingUp;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</p>
        <h3 className="mt-2 text-xl font-semibold tracking-tight text-slate-50">{title}</h3>
      </div>
      <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-sky-300/20 bg-sky-300/10 text-sky-200">
        <Icon className="size-5" aria-hidden="true" />
      </span>
    </div>
  );
}

function PortfolioOverview() {
  return (
    <GlassCard className="lg:col-span-7">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <CardTitle eyebrow="Portfolio overview" title="Balance momentum" icon={TrendingUp} />
        <div className="flex flex-wrap gap-2">
          {["1D", "7D", "1M", "1Y"].map((range) => (
            <button
              key={range}
              type="button"
              className={`rounded-lg border px-3 py-1 text-sm font-semibold transition ${
                range === "1M"
                  ? "border-sky-300/45 bg-sky-300/15 text-sky-100"
                  : "border-white/10 bg-white/[0.06] text-slate-400 hover:text-slate-100"
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <strong className="text-3xl font-semibold text-slate-50">$128,430</strong>
          <p className="mt-1 text-sm text-slate-400">Aggregated across 14 wallets</p>
        </div>
        <span className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-3 py-1 text-sm font-semibold text-emerald-200">
          +12.4%
        </span>
      </div>
      <ChartFrame className="mt-6 h-64">
        {({ width, height }) => (
          <AreaChart width={width} height={height} data={portfolioData} margin={{ top: 8, right: 6, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.48} />
                <stop offset="52%" stopColor="#A78BFA" stopOpacity={0.16} />
                <stop offset="95%" stopColor="#38BDF8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#94A3B8", fontSize: 12 }} />
            <YAxis hide domain={["dataMin - 8000", "dataMax + 8000"]} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(203,213,225,0.16)" }} />
            <Area
              type="monotone"
              dataKey="balance"
              stroke="#38BDF8"
              strokeWidth={3}
              fill="url(#portfolioGradient)"
              dot={false}
            />
          </AreaChart>
        )}
      </ChartFrame>
    </GlassCard>
  );
}

function WalletActivityCard() {
  return (
    <GlassCard className="lg:col-span-5" delay={0.04}>
      <CardTitle eyebrow="Wallet activity" title="Active wallets" icon={WalletCards} />
      <div id="wallets" className="mt-6 scroll-mt-28">
        <strong className="text-5xl font-semibold tracking-tight text-slate-50">14</strong>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
          Wallet activity is up across Solana and Ethereum, led by stablecoin routing and treasury rebalancing.
        </p>
      </div>
      <ChartFrame className="mt-6 h-44">
        {({ width, height }) => (
          <LineChart width={width} height={height} data={walletActivityData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#94A3B8", fontSize: 12 }} />
            <YAxis hide domain={[6, 16]} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(203,213,225,0.16)" }} />
            <Line type="monotone" dataKey="wallets" stroke="#A78BFA" strokeWidth={3} dot={false} />
          </LineChart>
        )}
      </ChartFrame>
    </GlassCard>
  );
}

function RiskExposureCard() {
  return (
    <GlassCard className="lg:col-span-4" delay={0.08}>
      <CardTitle eyebrow="Risk exposure" title="Current state" icon={ShieldAlert} />
      <div className="relative mx-auto mt-6 h-52 max-w-[260px]">
        <ChartFrame className="h-full w-full">
          {({ width, height }) => (
            <PieChart width={width} height={height}>
              <Pie
                data={riskData}
                dataKey="value"
                nameKey="name"
                innerRadius="68%"
                outerRadius="88%"
                paddingAngle={5}
                stroke="rgba(15,23,42,0.8)"
                strokeWidth={3}
              >
                {riskData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          )}
        </ChartFrame>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <span className="text-sm text-slate-400">Exposure</span>
            <strong className="block text-2xl font-semibold text-violet-100">Medium</strong>
          </div>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        {riskData.map((risk) => (
          <div
            key={risk.name}
            className={`rounded-lg border px-3 py-2 text-center ${
              risk.name === "Medium" ? "border-violet-300/40 bg-violet-300/15" : "border-white/10 bg-white/[0.05]"
            }`}
          >
            <span className="block text-xs text-slate-400">{risk.name}</span>
            <strong className="mt-1 block text-sm text-slate-100">{risk.value}%</strong>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function NetFlowsCard() {
  return (
    <GlassCard className="lg:col-span-8" delay={0.12}>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <CardTitle eyebrow="Net flows" title="Inflows and outflows" icon={ArrowDownRight} />
        <div className="grid grid-cols-2 gap-3 text-right">
          <div>
            <span className="text-xs text-slate-400">Inflow</span>
            <strong className="block text-lg text-emerald-200">+$115.2K</strong>
          </div>
          <div>
            <span className="text-xs text-slate-400">Outflow</span>
            <strong className="block text-lg text-rose-200">-$57.5K</strong>
          </div>
        </div>
      </div>
      <ChartFrame className="mt-6 h-56">
        {({ width, height }) => (
          <BarChart width={width} height={height} data={netFlowData} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#94A3B8", fontSize: 12 }} />
            <YAxis hide />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Bar dataKey="inflow" fill="#38BDF8" radius={[8, 8, 0, 0]} />
            <Bar dataKey="outflow" fill="#A78BFA" radius={[0, 0, 8, 8]} />
          </BarChart>
        )}
      </ChartFrame>
    </GlassCard>
  );
}

function AlertsCard() {
  return (
    <GlassCard className="lg:col-span-5" delay={0.16}>
      <div id="alerts" className="scroll-mt-28">
        <CardTitle eyebrow="Alerts" title="Signal queue" icon={Bell} />
      </div>
      <div className="mt-6 grid gap-3">
        {alerts.map((alert) => {
          const Icon = alertIcons[alert.type as keyof typeof alertIcons];
          return (
            <div key={alert.title} className="grid grid-cols-[40px_1fr_auto] items-start gap-3 border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
              <span className="grid size-10 place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-sky-200">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <strong className="block text-sm font-semibold text-slate-100">{alert.title}</strong>
                <span className="mt-1 block text-sm text-slate-400">{alert.detail}</span>
              </div>
              <span className="whitespace-nowrap text-xs text-slate-500">{alert.timestamp}</span>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

function TopAssetsCard() {
  return (
    <GlassCard className="lg:col-span-7" delay={0.2}>
      <CardTitle eyebrow="Top assets" title="Tracked positions" icon={Eye} />
      <div className="mt-5 grid gap-3">
        {topAssets.map((asset) => (
          <div key={asset.symbol} className="grid grid-cols-[64px_1fr_72px] items-center gap-3 border-t border-white/10 pt-3 first:border-t-0 first:pt-0 sm:grid-cols-[72px_1fr_96px_120px]">
            <div>
              <strong className="block text-lg text-slate-50">{asset.symbol}</strong>
              <span className="text-xs text-slate-500">Asset</span>
            </div>
            <div>
              <span className="text-xs text-slate-500">Price</span>
              <strong className="block text-sm text-slate-100">{asset.price}</strong>
            </div>
            <span className={`text-sm font-semibold ${asset.change.startsWith("+") ? "text-emerald-200" : "text-slate-300"}`}>
              {asset.change}
            </span>
            <ChartFrame className="hidden h-9 sm:block">
              {({ width, height }) => (
                <LineChart width={width} height={height} data={asset.sparkline.map((value, index) => ({ index, value }))}>
                  <Line type="monotone" dataKey="value" stroke="#38BDF8" strokeWidth={2} dot={false} />
                </LineChart>
              )}
            </ChartFrame>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function StrategyPerformanceCard() {
  return (
    <GlassCard className="lg:col-span-12" delay={0.24}>
      <div className="grid gap-6 lg:grid-cols-[0.62fr_1fr] lg:items-center">
        <div>
          <CardTitle eyebrow="Strategy performance" title="Adaptive routing edge" icon={TrendingUp} />
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.05] p-4">
              <span className="text-sm text-slate-400">Win rate</span>
              <strong className="mt-2 block text-3xl text-slate-50">72%</strong>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.05] p-4">
              <span className="text-sm text-slate-400">PnL</span>
              <strong className="mt-2 block text-3xl text-emerald-200">+$18.7K</strong>
            </div>
          </div>
        </div>
        <ChartFrame className="h-56">
          {({ width, height }) => (
            <AreaChart width={width} height={height} data={strategyPerformanceData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="strategyGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#A78BFA" stopOpacity={0.42} />
                  <stop offset="95%" stopColor="#A78BFA" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#94A3B8", fontSize: 12 }} />
              <YAxis hide />
              <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: "rgba(203,213,225,0.16)" }} />
              <Area type="monotone" dataKey="pnl" stroke="#A78BFA" strokeWidth={3} fill="url(#strategyGradient)" dot={false} />
            </AreaChart>
          )}
        </ChartFrame>
      </div>
    </GlassCard>
  );
}
