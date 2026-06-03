import { Activity, Network, ShieldCheck } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { featureCards } from "@/data/mockData";

const featureIcons = {
  activity: Activity,
  shield: ShieldCheck,
  network: Network
};

export function FeatureSection() {
  return (
    <section className="mx-auto w-[min(1120px,calc(100%-32px))] py-16">
      <div className="mb-6 max-w-2xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-200">Agent capabilities</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
          The control surface for real agent operations
        </h2>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {featureCards.map((feature, index) => {
          const Icon = featureIcons[feature.icon as keyof typeof featureIcons];
          return (
            <GlassCard key={feature.title} delay={index * 0.05}>
              <span className="grid size-11 place-items-center rounded-lg border border-violet-300/25 bg-violet-300/12 text-violet-100">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 text-xl font-semibold text-slate-50">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">{feature.description}</p>
            </GlassCard>
          );
        })}
      </div>
    </section>
  );
}
