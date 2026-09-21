import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AsOfChip } from "@/components/ui/AsOfChip";

describe("AsOfChip", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing at the latest year", () => {
    const { container } = render(
      <AsOfChip year={2024} latestYear={2024} onViewLatest={() => undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("names the pinned year a link arrived with", () => {
    render(<AsOfChip year={2010} latestYear={2024} onViewLatest={() => undefined} />);
    const chip = screen.getByTestId("as-of-chip");
    expect(chip.textContent).toContain("As of");
    expect(chip.textContent).toContain("2010");
  });

  it("'View latest' is a real button that asks for the latest year", () => {
    const onViewLatest = vi.fn();
    render(<AsOfChip year={1998} latestYear={2024} onViewLatest={onViewLatest} />);
    fireEvent.click(screen.getByRole("button", { name: /view latest/i }));
    expect(onViewLatest).toHaveBeenCalledTimes(1);
  });
});
