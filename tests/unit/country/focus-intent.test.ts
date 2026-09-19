import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FOCUS_INTENT_TTL_MS,
  isKeyboardClick,
  setFocusIntent,
  takeFocusIntent,
} from "@/components/country/focus-intent";

/**
 * B6. The intent is set just before a focus change is dispatched and read by
 * the country panel's `[iso3]` effect. When the dispatch does *not* change
 * `iso3` — a keyboard activation of the row for the country already selected —
 * the effect never runs and the flag stayed pending, so the *next* selection,
 * made with the mouse, moved focus into the panel (WCAG 3.2.1).
 */
describe("focus intent expiry (B6)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    takeFocusIntent();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads back a keyboard intent declared just now", () => {
    setFocusIntent("keyboard");
    expect(takeFocusIntent()).toBe("keyboard");
  });

  it("is consumed once", () => {
    setFocusIntent("keyboard");
    takeFocusIntent();
    expect(takeFocusIntent()).toBe("pointer");
  });

  it("expires when nothing consumed it", () => {
    setFocusIntent("keyboard");
    vi.advanceTimersByTime(FOCUS_INTENT_TTL_MS + 1);
    expect(takeFocusIntent()).toBe("pointer");
  });

  it("a later pointer declaration overrides an unconsumed keyboard one", () => {
    setFocusIntent("keyboard");
    setFocusIntent("pointer");
    expect(takeFocusIntent()).toBe("pointer");
  });
});

describe("isKeyboardClick", () => {
  it("reads a synthetic (detail 0) click as keyboard", () => {
    expect(isKeyboardClick({ detail: 0 })).toBe(true);
    expect(isKeyboardClick({ detail: 1 })).toBe(false);
  });
});
