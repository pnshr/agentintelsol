import { motion } from "framer-motion";
import { ArrowRight, PlayCircle, Radar } from "lucide-react";
import { StatsPreviewCard } from "@/components/StatsPreviewCard";

export function HeroSection() {
  return (
    <section className="mx-auto grid w-[min(1120px,calc(100%-32px))] items-center gap-10 pb-14 pt-16 lg:grid-cols-[1fr_0.92fr] lg:pb-20 lg:pt-20">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.65, delay: 0.08 }}
        className="max-w-3xl"
      >
        <div className="inline-flex items-center gap-2 rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-sm font-semibold text-sky-100">
          <Radar className="size-4" aria-hidden="true" />
          On-chain intelligence layer
        </div>
        <h1 className="mt-6 text-balance text-5xl font-semibold tracking-[-0.03em] text-slate-50 sm:text-6xl lg:text-7xl">
          One Command Center for Your On-Chain Portfolio
        </h1>
        <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-300">
          Track wallets, positions, risks, and flows across chains in real time.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="#dashboard"
            className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-sky-300 px-5 font-semibold text-slate-950 shadow-[0_0_34px_rgba(56,189,248,0.26)] transition hover:bg-sky-200 hover:shadow-[0_0_46px_rgba(56,189,248,0.42)]"
          >
            Launch Dashboard
            <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
          </a>
          <a
            href="#analytics"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/10 px-5 font-semibold text-slate-100 transition hover:border-violet-300/40 hover:bg-white/15"
          >
            <PlayCircle className="size-4" aria-hidden="true" />
            View Demo
          </a>
        </div>
        <div className="mt-8 flex flex-wrap gap-2 text-sm text-slate-400">
          {["Solana", "Ethereum", "Bitcoin", "Base", "Arbitrum"].map((chain) => (
            <span key={chain} className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1">
              {chain}
            </span>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.18 }}
      >
        <StatsPreviewCard />
      </motion.div>
    </section>
  );
}
