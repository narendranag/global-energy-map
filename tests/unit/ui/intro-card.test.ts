import { describe, it, expect } from "vitest";
import { hasExplicitState } from "@/components/ui/IntroCard";

describe("hasExplicitState", () => {
  it("returns false for a bare slash", () => {
    expect(hasExplicitState("")).toBe(false);
  });

  it("returns false for only a mode parameter", () => {
    expect(hasExplicitState("mode=infrastructure")).toBe(false);
    expect(hasExplicitState("mode=flows")).toBe(false);
    expect(hasExplicitState("mode=scenarios")).toBe(false);
  });

  it("returns false for mode with a leading question mark", () => {
    expect(hasExplicitState("?mode=flows")).toBe(false);
  });

  it("returns true when scenario parameter is present", () => {
    expect(hasExplicitState("scenario=hormuz")).toBe(true);
    expect(hasExplicitState("mode=scenarios&scenario=hormuz")).toBe(true);
    expect(hasExplicitState("?scenario=hormuz")).toBe(true);
  });

  it("returns true when layers parameter is present", () => {
    expect(hasExplicitState("layers=reserves")).toBe(true);
    expect(hasExplicitState("layers=")).toBe(true);
    expect(hasExplicitState("layers=reserves,pipelines")).toBe(true);
    expect(hasExplicitState("mode=flows&layers=gas_pipelines")).toBe(true);
  });

  it("returns true when year parameter is present", () => {
    expect(hasExplicitState("year=2023")).toBe(true);
    expect(hasExplicitState("mode=flows&year=2020")).toBe(true);
  });

  it("returns true when commodity parameter is present", () => {
    expect(hasExplicitState("commodity=gas")).toBe(true);
    expect(hasExplicitState("commodity=oil")).toBe(true);
    expect(hasExplicitState("mode=flows&commodity=gas")).toBe(true);
  });

  it("returns true when lon parameter is present", () => {
    expect(hasExplicitState("lon=50.5")).toBe(true);
    expect(hasExplicitState("mode=infrastructure&lon=20")).toBe(true);
  });

  it("returns true when lat parameter is present", () => {
    expect(hasExplicitState("lat=25.0")).toBe(true);
    expect(hasExplicitState("mode=flows&lat=45")).toBe(true);
  });

  it("returns true when z parameter is present", () => {
    expect(hasExplicitState("z=5")).toBe(true);
    expect(hasExplicitState("mode=infrastructure&z=3.5")).toBe(true);
  });

  it("returns true when multiple explicit state parameters are present", () => {
    expect(hasExplicitState("mode=scenarios&scenario=hormuz&year=2024")).toBe(true);
    expect(hasExplicitState("year=2023&commodity=gas&layers=gas_pipelines")).toBe(true);
    expect(hasExplicitState("lon=50&lat=25&z=4")).toBe(true);
  });

  it("handles question mark prefix correctly", () => {
    expect(hasExplicitState("?mode=scenarios&scenario=hormuz&year=2024")).toBe(true);
    expect(hasExplicitState("?layers=reserves")).toBe(true);
  });

  it("ignores unknown parameters", () => {
    expect(hasExplicitState("mode=flows&unknown=value")).toBe(false);
    expect(hasExplicitState("mode=flows&foo=bar&baz=qux")).toBe(false);
  });
});
