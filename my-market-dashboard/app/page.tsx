"use client";

import { useState } from "react";
import { ApiReferenceSection } from "@/components/market/ApiReferenceSection";
import { ArchitectureSection } from "@/components/market/ArchitectureSection";
import { DashboardNav, HeroSection, StatsGrid } from "@/components/market/DashboardHeader";
import { LearnedSection, DashboardFooter } from "@/components/market/LearnedAndFooter";
import { MarketChartSection } from "@/components/market/MarketChartSection";
import { MarketTickerSection } from "@/components/market/MarketTickerSection";
import { PipelineSection } from "@/components/market/PipelineSection";
import { useMarketDashboard } from "@/hooks/useMarketDashboard";
import type { AssetType, ChartRange } from "@/types/market";

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PipelineDashboard() {
  const [symbol, setSymbol] = useState("AAPL");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [range, setRange] = useState<ChartRange>("1y");

  const { ohlcv, indicators, latests, pipeline, loading } = useMarketDashboard(symbol, assetType, range);

  const lastRun = pipeline?.pipelines?.[0]?.last_run;

  const handleSymbol = (nextSymbol: string, nextType: AssetType) => {
    setSymbol(nextSymbol);
    setAssetType(nextType);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-body)" }}>
      <DashboardNav lastRun={lastRun} />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(24px, 5vw, 48px) clamp(16px, 5vw, 32px)" }}>
        <HeroSection />
        <StatsGrid pipeline={pipeline} />

        <MarketTickerSection symbol={symbol} latests={latests} onSelect={handleSymbol} />

        <MarketChartSection
          symbol={symbol}
          assetType={assetType}
          range={range}
          setRange={setRange}
          loading={loading}
          ohlcv={ohlcv}
          indicators={indicators}
        />

        <PipelineSection pipeline={pipeline} />
        <ArchitectureSection />
        <ApiReferenceSection />
        <LearnedSection />
        <DashboardFooter />
      </div>
    </div>
  );
}
