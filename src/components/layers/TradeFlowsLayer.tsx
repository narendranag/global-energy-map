import { ArcLayer } from "@deck.gl/layers";
import { BARRELS_PER_TONNE_CRUDE } from "@/lib/scenarios/registry";
import type { Commodity } from "@/lib/scenarios/types";
import {
  TOP_N_PAIRS,
  exporterShare,
  focusPairs,
  importerShare,
  positionPairs,
  topPairs,
  tradeFlowsInRange,
  type Positioned,
  type TradeFlowPair,
  type TradeFlowsData,
} from "@/lib/data/trade-flows";
import { sourceLine } from "@/lib/data/sources";
import {
  TRADE_FLOW_WIDTH,
  tradeFlowMaxWidth,
  tradeFlowSourceColor,
  tradeFlowTargetColor,
  tradeFlowWidth,
} from "@/lib/symbology";
import { joinLines, pct, type TooltipFormatter } from "./tooltip";

export const TRADE_FLOWS_LAYER_ID = "trade-flows";

/** Tonnes → megatonnes, for the tooltip and the width scale's report. */
const MT = (tonnes: number) => tonnes / 1e6;

export interface TradeFlowArc extends TradeFlowPair, Positioned {
  readonly exporterSharePct: number;
  readonly importerSharePct: number;
}

function toArc(data: TradeFlowsData, pair: TradeFlowPair & Positioned): TradeFlowArc {
  return {
    ...pair,
    exporterSharePct: exporterShare(data, pair) * 100,
    importerSharePct: importerShare(data, pair) * 100,
  };
}

export interface TradeFlowsLayerOptions {
  readonly commodity: Commodity;
  /** Selected country (ISO3), or null for the world top-N view. */
  readonly focus: string | null;
  /** Settled map zoom: the width cap tapers with it (Wave 2 polish 1). */
  readonly zoom: number;
}

/**
 * BACI country-pair arcs (S2): with no country focused, only the world's
 * largest `TOP_N_PAIRS` pairs by volume for the active year + commodity are
 * drawn — legibility is the point, and every pair is a hairball otherwise
 * (`trade-flows.ts` documents why 150). With a country focused, every pair
 * touching it above a small floor is drawn instead (`focusPairs`), so
 * "who supplies Japan?" shows Japan's real supplier list, not just whichever
 * of its pairs happen to also be in the world top 150.
 *
 * Width is scaled against the *shown* set's own largest pair, not the
 * world's, so a focused country's smaller flows still use the visible width
 * range instead of collapsing near the minimum. Colour runs light
 * (exporter) → dark (importer), the same convention `LngVoyagesLayer` uses,
 * so a flow's direction reads without a legend; focus view uses a higher,
 * more opaque alpha since it draws far fewer arcs than the world view.
 */
export function buildTradeFlowsLayer(
  data: TradeFlowsData,
  opts: TradeFlowsLayerOptions,
): ArcLayer<TradeFlowArc> {
  const { commodity, focus, zoom } = opts;
  const mode: "world" | "focus" = focus === null ? "world" : "focus";
  const basePairs = focus === null ? topPairs(data, TOP_N_PAIRS).pairs : focusPairs(data, focus);
  const arcs = positionPairs(basePairs).map((p) => toArc(data, p));
  const maxQty = arcs.reduce((m, a) => Math.max(m, a.qty), 0);

  const widthCap = tradeFlowMaxWidth(zoom);
  const sourceColor = tradeFlowSourceColor(commodity, mode);
  const targetColor = tradeFlowTargetColor(commodity, mode);

  return new ArcLayer<TradeFlowArc>({
    id: TRADE_FLOWS_LAYER_ID,
    data: arcs,
    getSourcePosition: (d) => [d.from_lon, d.from_lat],
    getTargetPosition: (d) => [d.to_lon, d.to_lat],
    getSourceColor: [...sourceColor],
    getTargetColor: [...targetColor],
    getWidth: (d) => tradeFlowWidth(d.qty, maxQty, widthCap),
    widthMinPixels: TRADE_FLOW_WIDTH.minPixels,
    widthMaxPixels: widthCap,
    greatCircle: true,
    pickable: true,
    // `data` changes every year/commodity/focus switch already (a new array
    // from the loader), but colour also depends on `mode`/`commodity` alone
    // when the data set is unchanged in shape — keep the trigger regardless
    // of whether that can currently happen, per CLAUDE.md's accessor rule.
    updateTriggers: {
      getSourceColor: [commodity, mode],
      getTargetColor: [commodity, mode],
      getWidth: [maxQty, widthCap],
    },
  });
}

/** True when the layer would draw nothing for `year` — before BACI's 1995 coverage starts. */
export const tradeFlowsHasNoData = (year: number): boolean => !tradeFlowsInRange(year);

export const formatTradeFlowTooltip: TooltipFormatter<TradeFlowArc> = (o, ctx) => {
  const mt = MT(o.qty);
  const kbpd =
    ctx.commodity === "oil"
      ? (o.qty * BARRELS_PER_TONNE_CRUDE) / 365 / 1000
      : null;
  const noun = ctx.commodity === "oil" ? "Crude trade" : "LNG trade";
  return joinLines(
    `${noun}: ${o.exporter_iso3} → ${o.importer_iso3}`,
    `Volume: ${mt.toFixed(2)} Mt${kbpd !== null ? ` (≈ ${kbpd.toFixed(0)} kb/d)` : ""}, ${String(ctx.year)}`,
    `Share of ${o.importer_iso3}'s total imports: ${pct(o.importerSharePct / 100)}`,
    `Share of ${o.exporter_iso3}'s total exports: ${pct(o.exporterSharePct / 100)}`,
    sourceLine("trade"),
  );
};
