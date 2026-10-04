import { afterEach, describe, expect, it } from "vitest";
import { readChoice, setChoice } from "@/components/analytics/consent";
import { setAnalyticsActive } from "@/components/analytics/track";

afterEach(() => {
  setAnalyticsActive(false);
  localStorage.clear();
  delete window.dataLayer;
});

describe("consent choice", () => {
  it("is null until a choice is stored, and can be forgotten", () => {
    expect(readChoice()).toBeNull();
    setChoice("granted");
    expect(readChoice()).toBe("granted");
    setChoice(null);
    expect(readChoice()).toBeNull();
  });

  it("sends a consent update for analytics storage only", () => {
    setAnalyticsActive(true);
    setChoice("granted");
    const pushed = window.dataLayer?.[0] as ArrayLike<unknown>;
    expect([pushed[0], pushed[1], pushed[2]]).toEqual(["consent", "update", { analytics_storage: "granted" }]);
  });
});
