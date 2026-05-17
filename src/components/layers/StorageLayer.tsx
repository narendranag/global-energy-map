"use client";
import { useEffect, useState } from "react";
import { ScatterplotLayer } from "@deck.gl/layers";
import { query } from "@/lib/duckdb/query";

interface StorageRow extends Record<string, unknown> {
  asset_id: string;
  name: string;
  country_iso3: string;
  lon: number;
  lat: number;
  capacity: number | null;
  operator: string | null;
  status: string | null;
}

export function useStorageLayer(visible: boolean): ScatterplotLayer<StorageRow> | null {
  const [layer, setLayer] = useState<ScatterplotLayer<StorageRow> | null>(null);
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
      const res = await query<StorageRow>(
        `SELECT asset_id, name, country_iso3, lon, lat, capacity, operator, status
         FROM read_parquet('/data/assets.parquet')
         WHERE kind = 'storage'`,
      );
      if (ctrl.cancelled) return;
      const l = new ScatterplotLayer<StorageRow>({
        id: "storage",
        data: res.rows,
        getPosition: (d) => [d.lon, d.lat],
        // Fixed radius — 26k points, deck.gl WebGL2 handles this fine.
        radiusMinPixels: 2,
        radiusMaxPixels: 6,
        getRadius: 3000,
        radiusUnits: "meters",
        getFillColor: [170, 100, 40, 180], // amber-brown
        stroked: false,
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
