import { useCallback, useEffect, useRef, useState } from "react";
import { CRYPTOS, STOCKS } from "@/lib/market/constants";
import { fetchChartData, fetchLatest, fetchPipelineStatus } from "@/lib/market/api";
import type { AssetType, ChartRange, Indicator, Latest, OHLCV, PipelineStatus } from "@/types/market";

export function useMarketDashboard(symbol: string, assetType: AssetType, range: ChartRange) {
  const [ohlcv, setOhlcv] = useState<OHLCV[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [latests, setLatests] = useState<Record<string, Latest>>({});
  const [pipeline, setPipeline] = useState<PipelineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const initialized = useRef(false);

  const loadChart = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchChartData(symbol, assetType, range);
      setOhlcv(data.ohlcv.data ?? []);
      setIndicators(data.indicators?.data ?? []);
    } catch {
      setOhlcv([]);
      setIndicators([]);
    } finally {
      setLoading(false);
    }
  }, [assetType, range, symbol]);

  const loadAllLatest = useCallback(async () => {
    const assets = [
      ...STOCKS.map((s) => ({ symbol: s, type: "stock" as const })),
      ...CRYPTOS.map((s) => ({ symbol: s, type: "crypto" as const })),
    ];

    await Promise.allSettled(
      assets.map(async ({ symbol: assetSymbol, type }) => {
        const latest = await fetchLatest(assetSymbol, type);
        if (latest) {
          setLatests((prev) => ({ ...prev, [assetSymbol]: latest }));
        }
      }),
    );
  }, []);

  const loadPipeline = useCallback(async () => {
    try {
      setPipeline(await fetchPipelineStatus());
    } catch {
      setPipeline(null);
    }
  }, []);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    loadAllLatest();
    loadPipeline();
  }, [loadAllLatest, loadPipeline]);

  useEffect(() => {
    loadChart();
  }, [loadChart]);

  return {
    ohlcv,
    indicators,
    latests,
    pipeline,
    loading,
  };
}
