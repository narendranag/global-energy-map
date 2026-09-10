import { IconLayer } from "@deck.gl/layers";
import type { PortAsset } from "@/lib/data/assets";
import { sourceLine } from "@/lib/data/sources";
import { ANCHOR_GLYPH, PORT_COLOR, PORT_SIZE, portSize } from "@/lib/symbology";
import { formatCapacity, joinLines, orNa, type TooltipFormatter } from "./tooltip";

export const PORTS_LAYER_ID = "ports";

// Anchor glyph rendered to a data URI (no sprite asset). mask=true so
// getColor controls the tint at runtime.
const ICON_ATLAS =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <path d="${ANCHOR_GLYPH.path}" stroke="white" stroke-width="${ANCHOR_GLYPH.strokeWidth.toString()}" fill="none"/>
  <circle cx="${ANCHOR_GLYPH.ring.cx.toString()}" cy="${ANCHOR_GLYPH.ring.cy.toString()}" r="${ANCHOR_GLYPH.ring.r.toString()}" fill="white"/>
</svg>
`);

const ICON_MAPPING = {
  anchor: { x: 0, y: 0, width: 32, height: 32, anchorX: 16, anchorY: 16, mask: true },
} as const;

export function buildPortsLayer(rows: readonly PortAsset[]): IconLayer<PortAsset> {
  return new IconLayer<PortAsset>({
    id: PORTS_LAYER_ID,
    data: rows,
    iconAtlas: ICON_ATLAS,
    iconMapping: ICON_MAPPING,
    getIcon: () => "anchor",
    getPosition: (d) => [d.lon, d.lat],
    getSize: (d) => portSize(d.capacity),
    sizeUnits: "pixels",
    sizeMinPixels: PORT_SIZE.minPixels,
    sizeMaxPixels: PORT_SIZE.maxPixels,
    getColor: [...PORT_COLOR],
    pickable: true,
  });
}

export const formatPortTooltip: TooltipFormatter<PortAsset> = (o) =>
  joinLines(
    `Port: ${o.name}`,
    `Country: ${o.country_iso3}`,
    `Operator: ${orNa(o.operator)}`,
    `Status: ${orNa(o.status)}`,
    o.capacity !== null && `Capacity: ${formatCapacity(o.capacity, o.capacity_unit)}`,
    sourceLine("ports", o.source),
  );
