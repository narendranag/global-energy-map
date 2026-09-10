import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { YearSlider } from "@/components/time-slider/YearSlider";
import { PLAY_STEP_MS } from "@/components/time-slider/timeline";

function Harness({ initial, onChange }: { initial: number; onChange?: (y: number) => void }) {
  const [year, setYear] = useState(initial);
  return (
    <YearSlider
      min={1990}
      max={2024}
      value={year}
      onChange={(y) => {
        onChange?.(y);
        setYear(y);
      }}
    />
  );
}

const slider = () => screen.getByRole("slider");

describe("YearSlider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps a single native range input with the year range", () => {
    render(<Harness initial={2020} />);
    expect(slider()).toHaveAttribute("min", "1990");
    expect(slider()).toHaveAttribute("max", "2024");
    expect(slider()).toHaveValue("2020");
    expect(screen.getAllByRole("slider")).toHaveLength(1);
  });

  it("±1 buttons step and disable at the ends", () => {
    render(<Harness initial={2023} />);
    fireEvent.click(screen.getByRole("button", { name: "Next year" }));
    expect(slider()).toHaveValue("2024");
    expect(screen.getByRole("button", { name: "Next year" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous year" }));
    expect(slider()).toHaveValue("2023");
  });

  it("plays one year per step and stops at the last year", () => {
    render(<Harness initial={2021} />);
    fireEvent.click(screen.getByRole("button", { name: "Play through years" }));
    expect(screen.getByRole("button", { name: "Pause" })).toHaveAttribute("aria-pressed", "true");
    act(() => {
      vi.advanceTimersByTime(PLAY_STEP_MS);
    });
    expect(slider()).toHaveValue("2022");
    act(() => {
      vi.advanceTimersByTime(PLAY_STEP_MS);
    });
    act(() => {
      vi.advanceTimersByTime(PLAY_STEP_MS);
    });
    expect(slider()).toHaveValue("2024");
    act(() => {
      vi.advanceTimersByTime(PLAY_STEP_MS);
    });
    expect(screen.getByRole("button", { name: "Play through years" })).toHaveAttribute("aria-pressed", "false");
    act(() => {
      vi.advanceTimersByTime(PLAY_STEP_MS * 3);
    });
    expect(slider()).toHaveValue("2024");
  });

  it("play at the end restarts from the first year", () => {
    const onChange = vi.fn();
    render(<Harness initial={2024} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Play through years" }));
    expect(onChange).toHaveBeenCalledWith(1990);
  });

  it("any manual change pauses playback", () => {
    render(<Harness initial={2000} />);
    fireEvent.click(screen.getByRole("button", { name: "Play through years" }));
    fireEvent.change(slider(), { target: { value: "2010" } });
    expect(screen.getByRole("button", { name: "Play through years" })).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(PLAY_STEP_MS * 3);
    });
    expect(slider()).toHaveValue("2010");
  });

  it("shows the reserves note when given", () => {
    render(<YearSlider min={1990} max={2024} value={2022} onChange={() => undefined} note="Reserves: 2020 value" />);
    expect(screen.getByTestId("year-note")).toHaveTextContent("Reserves: 2020 value");
    expect(slider()).toHaveAttribute("aria-describedby", screen.getByTestId("year-note").id);
  });
});
