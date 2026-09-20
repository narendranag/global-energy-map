"use client";
import { loadTradeFlows, focusPairs, tradeFlowsInRange } from "@/lib/data/trade-flows";
import { countryBounds } from "@/lib/geo/bounds";
import { flowsFitBounds } from "@/lib/geo/flows-bounds";
import { countryAnchor } from "@/lib/geo/country-anchors";
import type { Commodity } from "@/lib/scenarios/types";
import { FIT_MAX_ZOOM, type CameraPadding } from "./camera";
import { peekAppStore } from "./store";

export interface InitialFitInput {
  readonly focus: string;
  readonly year: number;
  readonly commodity: Commodity;
  /** True when the trade-flow arc layer is on for this load. */
  readonly tradeFlows: boolean;
  readonly padding: Partial<CameraPadding>;
}

/**
 * The load-time camera fit for a shared `?focus=` link.
 *
 * Without the trade-flow layer this is S0's rule unchanged: fit the country.
 * With it on, fit the country **and its largest partners' anchors**, because
 * a focus in Flows is a question about the arcs and framing the country alone
 * pushes every one of them off screen (Wave 2 polish 1). The trade rows come
 * from the same cached loader the layer itself uses, so this costs no extra
 * fetch — the layer is on, so that read is already happening.
 *
 * Falls back to the country's own bounds if the trade read fails or the
 * country has no pairs that year, and to a flyTo at the country anchor if we
 * hold no polygon for it at all (B1).
 */
export async function requestInitialFit(input: InitialFitInput): Promise<void> {
  const { focus, year, commodity, tradeFlows, padding } = input;
  const store = peekAppStore();
  if (store === null) return;

  const bounds = await countryBounds(focus);
  if (bounds === null) {
    const anchor = countryAnchor(focus);
    if (anchor === undefined) return;
    store.requestCamera({ kind: "flyTo", lon: anchor[0], lat: anchor[1], zoom: FIT_MAX_ZOOM });
    return;
  }

  let fitted = bounds;
  if (tradeFlows && tradeFlowsInRange(year)) {
    try {
      const data = await loadTradeFlows(year, commodity);
      // focusPairs is already sorted by volume, largest first.
      fitted = flowsFitBounds(
        bounds,
        focusPairs(data, focus).map((p) => p.partner_iso3),
      );
    } catch {
      // A failed trade read is not a reason to leave the camera where it was.
    }
  }
  store.requestCamera({ kind: "fitBounds", bounds: fitted, padding });
}
