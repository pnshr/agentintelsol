"use client";

import { AgentOperations } from "@/components/AgentOperations";
import { FeatureSection } from "@/components/FeatureSection";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";
import { Navbar } from "@/components/Navbar";

const runtimeGlassStyles = `
  .glass-surface,
  .navbar-glass,
  .console-shell,
  .console-sidebar,
  .api-status-banner,
  .metric,
  .panel,
  .analysisForm,
  .identityBand,
  .timeline,
  .listPanel,
  .reportPanel,
  .balanceCard,
  .auditTile,
  .nav-item,
  .dataPanel,
  .resultPanel,
  .notice,
  .detailHeader,
  .tableWrap,
  .checklist,
  .auditFact,
  .wallet-panel {
    backdrop-filter: blur(24px) saturate(1.22) !important;
    -webkit-backdrop-filter: blur(24px) saturate(1.22) !important;
  }

  .console-sidebar,
  .nav-item {
    backdrop-filter: blur(18px) saturate(1.18) !important;
    -webkit-backdrop-filter: blur(18px) saturate(1.18) !important;
  }
`;

export function NebulaPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <style>{runtimeGlassStyles}</style>
      <Navbar />
      <main>
        <AgentOperations />
        <FeatureSection />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
