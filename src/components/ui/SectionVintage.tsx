"use client";
import type { SectionVintageInfo } from "@/lib/data/section-vintage";

export interface SectionVintageLineProps {
  /** Null while nothing is catalogued for the section — then nothing renders. */
  readonly info: SectionVintageInfo | null;
  /** Suffix for the `data-testid`, e.g. "trade" → `section-vintage-trade`. */
  readonly id: string;
  /** One more dated input this section's numbers rest on ("route shares dated 2013–2025"). */
  readonly extra?: string | null | undefined;
}

/**
 * The small line under a panel section saying which source its numbers come
 * from and when that data ends (`src/lib/data/section-vintage.ts`).
 *
 * Deliberately one line at 11px in slate-600 — dark enough to clear 4.5:1 on
 * the panel's translucent white, quiet enough that the numbers above it still
 * lead. The "old" note rides on `title`, not on a second line.
 */
export function SectionVintageLine({ info, id, extra }: SectionVintageLineProps) {
  if (info === null) return null;
  return (
    <p
      className="mt-1 text-[11px] leading-snug text-slate-600"
      data-testid={`section-vintage-${id}`}
      title={info.title ?? undefined}
    >
      {info.text}
      {extra !== null && extra !== undefined && extra !== "" ? ` · ${extra}` : ""}
    </p>
  );
}
