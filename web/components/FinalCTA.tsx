import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

export function FinalCTA() {
  return (
    <section className="mx-auto w-[min(1120px,calc(100%-32px))] pb-16">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="glass-surface glass-card relative overflow-hidden p-8 sm:p-10 lg:p-12"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-300/80 to-transparent" />
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-sky-200">Ready for execution</p>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
              Run the agent, inspect the evidence, keep the premium view.
            </h2>
            <p className="mt-4 text-pretty text-base leading-7 text-slate-300">
              The interface now keeps the previous operational features while preserving the frosted dashboard design.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
            <a
              href="#dashboard"
              className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-slate-50 px-5 font-semibold text-slate-950 transition hover:bg-sky-100"
            >
              Open Console
              <ArrowRight className="size-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
            </a>
            <a
              href="#dashboard"
              className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/15 bg-white/10 px-5 font-semibold text-slate-100 transition hover:border-sky-300/40 hover:bg-white/15"
            >
              New Analysis
            </a>
          </div>
        </div>
      </motion.div>
    </section>
  );
}
