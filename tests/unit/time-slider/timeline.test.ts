import { describe, expect, it } from "vitest";
import { nextPlayYear, playStartYear, stepYear, tickLeft, yearTicks } from "@/components/time-slider/timeline";

describe("yearTicks", () => {
  const ticks = yearTicks(1990, 2024);

  it("has one tick per year, from 0 to 1 along the track", () => {
    expect(ticks).toHaveLength(35);
    expect(ticks[0]).toMatchObject({ year: 1990, at: 0 });
    expect(ticks.at(-1)).toMatchObject({ year: 2024, at: 1 });
  });

  it("labels decades and both ends", () => {
    expect(ticks.filter((t) => t.label !== null).map((t) => t.label)).toEqual([
      "1990",
      "2000",
      "2010",
      "2020",
      "2024",
    ]);
  });

  it("drops a decade label that would crowd the end label", () => {
    expect(yearTicks(1990, 2021).filter((t) => t.label).map((t) => t.label)).toEqual([
      "1990",
      "2000",
      "2010",
      "2021",
    ]);
  });
});

describe("stepping and playback", () => {
  it("steps clamp to the range", () => {
    expect(stepYear(2000, 1, 1990, 2024)).toBe(2001);
    expect(stepYear(2024, 1, 1990, 2024)).toBe(2024);
    expect(stepYear(1990, -1, 1990, 2024)).toBe(1990);
  });

  it("play restarts from the beginning only when already at the end", () => {
    expect(playStartYear(2005, 1990, 2024)).toBe(2005);
    expect(playStartYear(2024, 1990, 2024)).toBe(1990);
  });

  it("playback advances one year and stops at max", () => {
    expect(nextPlayYear(2022, 2024)).toBe(2023);
    expect(nextPlayYear(2024, 2024)).toBeNull();
  });

  it("tick positions compensate for the thumb inset", () => {
    expect(tickLeft(0)).toBe("calc(8px + (100% - 16px) * 0)");
    expect(tickLeft(1)).toBe("calc(8px + (100% - 16px) * 1)");
  });
});
