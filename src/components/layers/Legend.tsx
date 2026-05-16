"use client";

export function Legend() {
  return (
    <div className="space-y-1 text-[10px] leading-tight text-slate-600">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-6 rounded bg-gradient-to-r from-slate-200 to-emerald-700" />
        <span>Reserves: low → high</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-red-600" />
        <span>Extraction site</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-6 bg-indigo-700" />
        <span>Pipeline (operating)</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-6 bg-indigo-300" />
        <span>Pipeline (in-construction)</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-blue-700" />
        <span>Refinery (size = capacity)</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-0.5 w-6 bg-cyan-600" />
        <span>Gas pipeline (operating)</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-teal-600" />
        <span>LNG terminal (size = capacity)</span>
      </div>
    </div>
  );
}
