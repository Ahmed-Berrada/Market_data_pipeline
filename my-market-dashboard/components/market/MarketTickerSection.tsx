import { CRYPTOS, STOCKS } from "@/lib/market/constants";
import { SectionLabel } from "@/components/market/Primitives";
import { TickerCard } from "@/components/market/TickerCard";
import type { AssetType, Latest } from "@/types/market";

export function MarketTickerSection({
  symbol,
  latests,
  onSelect,
}: {
  symbol: string;
  latests: Record<string, Latest>;
  onSelect: (symbol: string, type: AssetType) => void;
}) {
  return (
    <div style={{ marginBottom: "clamp(32px, 8vw, 48px)" }}>
      <SectionLabel>Equities · Click to chart</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: "clamp(6px, 2vw, 8px)", marginBottom: 16, position: "relative" }}>
        {STOCKS.map((s) => (
          <div key={s} style={{ position: "relative" }}>
            <TickerCard symbol={s} latest={latests[s] ?? null} onClick={() => onSelect(s, "stock")} active={symbol === s} />
          </div>
        ))}
      </div>

      <SectionLabel>Crypto · Click to chart</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(80px, 1fr))", gap: "clamp(6px, 2vw, 8px)" }}>
        {CRYPTOS.map((s) => (
          <div key={s} style={{ position: "relative" }}>
            <TickerCard symbol={s} latest={latests[s] ?? null} onClick={() => onSelect(s, "crypto")} active={symbol === s} />
          </div>
        ))}
      </div>
    </div>
  );
}

