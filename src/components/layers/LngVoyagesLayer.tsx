import { ArcLayer } from "@deck.gl/layers";
import type { PositionedVoyage } from "@/lib/data/voyages";
import { sourceLine } from "@/lib/data/sources";
import type { LngImportImpact } from "@/lib/scenarios/types";
import {
  VOYAGE_WIDTH,
  voyageSourceColor,
  voyageTargetColor,
  voyageWidth,
} from "@/lib/symbology";
import { joinLines, type TooltipFormatter } from "./tooltip";

export const LNG_VOYAGES_LAYER_ID = "lng-voyages";

/** Approximate LNG density, t per m³ (cbm → tonnes). */
const LNG_T_PER_CBM = 0.4245;

/**
 * Great-circle arcs from export to import terminal. Both ends turn red when
 * the destination terminal (`to_terminal`, the voyage ↔ terminal join key) is
 * exposed under the active scenario.
 */
export function buildLngVoyagesLayer(
  voyages: readonly PositionedVoyage[],
  impactByTerminalName?: ReadonlyMap<string, LngImportImpact>,
): ArcLayer<PositionedVoyage> {
  return new ArcLayer<PositionedVoyage>({
    id: LNG_VOYAGES_LAYER_ID,
    data: voyages,
    getSourcePosition: (d) => [d.from_lon, d.from_lat],
    getTargetPosition: (d) => [d.to_lon, d.to_lat],
    getSourceColor: (d) => [...voyageSourceColor(impactByTerminalName?.get(d.to_terminal)?.shareAtRisk)],
    getTargetColor: (d) => [...voyageTargetColor(impactByTerminalName?.get(d.to_terminal)?.shareAtRisk)],
    getWidth: (d) => voyageWidth(d.amount_cbm),
    widthMinPixels: VOYAGE_WIDTH.minPixels,
    widthMaxPixels: VOYAGE_WIDTH.maxPixels,
    greatCircle: true,
    pickable: true,
    // `data` is unchanged on a scenario switch, and deck.gl does not re-run
    // accessors for new closures — the triggers force the recolour.
    updateTriggers: {
      getSourceColor: [impactByTerminalName],
      getTargetColor: [impactByTerminalName],
    },
  });
}

export const formatLngVoyageTooltip: TooltipFormatter<PositionedVoyage> = (o) => {
  const mt = (o.amount_cbm * LNG_T_PER_CBM) / 1e6;
  return joinLines(
    `LNG voyage: ${o.from_terminal} → ${o.to_terminal}`,
    `From: ${o.from_country} (${o.from_country_iso3})`,
    `To:   ${o.to_country} (${o.to_country_iso3})`,
    `Dates: ${o.start_date} → ${o.end_date}`,
    `Cargo: ${o.amount_cbm.toLocaleString("en-US")} cbm  (≈ ${mt.toFixed(3)} Mt)`,
    `Confidence: ${o.confidence_score.toString()}/5`,
    sourceLine("lng_voyages"),
  );
};
