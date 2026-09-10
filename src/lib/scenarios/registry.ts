import type { Commodity, ScenarioId } from "./types";

export interface ScenarioDef {
  readonly id: ScenarioId;
  readonly label: string;
  readonly kind: "chokepoint" | "pipeline";
  readonly commodities: readonly Commodity[];
  readonly description: string;
  /** Commodity-specific description; falls back to `description`. */
  readonly descriptionByCommodity?: Partial<Record<Commodity, string>>;
  /** Used in metric definitions: "… routed through {routeName}". */
  readonly routeName: string;
  readonly noteRecentYears?: string;
}

export function scenarioDescription(def: ScenarioDef, commodity: Commodity): string {
  return def.descriptionByCommodity?.[commodity] ?? def.description;
}

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: "hormuz",
    label: "Close Strait of Hormuz",
    kind: "chokepoint",
    commodities: ["oil", "gas"],
    description:
      "Strait between the Persian Gulf and the Gulf of Oman; about 20% of global oil traded by sea transits here. Closure stops nearly all crude exports from Iran, Iraq, Kuwait, Qatar, Bahrain and most from Saudi Arabia and UAE (some bypass via East-West and Fujairah).",
    descriptionByCommodity: {
      gas: "Strait between the Persian Gulf and the Gulf of Oman. All LNG exported from Qatar and the UAE (Das Island) — roughly 20% of global LNG trade — must transit here; unlike crude, there is no pipeline bypass for LNG cargoes.",
    },
    routeName: "the Strait of Hormuz",
    noteRecentYears:
      "BACI suppresses Iran exports in 2023+. Recent-year impact for partners that historically imported Iranian crude may be understated.",
  },
  {
    id: "druzhba",
    label: "Cut Druzhba pipeline",
    kind: "pipeline",
    commodities: ["oil"],
    description:
      "Soviet-era pipeline carrying Russian crude to Belarus, Poland, Germany (mostly halted 2023), Slovakia, Hungary, and Czechia. Southern branch remains active under EU sanctions exemptions.",
    routeName: "the Druzhba pipeline",
  },
  {
    id: "btc",
    label: "Cut Baku-Tbilisi-Ceyhan",
    kind: "pipeline",
    commodities: ["oil"],
    description:
      "Carries ~90% of Azerbaijani crude from the Caspian to the Mediterranean via Georgia and Turkey, bypassing Russia and the Bosporus.",
    routeName: "the Baku-Tbilisi-Ceyhan pipeline",
  },
  {
    id: "cpc",
    label: "Cut Caspian Pipeline Consortium",
    kind: "pipeline",
    commodities: ["oil"],
    description:
      "Moves ~80% of Kazakh crude (and ~10% of Russian crude) to Novorossiysk on the Black Sea. Has been disrupted multiple times by Russian regulatory and infrastructure decisions.",
    routeName: "the CPC pipeline",
  },
];

export function getScenario(id: ScenarioId): ScenarioDef {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`unknown scenario: ${id}`);
  return found;
}
