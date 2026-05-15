"use client";
import { useState } from "react";
import { MapShell } from "@/components/map/MapShell";
import { useReservesChoropleth } from "@/components/layers/ReservesChoropleth";

export default function Home() {
  const [year] = useState(2020);
  const reserves = useReservesChoropleth({ year });
  const layers = reserves ? [reserves] : [];
  return (
    <main className="h-screen w-screen">
      <MapShell layers={layers} />
    </main>
  );
}
