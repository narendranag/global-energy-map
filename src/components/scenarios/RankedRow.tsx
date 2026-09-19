"use client";
/**
 * A ranked row in the scenario panel, as a real button (S1): pointing at it
 * highlights the thing on the map, activating it takes the map there. Pointer
 * and keyboard both highlight — `onFocus`/`onBlur` alongside the pointer
 * handlers — so tabbing the list is as informative as hovering it, and the
 * highlight is cleared only by whoever set it (`clearScenarioHover`), because
 * the next row's enter can arrive before this row's leave.
 *
 * It lives in its own file so the unmount rule below can be unit-tested
 * without mounting the whole panel.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { clearScenarioHover, setScenarioHover, type ScenarioHover } from "./hover";

export function RankedRow({
  hover,
  active,
  onActivate,
  title,
  children,
}: {
  hover: ScenarioHover;
  /** True while this row's subject is the highlighted one (from either end). */
  active: boolean;
  onActivate: () => void;
  title: string;
  children: ReactNode;
}) {
  const enter = () => { setScenarioHover(hover); };
  const leave = () => { clearScenarioHover(hover); };

  // A row can disappear from under the pointer — "Show top 6 only", a year or
  // severity change that re-ranks the list, switching to the exporter view —
  // and no `pointerleave` is delivered for an element that is removed. The
  // map was then left highlighting a country nothing on screen points at
  // (finding 15). The clear is ownership-checked, so a row that has already
  // handed the hover to its neighbour clears nothing.
  const owned = useRef(hover);
  useEffect(() => { owned.current = hover; }, [hover]);
  useEffect(() => () => { clearScenarioHover(owned.current); }, []);

  return (
    <button
      type="button"
      title={title}
      onClick={onActivate}
      onPointerEnter={enter}
      onPointerLeave={leave}
      onFocus={enter}
      onBlur={leave}
      className={`block w-full rounded px-1 py-0.5 text-left text-xs hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-700 ${
        active ? "bg-slate-200" : ""
      }`}
    >
      {children}
    </button>
  );
}
