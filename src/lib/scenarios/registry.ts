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
  /** A known BACI gap that understates the scenario from `fromYear` on (oil axis). */
  readonly sourceGap?: { readonly fromYear: number; readonly text: string };
}

export function scenarioDescription(def: ScenarioDef, commodity: Commodity): string {
  return def.descriptionByCommodity?.[commodity] ?? def.description;
}

/** The scenario's source-gap warning if it applies to (commodity, year), else null. */
export function sourceGapNote(def: ScenarioDef, commodity: Commodity, year: number): string | null {
  const gap = def.sourceGap;
  return gap !== undefined && commodity === "oil" && year >= gap.fromYear ? gap.text : null;
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
    sourceGap: {
      fromYear: 2019,
      text: "BACI records little Iranian crude from 2019 (about 4 Mt in 2020–21, near zero in 2023–24) while sanctioned cargoes are relabelled, e.g. as Malaysian. Exposure of Iran's buyers, China above all, is understated.",
    },
  },
  {
    id: "druzhba",
    label: "Cut Druzhba pipeline",
    kind: "pipeline",
    commodities: ["oil"],
    description:
      "Soviet-era pipeline carrying Russian crude to Belarus, Poland, Germany (mostly halted 2023), Slovakia, Hungary, and Czechia. Southern branch remains active under EU sanctions exemptions.",
    routeName: "the Druzhba pipeline",
    sourceGap: {
      fromYear: 2022,
      text: "BACI records no Russian crude into Belarus from 2022 (16 Mt in 2021), so Belarus, Druzhba's largest single buyer, drops out of the results from 2022.",
    },
  },
  {
    id: "btc",
    label: "Cut Baku-Tbilisi-Ceyhan",
    kind: "pipeline",
    commodities: ["oil"],
    description:
      "Carries about 83% of Azerbaijan's oil exports from the Caspian to the Mediterranean via Georgia and Turkey, bypassing Russia and the Bosporus.",
    routeName: "the Baku-Tbilisi-Ceyhan pipeline",
  },
  {
    id: "cpc",
    label: "Cut Caspian Pipeline Consortium",
    kind: "pipeline",
    commodities: ["oil"],
    description:
      "Moves about 80% of Kazakhstan's crude exports (plus a small Russian volume, ~3.5% of Russia's crude exports) to Novorossiysk on the Black Sea. Has been disrupted multiple times by Russian regulatory and infrastructure decisions.",
    routeName: "the CPC pipeline",
  },
];

/** First and last year LNG-T3 voyages cover (per-terminal attribution). */
export const LNG_T3_FIRST_YEAR = 2020;
export const LNG_T3_LAST_YEAR = 2024;

/** Mean crude conversion used for volume display (EI Statistical Review: 1 t ≈ 7.33 bbl). */
export const BARRELS_PER_TONNE_CRUDE = 7.33;

/**
 * Plain-language steps behind the scenario numbers, for the panel's
 * "How this is computed" disclosure. Mirrors engine.ts / refinery.ts /
 * lng.ts / lng-t3.ts — change those and this text must follow.
 */
export function howComputed(def: ScenarioDef, commodity: Commodity, year: number): readonly string[] {
  const noun = commodity === "gas" ? "LNG (HS 271111)" : "crude (HS 2709)";
  const shareRule =
    def.kind === "chokepoint"
      ? `Each exporter has one share: the fraction of its exports that transits ${def.routeName}. It applies to every importer except buyers inside the Gulf, whose cargoes never cross the strait (share 0 for those pairs). Imports into the Gulf from outside are not counted.`
      : `Shares are set per exporter → importer pair (or per exporter where the pipeline serves all its buyers).`;
  const steps = [
    `Take ${year.toString()} bilateral ${noun} imports by volume (tonnes) from BACI (CEPII).`,
    shareRule,
    `An importer's volume at risk = Σ over its suppliers of (imports from that supplier × route share). % at risk = volume at risk ÷ its total ${noun} imports.`,
  ];
  if (commodity === "oil") {
    steps.push(
      "Refineries: a country's imports are split across its refineries by capacity (evenly where no refinery has capacity data), then the same shares apply. Refineries without capacity in the source are not ranked.",
      `Volumes shown in kb/d use ${BARRELS_PER_TONNE_CRUDE.toString()} barrels per tonne.`,
    );
  } else {
    const inT3 = year >= LNG_T3_FIRST_YEAR && year <= LNG_T3_LAST_YEAR;
    steps.push(
      inT3
        ? `Terminals (${LNG_T3_FIRST_YEAR.toString()}–${LNG_T3_LAST_YEAR.toString()}): LNG-T3 voyage data (a partial AIS sample) gives each terminal's share of its country's arrivals and its supplier mix; the BACI country total is split by those shares. Terminals in countries with no voyage coverage fall back to a split by capacity ("capacity proxy").`
        : `Terminals: the BACI country total is split across the country's import terminals by capacity ("capacity proxy"); per-terminal voyage data only covers ${LNG_T3_FIRST_YEAR.toString()}–${LNG_T3_LAST_YEAR.toString()}.`,
      `Terminals not yet in service in ${year.toString()} get no share: those still under construction, or commissioned later, unless they took cargoes that year.`,
      "Volumes shown in Mt (million tonnes per year).",
    );
  }
  return steps;
}

/**
 * Which `disruption_route` rows a scenario reads. Hormuz on the gas axis uses
 * its own LNG shares (`hormuz_lng`): the UAE's crude bypass carries no LNG.
 */
export function routeKeyFor(scenarioId: ScenarioId, commodity: Commodity): string {
  return scenarioId === "hormuz" && commodity === "gas" ? "hormuz_lng" : scenarioId;
}

export function getScenario(id: ScenarioId): ScenarioDef {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`unknown scenario: ${id}`);
  return found;
}
