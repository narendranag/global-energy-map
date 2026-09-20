import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RankedRow } from "@/components/scenarios/RankedRow";
import {
  getScenarioHover,
  resetScenarioHoverForTests,
  setScenarioHover,
} from "@/components/scenarios/hover";

function List({ rows }: { rows: readonly string[] }) {
  return (
    <ol>
      {rows.map((iso3) => (
        <li key={iso3}>
          <RankedRow
            hover={{ kind: "country", iso3 }}
            active={false}
            onActivate={() => undefined}
            title={iso3}
          >
            {iso3}
          </RankedRow>
        </li>
      ))}
    </ol>
  );
}

beforeEach(() => {
  resetScenarioHoverForTests();
});

afterEach(() => {
  cleanup();
});

/**
 * Finding 15: no `pointerleave` is delivered for an element that is removed,
 * so a row that disappeared from under the pointer ("Show top 6 only", a
 * re-rank, switching to the exporter view) left the map highlighting a
 * country nothing on screen pointed at.
 */
describe("RankedRow hover ownership", () => {
  it("clears the highlight when the hovered row unmounts", () => {
    const { rerender } = render(<List rows={["JPN", "KOR"]} />);
    fireEvent.pointerEnter(screen.getByRole("button", { name: "JPN" }));
    expect(getScenarioHover()).toEqual({ kind: "country", iso3: "JPN" });

    rerender(<List rows={["KOR"]} />);
    expect(getScenarioHover()).toBeNull();
  });

  it("does not clear a highlight another row owns", () => {
    const { rerender } = render(<List rows={["JPN", "KOR"]} />);
    // KOR is hovered; JPN is the row that goes away.
    fireEvent.pointerEnter(screen.getByRole("button", { name: "KOR" }));
    rerender(<List rows={["KOR"]} />);
    expect(getScenarioHover()).toEqual({ kind: "country", iso3: "KOR" });
  });

  it("does not clear a highlight the map set after the pointer left", () => {
    const { rerender } = render(<List rows={["JPN"]} />);
    const row = screen.getByRole("button", { name: "JPN" });
    fireEvent.pointerEnter(row);
    fireEvent.pointerLeave(row);
    // The map is now hovering something else.
    setScenarioHover({ kind: "country", iso3: "DEU" });
    rerender(<List rows={[]} />);
    expect(getScenarioHover()).toEqual({ kind: "country", iso3: "DEU" });
  });

  it("leaves nothing behind when the whole list unmounts", () => {
    const { unmount } = render(<List rows={["JPN", "KOR"]} />);
    fireEvent.pointerEnter(screen.getByRole("button", { name: "KOR" }));
    unmount();
    expect(getScenarioHover()).toBeNull();
  });

  it("still highlights and clears on keyboard focus", () => {
    render(<List rows={["JPN"]} />);
    const row = screen.getByRole("button", { name: "JPN" });
    fireEvent.focus(row);
    expect(getScenarioHover()).toEqual({ kind: "country", iso3: "JPN" });
    fireEvent.blur(row);
    expect(getScenarioHover()).toBeNull();
  });
});
