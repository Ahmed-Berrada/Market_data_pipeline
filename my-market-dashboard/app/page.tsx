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
import type { AssetType } from "@/types/market";

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PipelineDashboard() {
  const [symbol, setSymbol] = useState("AAPL");
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [chartTab, setChartTab] = useState<"candle" | "sma" | "returns">("candle");

  const { ohlcv, indicators, latests, pipeline, loading } = useMarketDashboard(symbol, assetType);

  const lastRun = pipeline?.pipelines?.[0]?.last_run;

  const handleSymbol = (nextSymbol: string, nextType: AssetType) => {
    setSymbol(nextSymbol);
    setAssetType(nextType);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-body)" }}>
      <DashboardNav lastRun={lastRun} />

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 32px" }}>
        <HeroSection />
        <StatsGrid pipeline={pipeline} />

        <MarketTickerSection symbol={symbol} latests={latests} onSelect={handleSymbol} />

        <MarketChartSection
          symbol={symbol}
          assetType={assetType}
          chartTab={chartTab}
          setChartTab={setChartTab}
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
