"use client";
import { useEffect, useState } from "react";
import { IconLayer } from "@deck.gl/layers";
import { query } from "@/lib/duckdb/query";

interface PortRow extends Record<string, unknown> {
  asset_id: string;
  name: string;
  country_iso3: string;
  lon: number;
  lat: number;
  capacity: number | null;
  operator: string | null;
  status: string | null;
}

// Inline SVG anchor glyph. mask=true so getColor controls the tint at runtime.
const ICON_ATLAS =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <path d="M16 4 L16 28 M10 10 L22 10 M6 22 Q16 32 26 22" stroke="white" stroke-width="3" fill="none"/>
  <circle cx="16" cy="7" r="2.5" fill="white"/>
</svg>
`);

const ICON_MAPPING = {
  anchor: { x: 0, y: 0, width: 32, height: 32, anchorX: 16, anchorY: 16, mask: true },
} as const;

export function usePortsLayer(visible: boolean): IconLayer<PortRow> | null {
  const [layer, setLayer] = useState<IconLayer<PortRow> | null>(null);
  useEffect(() => {
    const ctrl = { cancelled: false };
    if (!visible) {
      void Promise.resolve().then(() => {
        if (!ctrl.cancelled) setLayer(null);
      });
      return () => {
        ctrl.cancelled = true;
      };
    }
    void (async () => {
      const res = await query<PortRow>(
        `SELECT asset_id, name, country_iso3, lon, lat, capacity, operator, status
         FROM read_parquet('/data/assets.parquet')
         WHERE kind = 'port'`,
      );
      if (ctrl.cancelled) return;
      const l = new IconLayer<PortRow>({
        id: "ports",
        data: res.rows,
        iconAtlas: ICON_ATLAS,
        iconMapping: ICON_MAPPING,
        getIcon: () => "anchor",
        getPosition: (d) => [d.lon, d.lat],
        getSize: (d) => (d.capacity != null && d.capacity > 0 ? 14 + Math.sqrt(d.capacity) * 0.5 : 16),
        sizeUnits: "pixels",
        sizeMinPixels: 12,
        sizeMaxPixels: 28,
        getColor: [60, 80, 100, 230],   // slate
        pickable: true,
      });
      setLayer(l);
    })();
    return () => {
      ctrl.cancelled = true;
    };
  }, [visible]);
  return layer;
}
